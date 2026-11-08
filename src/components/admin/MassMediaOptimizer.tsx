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
import { useConfirm, useToast } from "@/components/admin/Feedback";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Kind = "video" | "image";

interface MediaEntry {
  name: string;
  folder: string;
  url: string;
  size: number;
  mtime: number;
  used?: boolean;
  /* Task 122: состояние файла (ok/empty/broken — без ffmpeg) и товар
     (название + обложка) — отчёт показывает подарок, а не безликий файл */
  status?: "ok" | "empty" | "broken";
  product?: { id: number; name: string; slug: string; thumb: string | null } | null;
}

interface RunResult {
  url: string;
  name: string;
  before: number;
  after: number;
  ok: boolean;
  skipped: boolean; // «уже сжато», «не тяжелеет», «файла нет» — не ошибка
  message: string;
  newUrl?: string;
  product?: MediaEntry["product"];
  status?: MediaEntry["status"];
}

interface ZipReport {
  file: string;
  download_url: string;
  size: number;
  products: { id: number; name: string }[];
  videos_packed: number;
  images_packed: number;
  to_replace: { product: string; zip: string; url: string }[];
}

interface FixItem {
  where?: string;
  from?: string;
  to?: string;
  url?: string;
}

interface FixReport {
  checked: number;
  unchanged: number;
  converted?: FixItem[];
  fixed: FixItem[];
  lost: FixItem[];
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
  /* Task 116: починка битых ссылок на картинки (после массовой оптимизации) */
  const [fixing, setFixing] = useState(false);
  const [fixReport, setFixReport] = useState<FixReport | null>(null);
  /* Task 122: ZIP-отчёт (архитектура импорта) и удаление неиспользуемых */
  const [zipBusy, setZipBusy] = useState(false);
  const [zipInfo, setZipInfo] = useState<ZipReport | null>(null);
  const [purging, setPurging] = useState<string | null>(null);
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const open = (k: Kind) => {
    setKind(k);
    setEntries(null);
    setLoadError(null);
    setResults(null);
    setRunning(false);
    setManualSelected(null);
    setProgress({ done: 0, total: 0 });
    setCurrent("");
    setZipInfo(null);
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
      ["файл", "товар", "статус", "до, байт", "после, байт", "экономия, байт", "стало"],
      ...results.map((r) => [
        r.name,
        r.product?.name ?? "",
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

  /* Task 122: ZIP-отчёт по проблемным файлам — сервер собирает архив
     в архитектуре импорта (products.csv + images/ + videos/) по товарам
     неудавшихся файлов. Владелец заменяет битые видео и грузит через
     «Импорт товаров» — медиа этих товаров перестроится. */
  async function downloadZip() {
    if (!results || !kind || zipBusy) return;
    const urls = Array.from(new Set(results.filter((r) => !r.ok).map((r) => r.url)));
    if (urls.length === 0) return;
    setZipBusy(true);
    setZipInfo(null);
    try {
      const res = await fetch(`${API_URL}/admin/files/media-report-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ urls }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.ok) {
        const info = json.data as ZipReport;
        setZipInfo(info);
        const a = document.createElement("a");
        a.href = info.download_url;
        a.download = info.file;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        toast(json.error ?? `Ошибка ${res.status}`, "error");
      }
    } catch {
      toast("Ошибка сети", "error");
    } finally {
      setZipBusy(false);
    }
  }

  /* Task 122: неиспользуемый файл — в корзину файлов (восстановимо 30 дней) */
  async function purgeEntry(e: MediaEntry) {
    if (purging) return;
    const label = e.product ? `«${e.product.name}» — ${e.name}` : e.name;
    const ok = await confirm({
      title: `Убрать в корзину файлов ${label}?`,
      message:
        "Файл не привязан к товарам. Он переедет в раздел «Файлы → Корзина» и будет удалён навсегда через 30 дней.",
      confirmLabel: "Убрать",
      danger: true,
    });
    if (!ok) return;
    setPurging(e.url);
    try {
      const res = await fetch(`${API_URL}/admin/files/unused-purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paths: [e.url.replace(/^\/uploads\//, "")] }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.ok && json.data.deleted > 0) {
        setEntries((prev) => (prev ? prev.filter((x) => x.url !== e.url) : prev));
        setManualSelected((prev) => {
          if (prev === null) return prev;
          const next = new Set(prev);
          next.delete(e.url);
          return next;
        });
      } else {
        toast(json.error ?? "Не удалось убрать файл (возможно, он уже привязан к товару)", "error");
      }
    } catch {
      toast("Ошибка сети", "error");
    } finally {
      setPurging(null);
    }
  }

  async function runFix() {
    if (fixing) return;
    const ok = await confirm({
      title: "Проверить все картинки товаров и витрины?",
      message:
        "Сервер сверит каждую ссылку с файлами на диске: если файла нет, а рядом лежит картинка с тем же именем в другом формате — ссылка будет исправлена. Ничего не удаляется.",
      confirmLabel: "Проверить",
    });
    if (!ok) return;
    setFixing(true);
    setFixReport(null);
    try {
      const res = await fetch(`${API_URL}/admin/files/fix-image-refs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.ok) {
        setFixReport(json.data as FixReport);
      } else {
        toast(json.error ?? `Ошибка ${res.status}`, "error");
      }
    } catch {
      toast("Ошибка сети", "error");
    } finally {
      setFixing(false);
    }
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
            product: e.product, status: e.status,
          });
        } else {
          const msg = json.error ?? `Ошибка ${res.status}`;
          /* «уже сжато / не меньше оригинала / недоступен ffmpeg» — пропуск,
             а не сбой: файл остался как есть, повторять не нужно.
             404 (Task 116) — тоже пропуск: файла нет на диске (уже
             конвертирован/удалён), список устарел — это не поломка. */
          const skipped = res.status === 404
            || (/уже|не меньше|не удалось перекодировать|ffmpeg на сервере недоступен/i.test(msg)
              && res.status === 422);
          const full = res.status === 404 && !/обновите список/i.test(msg)
            ? `${msg} (список устарел)`
            : msg;
          acc.push({ url: e.url, name: e.name, before: e.size, after: e.size, ok: false, skipped, message: full, product: e.product, status: e.status });
        }
      } catch {
        acc.push({ url: e.url, name: e.name, before: e.size, after: e.size, ok: false, skipped: false, message: "Ошибка сети", product: e.product, status: e.status });
      }
      setResults([...acc]);
      setProgress({ done: i + 1, total: chosen.length });
    }
    setCurrent("");
    setRunning(false);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-3">
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
        <button type="button" onClick={runFix} disabled={fixing}
          title="Битые ссылки на картинки: база смотрит на файл, которого нет на диске (после оптимизации/переноса). Сервер перенаправит ссылки на существующие файлы в тех же папках"
          className="ml-auto rounded-[var(--radius-btn)] border-2 border-amber-400 px-4 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-400 hover:text-white disabled:opacity-50">
          {fixing ? "Проверяем…" : "🔗 Починить ссылки на картинки"}
        </button>
      </div>

      {/* Отчёт починки ссылок (Task 116) */}
      {fixReport && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">
            Проверено ссылок: {fixReport.checked} · в порядке: {fixReport.unchanged}
            {fixReport.converted && fixReport.converted.length > 0 && <> · доконвертировано в WebP: {fixReport.converted.length}</>}
            {fixReport.fixed.length > 0 && <> · исправлено: {fixReport.fixed.length}</>}
            {fixReport.lost.length > 0 && <span className="text-red-700"> · потеряно: {fixReport.lost.length}</span>}
          </p>
          {fixReport.converted && fixReport.converted.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[var(--color-card)] p-2 text-xs">
              {fixReport.converted.map((f, i) => (
                <li key={`c-${i}`}>
                  <b>{f.where}</b>: {f.from} — создан {f.to}
                </li>
              ))}
            </ul>
          )}
          {fixReport.fixed.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[var(--color-card)] p-2 text-xs">
              {fixReport.fixed.map((f, i) => (
                <li key={`f-${i}`}>
                  <b>{f.where}</b>: {f.from} → <b>{f.to}</b>
                </li>
              ))}
            </ul>
          )}
          {fixReport.lost.length > 0 && (
            <>
              <p className="mt-2 text-xs text-red-800">
                Файлов нет ни в одном формате — картинки придётся перезалить в товаре:
              </p>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[var(--color-card)] p-2 text-xs">
                {fixReport.lost.map((l, i) => (
                  <li key={`l-${i}`}>
                    <b>{l.where}</b>: {l.url}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => setFixReport(null)}
            className="mt-2 rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-xs hover:bg-[var(--color-bg-soft)]">
            Скрыть
          </button>
        </div>
      )}

      {kind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />
          <div role="dialog" aria-modal="true"
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[var(--radius-card)] bg-[var(--color-card)] p-6 shadow-xl">
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
                  {kind === "image" && (
                    <p className="mb-2 rounded-lg bg-[var(--color-bg-soft)] p-2 text-xs text-[var(--color-body)]">
                      ℹ️ Одинаковые имена (0.jpg, 1.jpg…) в папках разных товаров — это нормально:
                      у каждого товара своя папка, ничего переименовывать и удалять не нужно.
                    </p>
                  )}
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
                          {/* Task 122: обложка подарка (или заглушка) */}
                          {e.product?.thumb ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={e.product.thumb} alt={e.product.name}
                              className="h-9 w-9 shrink-0 rounded-md border border-[var(--color-border)] object-cover"
                              loading="lazy" />
                          ) : (
                            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-soft)] text-sm">🎁</span>
                          )}
                          <span className="min-w-0 flex-1">
                            {e.product && (
                              <span className="block truncate text-xs font-medium text-[var(--color-heading)]" title={e.product.name}>
                                {e.product.name}
                              </span>
                            )}
                            <span className="block truncate text-[var(--color-body)]" title={e.url}>
                              {e.name}
                              {e.folder && <span className="ml-1 text-xs text-[var(--color-muted)]">({e.folder}/)</span>}
                            </span>
                          </span>
                          {e.status === "empty" && (
                            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700" title="Файл состоит из нулей — данные не записались. Замените видео исправным">
                              повреждено (нули)
                            </span>
                          )}
                          {e.status === "broken" && (
                            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700" title="Заголовок не читается — файл обрезан или перебит">
                              повреждено
                            </span>
                          )}
                          {e.used === false && (
                            <span className="shrink-0 text-xs text-amber-600" title="Файл не привязан ни к одному товару">не подключена к товарам</span>
                          )}
                          {e.used === false && (
                            <button type="button" onClick={() => void purgeEntry(e)} disabled={purging !== null}
                              title="Убрать файл в корзину (восстановимо 30 дней)"
                              className="shrink-0 rounded-[var(--radius-btn)] border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">
                              {purging === e.url ? "…" : "в корзину"}
                            </button>
                          )}
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
                        {r.product?.thumb ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={r.product.thumb} alt={r.product.name}
                            className="h-7 w-7 shrink-0 rounded border border-[var(--color-border)] object-cover"
                            loading="lazy" />
                        ) : (
                          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-bg-soft)]">🎁</span>
                        )}
                        <span className="min-w-0 flex-1">
                          {r.product && <b className="text-[var(--color-heading)]">{r.product.name} — </b>}
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
                    {kind === "video" && report.failed.length > 0 && (
                      <button type="button" onClick={() => void downloadZip()} disabled={zipBusy}
                        title="ZIP в формате импорта: CSV + все медиа товаров с проблемными файлами. Замените битые видео в папке videos/ на исправные (имена сохраните) и загрузите архив через «Импорт товаров»"
                        className="rounded-[var(--radius-btn)] border-2 border-amber-400 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-400 hover:text-white disabled:opacity-50">
                        {zipBusy ? "Собираем ZIP…" : "⬇ ZIP для замены файлов (импорт)"}
                      </button>
                    )}
                    <button type="button" onClick={() => { setResults(null); setEntries(null); setZipInfo(null); }}
                      className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-1.5 text-sm hover:bg-[var(--color-bg-soft)]">
                      Прогнать снова
                    </button>
                    {kind === "image" && report.failed.length > 0 && (
                      <button type="button" onClick={runFix} disabled={fixing}
                        className="rounded-[var(--radius-btn)] border-2 border-amber-400 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-400 hover:text-white disabled:opacity-50">
                        🔗 Починить ссылки на картинки
                      </button>
                    )}
                  </div>
                  {zipInfo && (
                    <div className="mt-3 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-3 text-xs">
                      <p className="font-semibold text-amber-900">
                        ZIP собран: {zipInfo.file} ({fmtSize(zipInfo.size)}) — товаров {zipInfo.products.length}, видео {zipInfo.videos_packed}, картинок {zipInfo.images_packed}. Загрузите его через «Импорт товаров».
                      </p>
                      {zipInfo.to_replace.length > 0 && (
                        <div className="mt-2">
                          <p className="text-amber-900">Замените в папке videos/ (имена сохраните):</p>
                          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto rounded-lg bg-[var(--color-card)] p-2">
                            {zipInfo.to_replace.map((t, i) => (
                              <li key={`${t.zip}-${i}`}>
                                <b>{t.product}</b>: {t.zip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="mt-2 text-[var(--color-muted)]">
                        При импорте медиа перечисленных товаров перестроится целиком — в архив уже вложены все их картинки и видео.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
