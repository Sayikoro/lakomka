/* Двухэтапное скачивание «как у файловых свалок»:
 *
 *   Этап 1 — браузер забирает файл блоками (fetch + ReadableStream) и
 *   складывает во внутреннее временное хранилище (OPFS / память). Прогресс
 *   виден прямо на веб-странице.
 *
 *   Этап 2 — когда файл полностью собран, он одним движком «выталкивается»
 *   на диск пользователя (blob: + <a download>) — стандартный менеджер
 *   загрузок браузера показывает 100% мгновенно.
 */

import { createSpool } from "@/lib/download-spool";

export type DownloadStage = "downloading" | "assembling" | "saving" | "done";

export interface DownloadProgress {
  received: number;
  total: number; // 0 — если сервер не отдал Content-Length
}

export interface TwoStageOptions {
  url: string;
  name: string;
  onProgress?(p: DownloadProgress): void;
  onStage?(stage: DownloadStage): void;
  signal?: AbortSignal;
}

export interface TwoStageHandle {
  promise: Promise<void>;
  cancel(): void;
}

export class DownloadCanceled extends Error {
  constructor() {
    super("Отменено");
    this.name = "DownloadCanceled";
  }
}

export function startTwoStageDownload(opts: TwoStageOptions): TwoStageHandle {
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return { promise: runTwoStage(opts, controller), cancel: () => controller.abort() };
}

async function runTwoStage(opts: TwoStageOptions, controller: AbortController): Promise<void> {
  const { url, name } = opts;
  const signal = controller.signal; // и внешняя отмена, и внутренняя — через один сигнал

  const checkCanceled = () => {
    if (signal.aborted) throw new DownloadCanceled();
  };

  // ── ЭТАП 1: собираем файл во внутреннем хранилище браузера ──
  opts.onStage?.("downloading");
  const res = await fetch(url, { credentials: "include", cache: "no-store", signal });
  if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);

  const total = Number(res.headers.get("content-length") ?? 0) || 0;
  const spool = await createSpool(name);
  let received = 0;
  let lastEmit = 0;

  try {
    checkCanceled();
    if (!res.body) throw new Error("Сервер не отдал тело файла");

    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await spool.write(value);
        received += value.byteLength;
        const now = performance.now();
        if (now - lastEmit > 120) {
          lastEmit = now;
          opts.onProgress?.({ received, total });
        }
      }
    }
    opts.onProgress?.({ received, total });

    // ── Сборка готового файла из хранилища ──
    checkCanceled();
    opts.onStage?.("assembling");
    const blob = await spool.complete();
    const mime = res.headers.get("content-type");
    const out =
      mime && mime !== "application/octet-stream" && blob.type !== mime
        ? blob.slice(0, blob.size, mime)
        : blob;

    // ── ЭТАП 2: мгновенное сохранение на устройство ──
    checkCanceled();
    opts.onStage?.("saving");
    const objectUrl = URL.createObjectURL(out);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // blob-URL и OPFS-файл освобождаем с запасом (браузер дочитывает фоном)
    const cleanupDelay = spool.mode === "opfs" ? 60_000 : 5_000;
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      void spool.cleanup();
    }, cleanupDelay);

    opts.onStage?.("done");
  } catch (e) {
    try {
      await spool.cleanup();
    } catch {
      /* пофиг */
    }
    throw e;
  }
}
