/* Двухэтапное скачивание «как у файловых свалок»:
 *
 *   Этап 1 — браузер забирает файл и складывает во внутреннее временное
 *   хранилище (OPFS / память). Прогресс виден прямо на веб-странице.
 *
 *   Этап 2 — когда файл полностью собран, он одним движением «выталкивается»
 *   на диск пользователя (blob: + <a download>) — стандартный менеджер
 *   загрузок браузера показывает 100% мгновенно.
 *
 * ПАРАЛЛЕЛЬНАЯ ЗАГРУЗКА + ЖИВАЧЕСТЬ: внешний шлюз превью режет и скорость
 * (порядка 56 КБ/с на одно соединение), и сами соединения — длинная загрузка
 * обрывается на середине, а недокачанный ZIP не открывается. Поэтому:
 *   - файл делится на куски по 4 МБ, которые тянут 6 соединений одновременно
 *     (лимит шлюза по-соединительный → суммарная скорость умножается);
 *   - ОБРЫВ НЕ РОНЯЕТ ЗАГРУЗКУ: недокачанный хвост куска докачивается тем же
 *     запросом с Range: bytes=(start+got)-(end) — кусок берёт очередь сам;
 *   - зависшее соединение (нет ни байта 20 секунд) режется таймером и
 *     докачивается с того же места;
 *   - собранный файл проверяется на непрерывное покрытие [0..size) —
 *     «обрезанный» файл сохранить на диск невозможно в принципе;
 *   - если сервер/шлюз не отдаёт 206 на пробный Range — автоматический
 *     откат на однопоточную схему, и она тоже умеет докачивать
 *     (Range: bytes=received-) и тоже не сохранит недокачанный файл.
 */

import { createSpool, type DownloadSpool } from "@/lib/download-spool";

export type DownloadStage = "downloading" | "assembling" | "saving" | "done";

export interface DownloadProgress {
  received: number;
  total: number; // 0 — если сервер не отдал Content-Length
}

/* Сведения о том, КАК качаем: сколько соединений и сколько раз докачивали
 * после обрывов (панель загрузок показывает это подписью). */
export interface DownloadMeta {
  mode: "parallel" | "single";
  workers: number;
  resumes: number;
}

export interface TwoStageOptions {
  url: string;
  name: string;
  onProgress?(p: DownloadProgress): void;
  onStage?(stage: DownloadStage): void;
  onMeta?(m: DownloadMeta): void;
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

/* Сервер/шлюз ответил не 206 на Range — параллельная схема невозможна
 * в принципе, ретраить бессмысленно, сразу откатываемся на одну трубу. */
class RangeUnsupportedError extends Error {}

/* Порог параллелизации: мелкие файлы быстрее качать одним потоком
 * (каждый кусок = отдельное рукопожатие через шлюз). Параллим от 16МБ. */
const PARALLEL_MIN_BYTES = 16 * 1024 * 1024;
const WORKERS = 6; // одновременных соединений (пул браузера для HTTP/1.1 = 6)
const CHUNK_SIZE = 4 * 1024 * 1024; // кусок: 4МБ → меньше «хвост» в конце
const MAX_RESUMES = 64; // суммарный бюджет докачек после обрывов
const SINGLE_RETRIES = 16; // бюджет докачек однопоточной схемы
const STALL_TIMEOUT_MS = 20_000; // нет ни байта столько — режем соединение
const RESUME_DELAY_MS = 500; // пауза перед повтором после обрыва

export function startTwoStageDownload(opts: TwoStageOptions): TwoStageHandle {
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return { promise: runTwoStage(opts, controller), cancel: () => controller.abort() };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    /* поток уже закрыт */
  }
}

