"use client";

/* Панель загрузок админки: двухэтапное скачивание с живым прогрессом
 * прямо на странице. Этап 1 — файл собирается во внутреннем хранилище
 * браузера (виден %, скорость, остаток); этап 2 — мгновенное сохранение
 * на диск через стандартный менеджер загрузок.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DownloadCanceled,
  startTwoStageDownload,
  type DownloadStage,
  type TwoStageHandle,
} from "@/lib/download-with-progress";
import { cleanupOrphanSpools } from "@/lib/download-spool";

interface DownloadItem {
  id: number;
  name: string;
  stage: DownloadStage;
  status: "active" | "done" | "error" | "canceled";
  received: number;
  total: number;
  speed: number; // байт/с
  error?: string;
}

interface DownloadsContextValue {
  start(opts: { url: string; name: string }): void;
  items: DownloadItem[];
  activeCount: number;
}

const DownloadsContext = createContext<DownloadsContextValue | null>(null);

export function useDownloads(): DownloadsContextValue {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error("useDownloads вне DownloadsProvider");
  return ctx;
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + " ГБ";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " МБ";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " КБ";
  return Math.round(bytes) + " Б";
}

function stageLabel(item: DownloadItem): string {
  switch (item.status) {
    case "done":
      return "Сохранено в папку «Загрузки»";
    case "canceled":
      return "Скачивание отменено";
    case "error":
      return item.error ?? "Ошибка скачивания";
    default:
      switch (item.stage) {
        case "downloading":
          return "Этап 1 · Скачиваем во временное хранилище браузера";
        case "assembling":
          return "Собираем файл из внутреннего хранилища…";
        case "saving":
          return "Этап 2 · Сохраняем на устройство…";
        default:
          return "";
      }
  }
}

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const idRef = useRef(1);
  const handlesRef = useRef<Map<number, TwoStageHandle>>(new Map());
  const timingsRef = useRef<Map<number, { t: number; received: number }>>(new Map());

  // чистим осиротевшие спулы прошлых сессий (краш/перезагрузка страницы)
  useEffect(() => {
    void cleanupOrphanSpools();
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((it) => it.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, ms: number) => {
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const start = useCallback(
    (opts: { url: string; name: string }) => {
      const id = idRef.current++;
      setItems((list) => [
        ...list,
        {
          id,
          name: opts.name,
          stage: "downloading",
          status: "active",
          received: 0,
          total: 0,
          speed: 0,
        },
      ]);

      const handle = startTwoStageDownload({
        url: opts.url,
        name: opts.name,
        onProgress: ({ received, total }) => {
          const now = performance.now();
          const prev = timingsRef.current.get(id);
          let speed = 0;
          if (!prev) {
            timingsRef.current.set(id, { t: now, received });
          } else if (now - prev.t >= 250) {
            speed = (received - prev.received) / ((now - prev.t) / 1000);
            timingsRef.current.set(id, { t: now, received });
          }
          setItems((list) =>
            list.map((it) => (it.id === id ? { ...it, received, total, speed } : it)),
          );
        },
        onStage: (stage) => {
          setItems((list) => list.map((it) => (it.id === id ? { ...it, stage } : it)));
        },
      });
      handlesRef.current.set(id, handle);

      handle.promise
        .then(() => {
          setItems((list) =>
            list.map((it) =>
              it.id === id
                ? { ...it, status: "done", stage: "done", speed: 0, received: it.total || it.received }
                : it,
            ),
          );
          scheduleDismiss(id, 8000);
        })
        .catch((e: unknown) => {
          const name = e instanceof Error ? e.name : (e as { name?: string } | null)?.name;
          const canceled = e instanceof DownloadCanceled || name === "AbortError";
          setItems((list) =>
            list.map((it) =>
              it.id === id
                ? {
                    ...it,
                    status: canceled ? "canceled" : "error",
                    speed: 0,
                    error: canceled ? undefined : e instanceof Error ? e.message : "Ошибка скачивания",
                  }
                : it,
            ),
          );
          scheduleDismiss(id, canceled ? 4000 : 10000);
        })
        .finally(() => {
          handlesRef.current.delete(id);
          timingsRef.current.delete(id);
        });
    },
    [scheduleDismiss],
  );

  const cancel = useCallback((id: number) => {
    handlesRef.current.get(id)?.cancel();
  }, []);

  const value: DownloadsContextValue = {
    start,
    items,
    activeCount: items.filter((it) => it.status === "active").length,
  };

  return (
    <DownloadsContext.Provider value={value}>
      {children}
      <DownloadsDock onCancel={cancel} onDismiss={dismiss} />
    </DownloadsContext.Provider>
  );
}

/* ── Док загрузок (правый нижний угол) ── */

