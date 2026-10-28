/* Двухэтапное скачивание, этап 1 (внутреннее хранилище браузера).
 *
 * Файл собирается НЕ в ОЗУ напрямую, а во «временном хранилище браузера»:
 *  - OPFS (Origin Private File System) — внутренний диск браузера,
 *    блочная запись по мере поступления (большие файлы не съедают память);
 *  - фолбэк — набор чанков в памяти (старые браузеры).
 * На выходе — Blob/File, который на этапе 2 «выталкивается» на диск
 * пользователя через стандартный менеджер загрузок (мгновенные 100%).
 */

export type SpoolMode = "opfs" | "memory";

export interface DownloadSpool {
  mode: SpoolMode;
  write(chunk: Uint8Array): Promise<void>;
  complete(): Promise<Blob>;
  cleanup(): Promise<void>;
}

interface WritableLike {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

type HandleWithWriter = FileSystemFileHandle & {
  createWritable?: () => Promise<WritableLike>;
};

let seq = 0;

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").slice(-80);
  return cleaned || "file";
}

/* Санитарная чистка: спулы скачиваний, осиротевшие после закрытия/перезагрузки
 * страницы, остаются в OPFS навсегда. При монтировании панели загрузок сносим
 * все dl-* файлы старше 30 минут (активная загрузка моложе — не тронем).
 */
export async function cleanupOrphanSpools(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return;
    const root = await navigator.storage.getDirectory();
    const iter = (
      root as unknown as AsyncIterableIterator<[string, FileSystemHandle]> & {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      }
    ).entries();
    const victims: string[] = [];
    for (;;) {
      const it = await iter.next();
      if (it.done) break;
      const [name, handle] = it.value;
      if (handle.kind !== "file" || !name.startsWith("dl-")) continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        if (Date.now() - file.lastModified > 30 * 60 * 1000) victims.push(name);
      } catch {
        /* не читается — пропускаем */
      }
    }
    await Promise.all(
      victims.map((n) =>
        root.removeEntry(n).catch(() => {
          /* уже удалён */
        }),
      ),
    );
  } catch {
    /* OPFS нет — чистить нечего */
  }
}

export async function createSpool(fileName: string): Promise<DownloadSpool> {
  // ── Вариант 1: OPFS (внутреннее хранилище браузера, не ОЗУ) ──
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const entry = `dl-${Date.now()}-${++seq}-${safeFileName(fileName)}`;
      const handle = (await root.getFileHandle(entry, {
        create: true,
      })) as HandleWithWriter;
      if (typeof handle.createWritable === "function") {
        const writer = await handle.createWritable();
        let closed = false;
        return {
          mode: "opfs",
          async write(chunk) {
            await writer.write(chunk as unknown as BufferSource);
          },
          async complete() {
            if (!closed) {
              await writer.close();
              closed = true;
            }
            return handle.getFile();
          },
          async cleanup() {
            try {
              if (!closed && writer.abort) await writer.abort();
            } catch {
              /* уже закрыт */
            }
            try {
              await root.removeEntry(entry);
            } catch {
              /* уже удалён */
            }
          },
        };
      }
    }
  } catch {
    /* OPFS недоступен — собираем в памяти */
  }

  // ── Вариант 2: память (чанки складываются в Blob) ──
  const chunks: BlobPart[] = [];
  return {
    mode: "memory",
    async write(chunk) {
      chunks.push(chunk as unknown as BlobPart);
    },
    async complete() {
      return new Blob(chunks);
    },
    async cleanup() {
      chunks.length = 0;
    },
  };
}