async function runTwoStage(opts: TwoStageOptions, controller: AbortController): Promise<void> {
  const { url, name } = opts;
  const signal = controller.signal;
  const checkCanceled = () => {
    if (signal.aborted) throw new DownloadCanceled();
  };

  // ── ЭТАП 1: первый запрос — узнаём размер и MIME ──
  opts.onStage?.("downloading");
  const res = await fetch(url, { credentials: "include", cache: "no-store", signal });
  if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);

  const total = Number(res.headers.get("content-length") ?? 0) || 0;
  const mime = res.headers.get("content-type");

  if (total >= PARALLEL_MIN_BYTES) {
    // Крупный файл: пробуем параллельную схему. Поддержку Range проверяем
    // пробным bytes=0-0: заголовок Accept-Ranges шлюз может вырезать,
    // а вот живой 206 — показатель честнее.
    await closeBody(res.body);
    checkCanceled();
    if (await probeRange(url, signal)) {
      checkCanceled();
      try {
        const { blob, cleanup } = await downloadParallel(url, name, total, mime, opts, controller);
        checkCanceled();
        opts.onStage?.("saving");
        saveBlobToDisk(blob, name);
        // OPFS-файлы за Blob'ом освобождаем с запасом (браузер дочитывает фоном)
        window.setTimeout(() => {
          void cleanup();
        }, 60_000);
        opts.onStage?.("done");
        return;
      } catch {
        if (signal.aborted) throw new DownloadCanceled();
        // параллельная схема не удалась — падаем на одну трубу (она тоже живучая)
        opts.onStage?.("downloading");
      }
    }
    await downloadSingleStream(opts, controller, { url, name, mime, total });
    return;
  }

  // Мелкий файл — качаем одной трубой прямо из уже открытого ответа.
  await downloadSingleStream(opts, controller, { url, name, mime, total, first: res });
}

/* Пробный Range-запрос на 1 байт: 206 = сервер умеет отдавать части. */
async function probeRange(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal,
      headers: { Range: "bytes=0-0" },
    });
    await closeBody(r.body);
    return r.status === 206;
  } catch {
    return false;
  }
}

/* ── Параллельная загрузка кусков с докачкой после обрывов ──
 *
 * Файл нарезан на куски по CHUNK_SIZE; WORKERS «рабочих» разбирают очередь,
 * каждый кусок качается в свой spool (свой OPFS-файл — порядок байт внутри
 * куска не путается). Обрыв/зависание не роняет ничего: кусок сам повторяет
 * запрос с Range: bytes=(start+got)-(end), пока не получит свои байты целиком.
 * Сборка: куски сортируются по смещению, проверяется непрерывное покрытие
 * [0..total), затем склеиваются Blob'ом по ссылке из OPFS — в ОЗУ файл
 * целиком не копируется. */

interface Chunk {
  start: number; // включительно
  end: number; // включительно
  spool: DownloadSpool;
}

