"use client";

/* ============================================================
   Task 114: МАССОВАЯ ОПТИМИЗАЦИЯ МЕДИА (товары)
   Две кнопки на странице «Товары»:
     • Видео — друг за дружкой прогоняет все видео из /uploads
       через штатный «Сжать» (mov/m4v → mp4, mp4 → перекодирование);
     • Картинки — конвертирует jpg/jpeg/png в WebP.
   По ходу — прогресс; в конце — отчёт «сколько весили до /
   сколько стали» с суммой и скачиванием CSV.
   Каждый файл обрабатывается ОТДЕЛЬНЫМ запросом к уже проверенным
   эндпоинтам (/files/compress, /files/compress-image): таймауты
   shared-хостинга не страшны, ссылки в базе переписывает сервер.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Kind = "video" | "image";

interface MediaEntry {
  name: string;
  folder: string;
  url: string;
  size: number;
  mtime: number;
  used?: boolean;
}

interface RunResult {
  url: string;
  name: string;
  before: number;
  after: number;
  ok: boolean;
  skipped: boolean; // «уже сжато», «не тяжелеет» — не ошибка
  message: string;
  newUrl?: string;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

export function MassMediaOptimizer() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [entries, setEntries] = useState<MediaEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /* null = авто-выбор (видео без mp4 / все картинки), иначе ручные галочки */
  const [manualSelected, setManualSelected] = useState<Set<string> | null>(null);
  const [includeMp4, setIncludeMp4] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [current, setCurrent] = useState("");
  const [results, setResults] = useState<RunResult[] | null>(null);
  const stopFlagRef = useRef(false);

  const open = (k: Kind) => {
    setKind(k);
    setEntries(null);
    setLoadError(null);
    setResults(null);
    setRunning(false);
    setManualSelected(null);
    setProgress({ done: 0, total: 0 });
    setCurrent("");
  };
  const close = () => { if (!running) setKind(null); };

  /* Загрузка списка при открытии окна */
  useEffect(() => {
    if (!kind || entries !== null) return;
    let alive = true;
    (async () => {
      try {
        const url = kind === "video"
          ? `${API_URL}/admin/files/videos?folder=`
          : `${API_URL}/admin/files/images?folder=`;
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setLoadError(json.error ?? `Ошибка ${res.status}`);
          setEntries([]);
          return;
        }
        const list: MediaEntry[] = (json.data?.entries ?? []) as MediaEntry[];
        setEntries(list);
      } catch {
        if (alive) { setLoadError("Ошибка сети"); setEntries([]); }
      }
    })();
    return () => { alive = false; };
  }, [kind, entries]);

  function extOf(url: string): string {
    return url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  }

  /* Итоговый выбор: авто (mov/m4v, mp4 — только с галочкой) или ручные галочки */
  const selected = useMemo(() => {
    if (entries === null) return new Set<string>();
    if (manualSelected !== null) return manualSelected;
    return new Set(
      entries.map((e) => e.url).filter((u) => kind === "image" || extOf(u) !== "mp4" || includeMp4)
    );
  }, [entries, manualSelected, kind, includeMp4]);

  const chosen = useMemo(() => {
    if (entries === null) return [];
    return entries.filter((e) => selected.has(e.url));
  }, [entries, selected]);

  const totalSize = chosen.reduce((s, e) => s + e.size, 0);

  function toggle(url: string) {
    if (running) return;
    const next = new Set(selected);
    if (next.has(url)) next.delete(url); else next.add(url);
    setManualSelected(next);
  }

  /* Отчёт: съеденное место считается только по успешно конвертированным */
  const report = useMemo(() => {
    if (!results) return null;
    const ok = results.filter((r) => r.ok);
    const skipped = results.filter((r) => !r.ok && r.skipped);
    const failed = results.filter((r) => !r.ok && !r.skipped);
    const before = ok.reduce((s, r) => s + r.before, 0);
    const after = ok.reduce((s, r) => s + r.after, 0);
    return { ok, skipped, failed, before, after, saved: Math.max(0, before - after) };
  }, [results]);

  function downloadCsv() {
    if (!results || !kind) return;
    const rows = [
      ["файл", "статус", "до, байт", "после, байт", "экономия, байт", "стало"],
      ...results.map((r) => [
        r.name,
        r.ok ? "оптимизировано" : r.skipped ? "пропущено" : "ошибка",
        String(r.before),
        String(r.ok ? r.after : r.before),
        String(r.ok ? Math.max(0, r.before - r.after) : 0),
        r.newUrl ?? "",
      ]),
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lakomka-${kind === "video" ? "video" : "webp"}-report.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function run() {
    if (!kind || chosen.length === 0) return;
    stopFlagRef.current = false;
    setRunning(true);
    setResults(null);
    const acc: RunResult[] = [];
    setProgress({ done: 0, total: chosen.length });
    for (let i = 0; i < chosen.length; i++) {
      if (stopFlagRef.current) break;
      const e = chosen[i];
      setCurrent(e.name);
      setProgress({ done: i, total: chosen.length });
      try {
        const endpoint = kind === "video" ? "files/compress" : "files/compress-image";
        const res = await fetch(`${API_URL}/admin/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ url: e.url }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.data?.ok) {
          acc.push({
            url: e.url, name: e.name,
            before: json.data.before ?? 0, after: json.data.after ?? 0,
            ok: true, skipped: false,
            message: json.data.note ?? "готово",
            newUrl: json.data.url,
          });
        } else {
          const msg = json.error ?? `Ошибка ${res.status}`;
          /* «уже сжато / не меньше оригинала / недоступен ffmpeg» — пропуск,
             а не сбой: файл остался как есть, повторять не нужно */
          const skipped = /уже|не меньше|не удалось перекодировать|ffmpeg на сервере недоступен/i.test(msg)
            && res.status === 422;
          acc.push({ url: e.url, name: e.name, before: e.size, after: e.size, ok: false, skipped, message: msg });
        }
      } catch {
        acc.push({ url: e.url, name: e.name, before: e.size, after: e.size, ok: false, skipped: false, message: "Ошибка сети" });
      }
      setResults([...acc]);
      setProgress({ done: i + 1, total: chosen.length });
    }
    setCurrent("");
    setRunning(false);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-3">
        <span className="mr-1 text-sm font-medium text-[var(--color-heading)]">Массовая оптимизация:</span>
        <button type="button" onClick={() => open("video")}
          className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white">
          🎬 Видео
        </button>
        <button type="button" onClick={() => open("image")}
          className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white">
          🖼 Картинки → WebP
        </button>
        <span className="text-xs text-[var(--color-muted)]">
          файлы обрабатываются друг за другом, в конце — отчёт «до/после»
        </span>
      </div>

      {kind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
          <div role="dialog" aria-modal="true"
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[var(--radius-card)] bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-[var(--color-heading)]">
                {kind === "video" ? "Массовая оптимизация видео" : "Картинки → WebP"}
              </h2>
              <button onClick={close} disabled={running} aria-label="Закрыть"
                className="-mt-1 text-2xl leading-none text-gray-400 hover:text-gray-700 disabled:opacity-40">×</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm">
              {entries === null && !loadError && <p className="text-[var(--color-muted)]">Загружаем список файлов…</p>}
              {loadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{loadError}</div>
              )}

              {entries !== null && !running && (
                <>
                  {kind === "video" && entries.some((e) => (e.url.split(".").pop()?.toLowerCase() ?? "") === "mp4") && (
                    <label className="mb-3 flex items-center gap-2 text-xs text-[var(--color-body)]">
                      <input type="checkbox" checked={includeMp4}
                        onChange={(e) => setIncludeMp4(e.target.checked)} />
                      включить уже готовые mp4 (перекодировать заново; выигрыш меньше 10 % не считается — файл останется как есть)
                    </label>
                  )}
                  <p className="mb-2 text-xs text-[var(--color-muted)]">
                    Выбрано: <b>{chosen.length}</b> из {entries.length} · общий размер {fmtSize(totalSize)}
                    <button type="button"
                      className="ml-2 underline decoration-dotted"
                      onClick={() => setManualSelected(new Set(entries.map((e) => e.url)))}>выбрать всё</button>
                    <button type="button"
                      className="ml-2 underline decoration-dotted"
                      onClick={() => setManualSelected(new Set())}>снять все</button>
                  </p>
                  {entries.length === 0 ? (
                    <p className="text-[var(--color-muted)]">
                      {kind === "video"
                        ? "Видео в /uploads не найдено."
                        : "Картинок jpg/jpeg/png в /uploads не найдено — всё уже в WebP."}
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)]">
                      {entries.map((e) => (
                        <li key={e.url} className="flex items-center gap-3 px-3 py-2">
                          <input type="checkbox" checked={selected.has(e.url)}
                            onChange={() => toggle(e.url)} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate" title={e.url}>
                            {e.name}
                            {e.folder && <span className="ml-1 text-xs text-[var(--color-muted)]">({e.folder}/)</span>}
                            {e.used === false && <span className="ml-1 text-xs text-amber-600">— не подключена к товарам</span>}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--color-muted)]">{fmtSize(e.size)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4">
                    <button type="button" disabled={chosen.length === 0}
                      onClick={run}
                      className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
                      Оптимизировать {chosen.length > 0 ? `(${chosen.length})` : ""}
                    </button>
                  </div>
                </>
              )}

              {running && (
                <div>
                  <p className="mb-2 text-[var(--color-body)]">
                    Обрабатываем <b>{current || "…"}</b> ({progress.done} из {progress.total})
                  </p>
                  <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-soft)]">
                    <div className="h-full bg-[var(--color-primary)] transition-all"
                      style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
                  </div>
                  <div className="mb-3">
                    <button type="button" onClick={() => { stopFlagRef.current = true; }}
                      className="rounded-[var(--radius-btn)] border border-red-300 px-4 py-1.5 text-sm text-red-600 hover:bg-red-50">
                      Остановить (уже сделанное сохранится)
                    </button>
                  </div>
                </div>
              )}

              {report && (
                <div>
                  <h3 className="mb-2 text-base font-semibold text-[var(--color-heading)]">Отчёт</h3>
                  <div className="mb-3 rounded-[var(--radius-card)] border border-green-200 bg-green-50 p-4 text-sm">
                    <p className="font-semibold text-green-800">
                      Оптимизировано: {report.ok.length} из {results?.length ?? 0}
                      {report.skipped.length > 0 && <> · пропущено: {report.skipped.length}</>}
                      {report.failed.length > 0 && <span className="text-red-700"> · с ошибкой: {report.failed.length}</span>}
                    </p>
                    {report.ok.length > 0 && (
                      <p className="mt-1 text-green-800">
                        Вес до: <b>{fmtSize(report.before)}</b> → после: <b>{fmtSize(report.after)}</b>{" "}
                        (экономия <b>{fmtSize(report.saved)}</b>
                        {report.before > 0 && <>, {Math.round((report.saved / report.before) * 100)} %</>})
                      </p>
                    )}
                  </div>
                  <ul className="mb-3 max-h-56 space-y-1 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border)] p-3 text-xs">
                    {results?.map((r, i) => (
                      <li key={`${r.url}-${i}`} className="flex items-start gap-2">
                        <span className={r.ok ? "text-green-600" : r.skipped ? "text-amber-600" : "text-red-600"}>
                          {r.ok ? "✓" : r.skipped ? "–" : "✗"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b>{r.name}</b>
                          {r.ok && <span className="text-[var(--color-muted)]"> — {fmtSize(r.before)} → {fmtSize(r.after)}</span>}
                          {!r.ok && <span className="text-[var(--color-muted)]"> — {r.message}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={downloadCsv}
                      className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white">
                      ⬇ Скачать отчёт (CSV)
                    </button>
                    <button type="button" onClick={() => { setResults(null); setEntries(null); }}
                      className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-1.5 text-sm hover:bg-[var(--color-bg-soft)]">
                      Прогнать снова
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
