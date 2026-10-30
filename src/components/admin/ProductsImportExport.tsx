"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFileInChunks } from "@/lib/chunked-upload";
import { FUNNY_PHRASES } from "@/lib/funny-phrases";
import { useDownloads } from "@/components/admin/downloads/Downloads";

interface ArchiveStatus {
  exists: boolean;
  file?: string;
  download_url?: string;
  size?: number;
  updated_at?: string;
  entries?: number;
}

interface ExportResult {
  file: string;
  download_url: string;
  first_build: boolean;
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  total_entries: number;
  media_missing: number;
  images_downloaded: number;
  size: number;
  updated_at: string;
}

interface ImportResult {
  rows_processed: number;
  created: number;
  updated: number;
  images_copied: number;
  images_external: number;
  videos_copied: number;
  videos_external: number;
  parse_errors: string[];
  import_errors: string[];
  images_missing: string[];
  videos_missing: string[];
  archive?: {
    added: number;
    updated: number;
    removed: number;
    unchanged: number;
    error?: string;
  } | null;
}

export function ProductsImportExport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloads = useDownloads();

  const [archive, setArchive] = useState<ArchiveStatus | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [funnyIndex, setFunnyIndex] = useState(0);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const ARCHIVE_URL = `${apiUrl}/admin/products/export-zip-download/lakomka-products.zip`;

  async function refreshArchive() {
    try {
      const res = await fetch(`${apiUrl}/admin/products/export-zip-status`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) setArchive(json.data);
    } catch {
      /* статус не критичен */
    }
  }

  useEffect(() => {
    void refreshArchive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!exporting && !importing) {
      setFunnyIndex(0);
      return;
    }
    setFunnyIndex(Math.floor(Math.random() * FUNNY_PHRASES.length));
    const timer = setInterval(() => {
      setFunnyIndex((i) => (i + 1) % FUNNY_PHRASES.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [exporting, importing]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    setExportResult(null);
    try {
      // «Живой архив»: сервер обновляет lakomka-products.zip на месте —
      // внутри ZIP заменяются только изменившиеся файлы (CSV, картинки,
      // видео). В браузер НИЧЕГО не скачивается — копии не плодятся.
      const res = await fetch(`${apiUrl}/admin/products/export-zip`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      const d = json.data as ExportResult;
      setExportResult(d);
      setArchive({
        exists: true,
        file: d.file,
        download_url: d.download_url,
        size: d.size,
        updated_at: d.updated_at,
        entries: d.total_entries,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setExporting(false);
    }
  }

  function handleDownload() {
    // Скачиваем с одного и того же постоянного адреса — файл всегда
    // называется одинаково, никакой копии на копии
    downloads.start({ url: ARCHIVE_URL, name: "lakomka-products.zip" });
  }

  async function handleImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Принимается только ZIP");
      return;
    }
    setImporting(true);
    setImportPct(0);
    setError(null);
    setResult(null);
    try {
      const { filePath } = await uploadFileInChunks(file, setImportPct);
      setImportPct(100);
      const res = await fetch(`${apiUrl}/admin/products/import-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ file_path: filePath }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось импортировать");
        return;
      }
      setResult(json.data);
      void refreshArchive();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || importing}
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
        >
          {exporting ? "Обновляем архив…" : "🔄 Обновить архив"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!archive?.exists || exporting || importing}
          title="Сервер отдаст файл странице (в 6 потоков, с прогрессом), страница сохранит его на ваш диск уже скачанным"
          className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-60"
        >
          ⬇️ Скачать ZIP
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing || exporting}
          className="rounded-[var(--radius-btn)] border-2 border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-body)] hover:bg-[var(--color-bg-soft)] disabled:opacity-60"
        >
          {importing
            ? `Загружаем… ${importPct > 0 && importPct < 100 ? importPct + "%" : ""}`
            : "📥 Импорт ZIP"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => handleImport(e.target.files)}
          className="hidden"
        />
      </div>

      {archive?.exists && !exporting && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          📦 <b>lakomka-products.zip</b> — файлов: {archive.entries ?? "—"}
          {typeof archive.size === "number" && <> · {(archive.size / 1024 / 1024).toFixed(1)} МБ</>}
          {archive.updated_at && <> · обновлён {archive.updated_at}</>}
          {" · "}
          {/* Запасной путь: нативный менеджер браузера — ОДНО медленное
              соединение, без прогресса в панели и без параллельной
              докачки. Основной способ — кнопка «Скачать ZIP» выше: она
              качает файл на страницу в 6 потоков и отдаёт вам уже
              скачанный. */}
          <a
            href={ARCHIVE_URL}
            download="lakomka-products.zip"
            title="Запасной медленный способ: обычная загрузка одним соединением без панели прогресса"
            className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-primary)]"
          >
            запасной способ (медленнее)
          </a>
        </p>
      )}

      {exporting && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-[var(--color-muted)]">
            {FUNNY_PHRASES[funnyIndex]}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-soft)]">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--color-primary)]" />
          </div>
        </div>
      )}

      {exportResult && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          ✓ {exportResult.first_build ? "Архив собран" : "Архив обновлён"}:{" "}
          {exportResult.first_build ? (
            <>файлов: <b>{exportResult.added}</b></>
          ) : (
            <>
              изменено: <b>{exportResult.updated}</b>, добавлено: <b>{exportResult.added}</b>,
              удалено: <b>{exportResult.removed}</b>, без изменений: <b>{exportResult.unchanged}</b>
            </>
          )}
          . Файлов в архиве: <b>{exportResult.total_entries}</b> (
          {(exportResult.size / 1024 / 1024).toFixed(1)} МБ)
          {exportResult.media_missing > 0 && (
            <div className="mt-1 text-[13px] text-amber-700">
              ⚠ {exportResult.media_missing} медиафайлов не нашлось на диске — их URL
              перечислены в CSV, но в архив они не попали.
            </div>
          )}
          <div className="mt-1 text-[13px] text-green-700">
            Ничего не скачивалось — архив на сервере один и обновился точечно.
            Нужна копия на компьютер — кнопка «Скачать ZIP».
          </div>
          <div className="mt-1 text-[13px] text-green-700">
            💡 Внутри архива есть <b>editor.html</b> — откройте его в браузере,
            перетащите архив на страницу, поправьте товары в таблице, добавьте
            медиа перетаскиванием файлов в карточке товара (превью — прямо в
            таблице) и нажмите «Сохранить ZIP»: в Chrome/Edge/Яндекс.Браузере
            он перезапишет <b>тот же файл</b>, который вы открыли — копии не плодятся.
            Полученный архив импортируйте
            здесь — ваши правки автоматически попадут и в архив на сервере.
          </div>
        </div>
      )}

      {importing && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>
              {importPct < 100 ? FUNNY_PHRASES[funnyIndex] : "Разбираем ваш архив…"}
            </span>
            <span>{importPct < 100 ? `${importPct}%` : "…"}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-soft)]">
            <div
              className="h-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${importPct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-xs underline">закрыть</button>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="mb-2 font-semibold text-green-800">✓ Импорт завершён</p>
          <p className="text-green-800">
            Строк: <b>{result.rows_processed}</b>,
            создано: <b>{result.created}</b>,
            обновлено: <b>{result.updated}</b>
          </p>
          <p className="text-green-800">
            Картинок: <b>{result.images_copied}</b>
            {result.images_external > 0 && (
              <> (плюс внешних URL: <b>{result.images_external}</b>)</>
            )}
            , видео: <b>{result.videos_copied}</b>
            {result.videos_external > 0 && (
              <>, внешних видео-URL: <b>{result.videos_external}</b></>
            )}
          </p>

          {result.archive && !result.archive.error && (
            <p className="text-green-800">
              📦 Живой архив синхронизирован: изменено{" "}
              <b>{result.archive.updated}</b>, добавлено <b>{result.archive.added}</b>,
              удалено <b>{result.archive.removed}</b>
            </p>
          )}
          {result.archive?.error && (
            <p className="text-amber-700">📦 {result.archive.error}</p>
          )}

          {result.parse_errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-700">
                Ошибки парсинга CSV: {result.parse_errors.length}
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto pl-4 text-xs text-amber-800">
                {result.parse_errors.map((e, i) => (<li key={i}>• {e}</li>))}
              </ul>
            </details>
          )}
          {result.import_errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-700">
                Ошибки импорта: {result.import_errors.length}
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto pl-4 text-xs text-red-800">
                {result.import_errors.map((e, i) => (<li key={i}>• {e}</li>))}
              </ul>
            </details>
          )}
          {result.images_missing.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-700">
                Картинки из CSV не найдены в ZIP: {result.images_missing.length}
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto pl-4 text-xs text-amber-800">
                {result.images_missing.map((e, i) => (<li key={i}>• {e}</li>))}
              </ul>
            </details>
          )}
          {result.videos_missing.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-700">
                Видео из CSV не найдены в ZIP: {result.videos_missing.length}
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto pl-4 text-xs text-amber-800">
                {result.videos_missing.map((e, i) => (<li key={i}>• {e}</li>))}
              </ul>
            </details>
          )}

          <button onClick={() => setResult(null)} className="mt-2 text-xs text-green-800 underline">
            скрыть
          </button>
        </div>
      )}
    </div>
  );
}