async function downloadParallel(
  url: string,
  name: string,
  total: number,
  mime: string | null,
  opts: TwoStageOptions,
  controller: AbortController,
): Promise<{ blob: Blob; cleanup(): Promise<void> }> {
  const signal = controller.signal;
  const checkCanceled = () => {
    if (signal.aborted) throw new DownloadCanceled();
  };

  const resumes = { count: 0 };
  const metaEmit = () =>
    opts.onMeta?.({ mode: "parallel", workers: WORKERS, resumes: resumes.count });
  metaEmit();

  // нарезка + свой спул на каждый кусок
  const chunks: Chunk[] = [];
  for (let s = 0; s < total; s += CHUNK_SIZE) {
    chunks.push({
      start: s,
      end: Math.min(s + CHUNK_SIZE, total) - 1,
      spool: await createSpool(name),
    });
  }

  let received = 0;
  let lastEmit = 0;
  const emit = () => {
    const now = performance.now();
    if (now - lastEmit > 120) {
      lastEmit = now;
      opts.onProgress?.({ received, total });
    }
  };

  let qi = 0; // указатель очереди кусков
  const takeNext = (): Chunk | null => (qi < chunks.length ? chunks[qi++] : null);

  const stopping = { flag: false };
  let firstError: unknown = null;
  const active = new Set<AbortController>(); // живые fetch'и — гасим при фатальной ошибке

  const fail = (e: unknown) => {
    if (signal.aborted || stopping.flag) return;
    firstError = e;
    stopping.flag = true;
    for (const wc of active) wc.abort();
  };

  const runChunk = async (chunk: Chunk): Promise<void> => {
    const want = chunk.end - chunk.start + 1;
    let got = 0; // сколько байт куска уже лежит в спуле
    for (;;) {
      checkCanceled();
      if (stopping.flag) throw firstError ?? new Error("Остановлено");

      const wc = new AbortController();
      const fwd = () => wc.abort();
      signal.addEventListener("abort", fwd, { once: true });
      let stall: ReturnType<typeof setTimeout> | undefined;
      try {
        active.add(wc);
        const r = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          signal: wc.signal,
          headers: { Range: `bytes=${chunk.start + got}-${chunk.end}` },
        });
        if (r.status !== 206 || !r.body) {
          throw new RangeUnsupportedError(`Сервер ответил ${r.status} (ожидался 206)`);
        }
        const reader = r.body.getReader();
        stall = setTimeout(() => wc.abort(), STALL_TIMEOUT_MS);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            await chunk.spool.write(value);
            got += value.byteLength;
            received += value.byteLength;
            emit();
            clearTimeout(stall);
            stall = setTimeout(() => wc.abort(), STALL_TIMEOUT_MS);
          }
        }
      } catch (e) {
        if (signal.aborted) throw new DownloadCanceled();
        if (stopping.flag) throw firstError ?? e;
        if (e instanceof RangeUnsupportedError) throw e;
        // обрыв/столл/сеть — выходим из try и докачиваем этот же кусок ниже
      } finally {
        active.delete(wc);
        signal.removeEventListener("abort", fwd);
        if (stall) clearTimeout(stall);
      }

      if (got >= want) return; // кусок получил все свои байты

      // соединение оборвалось (или «чистый» EOF раньше времени) — докачиваем хвост
      if (resumes.count >= MAX_RESUMES) {
        throw new Error(`Соединение обрывается слишком часто (докачек: ${resumes.count})`);
      }
      resumes.count += 1;
      metaEmit();
      await delay(RESUME_DELAY_MS);
    }
  };

  const runWorker = async (): Promise<void> => {
    for (;;) {
      checkCanceled();
      if (stopping.flag) throw firstError ?? new Error("Остановлено");
      const chunk = takeNext();
      if (!chunk) return;
      try {
        await runChunk(chunk);
      } catch (e) {
        fail(e); // гасим соседей и запоминаем первую ошибку
        throw e;
      }
    }
  };

  try {
    const workerCount = Math.min(WORKERS, chunks.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        try {
          await runWorker();
        } catch (e) {
          fail(e);
        }
      }),
    );
    checkCanceled();
    if (firstError) throw firstError;

    opts.onProgress?.({ received, total });

    // ── Целостность: куски обязаны покрывать [0, total) без дыр и наложений ──
    const ordered = [...chunks].sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const c of ordered) {
      if (c.start !== cursor) {
        throw new Error(`Файл собрался с дырой на смещении ${cursor}`);
      }
      cursor = c.end + 1;
    }
    if (cursor !== total) {
      throw new Error(`Файл собран не полностью: ${cursor} из ${total}`);
    }

    opts.onStage?.("assembling");
    const files = await Promise.all(ordered.map((c) => c.spool.complete()));
    const blob = new Blob(files, {
      type: mime && mime !== "application/octet-stream" ? mime : "application/zip",
    });
    if (blob.size !== total) {
      throw new Error(`Размер не сошёлся: ${blob.size} из ${total}`);
    }
    return {
      blob,
      cleanup: async () => {
        await Promise.all(chunks.map((c) => c.spool.cleanup().catch(() => undefined)));
      },
    };
  } catch (e) {
    await Promise.all(chunks.map((c) => c.spool.cleanup().catch(() => undefined)));
    throw e;
  }
}