function DownloadsDock({
  onCancel,
  onDismiss,
}: {
  onCancel: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const { items, activeCount } = useDownloads();
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[95] flex w-[380px] max-w-[94vw] flex-col gap-2">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="self-end rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-body)] shadow-sm hover:bg-[var(--color-bg-soft)]"
      >
        {collapsed
          ? `Загрузки (${activeCount > 0 ? activeCount : items.length})`
          : "Свернуть"}
      </button>

      {!collapsed &&
        items.map((item) => {
          const pct =
            item.total > 0 ? Math.min(100, (item.received / item.total) * 100) : null;

          const barColor =
            item.status === "done"
              ? "bg-[#2e9e5b]"
              : item.status === "error"
                ? "bg-red-500"
                : item.status === "canceled"
                  ? "bg-[var(--color-muted)]"
                  : "bg-[var(--color-primary)]";

          return (
            <div
              key={item.id}
              className="rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)]"
            >
              <div className="flex items-start gap-2">
                <FileGlyph name={item.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-heading)]">
                    {item.name}
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] leading-snug ${
                      item.status === "error" ? "text-red-600" : item.status === "done" ? "text-[#2e9e5b]" : "text-[var(--color-muted)]"
                    }`}
                  >
                    {stageLabel(item)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    item.status === "active" ? onCancel(item.id) : onDismiss(item.id)
                  }
                  title={item.status === "active" ? "Отменить" : "Скрыть"}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg-soft)] hover:text-red-600"
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-soft)]">
                {pct === null ? (
                  <div className={`h-full w-1/3 animate-pulse rounded-full ${barColor}`} />
                ) : (
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>

              {item.status === "active" && (
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                  <span>
                    {item.total > 0
                      ? `${humanSize(item.received)} из ${humanSize(item.total)}`
                      : `Скачано: ${humanSize(item.received)}`}
                  </span>
                  <SpeedEta item={item} />
                </div>
              )}
              {item.status === "done" && item.total > 0 && (
                <div className="mt-1.5 text-[11px] text-[var(--color-muted)]">
                  Размер: {humanSize(item.total)}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function SpeedEta({ item }: { item: DownloadItem }) {
  const eta =
    item.speed > 0 && item.total > 0
      ? Math.max(1, Math.round((item.total - item.received) / item.speed))
      : null;
  return (
    <span>
      {item.speed > 0 && `${humanSize(item.speed)}/с`}
      {eta !== null && ` · осталось ~${eta} с`}
    </span>
  );
}

/* Маленькая иконка файла по расширению */
function FileGlyph({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  let fill = "#8a8a88";
  if (ext === "zip") fill = "#b5651d";
  else if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) fill = "#3b82f6";
  else if (["mp4", "mov", "webm", "avi"].includes(ext)) fill = "#8b5cf6";
  else if (["csv", "xls", "xlsx"].includes(ext)) fill = "#16a34a";

  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="mt-0.5 shrink-0" aria-hidden>
      <path
        d="M5 2.5h6.2L15 6.3V17a.9.9 0 0 1-.9.9H5.9A.9.9 0 0 1 5 17V3.4c0-.5.4-.9.9-.9Z"
        fill={fill}
        opacity="0.16"
      />
      <path
        d="M5 2.5h6.2L15 6.3V17a.9.9 0 0 1-.9.9H5.9A.9.9 0 0 1 5 17V3.4c0-.5.4-.9.9-.9Z M11.2 2.5v3.8H15"
        fill="none"
        stroke={fill}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