/* ── Однопоточная схема: фолбэк и маленькие файлы. Живучая ──
 *
 * Обрыв соединения больше не значит потерю загрузки: хвост файла
 * докачивается запросом Range: bytes=received- (несколько попыток).
 * Если сервер на докачку ответил 200 (Range проигнорирован) — начинаем
 * файл заново в новом спуле. Недокачанный файл НЕ сохраняется никогда. */
async function downloadSingleStream(
  opts: TwoStageOptions,
  controller: AbortController,
  src: { url: string; name: string; mime: string | null; total: number; first?: Response },
): Promise<void> {
  const signal = controller.signal;
  const checkCanceled = () => {
    if (signal.aborted) throw new DownloadCanceled();
  };

  opts.onMeta?.({ mode: "single", workers: 1, resumes: 0 });

  let received = 0;
  let resumes = 0;
  let lastEmit = 0;
  const emit = () => {
    const now = performance.now();
    if (now - lastEmit > 120) {
      lastEmit = now;
      opts.onProgress?.({ received, total: src.total });
    }
  };
  const metaEmit = () => opts.onMeta?.({ mode: "single", workers: 1, resumes });

  let spool = await createSpool(src.name);

  try {
    checkCanceled();
    let res = src.first;

    for (;;) {
      if (!res) {
        // повтор/докачка: просим хвост с того места, где поток оборвался
        const r = await fetch(src.url, {
          credentials: "include",
          cache: "no-store",
          signal,
          headers: received > 0 ? { Range: `bytes=${received}-` } : undefined,
        });
        if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
        if (received > 0 && r.status !== 206) {
          // сервер игнорирует Range — дописывать нельзя, начинаем файл заново
          await closeBody(r.body);
          const stale = spool;
          spool = await createSpool(src.name);
          void stale.cleanup().catch(() => undefined);
          received = 0;
          metaEmit();
          continue; // следующий заход пойдёт обычным 200-запросом с нуля
        }
        res = r;
      }
      if (!res.body) throw new Error("Сервер не отдал тело файла");

      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          await spool.write(value);
          received += value.byteLength;
          emit();
        }
      }

      if (src.total > 0 && received < src.total) {
        // ОБРЫВ: соединение закрылось раньше, чем файл кончился
        if (++resumes > SINGLE_RETRIES) {
          throw new Error(
            `Соединение обрывается слишком часто — докачано ${received} из ${src.total}`,
          );
        }
        metaEmit();
        res = undefined;
        await delay(RESUME_DELAY_MS);
        checkCanceled();
        continue;
      }
      break; // полный файл (или размер неизвестен — что скачалось, то скачалось)
    }

    opts.onProgress?.({ received, total: src.total });
    checkCanceled();

    opts.onStage?.("assembling");
    const blob = await spool.complete();
    if (src.total > 0 && blob.size !== src.total) {
      throw new Error(`Размер не сошёлся: ${blob.size} из ${src.total}`);
    }
    const out =
      src.mime && src.mime !== "application/octet-stream" && blob.type !== src.mime
        ? blob.slice(0, blob.size, src.mime)
        : blob;

    opts.onStage?.("saving");
    saveBlobToDisk(out, src.name);

    // blob-URL и OPFS-файл освобождаем с запасом (браузер дочитывает фоном)
    const cleanupDelay = spool.mode === "opfs" ? 60_000 : 5_000;
    window.setTimeout(() => {
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

/* Этап 2: сохранение собранного Blob на диск пользователя. */
function saveBlobToDisk(blob: Blob, name: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // blob-URL освобождаем с запасом (браузер дочитывает фоном)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
