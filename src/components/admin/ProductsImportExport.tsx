"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFileInChunks } from "@/lib/chunked-upload";
import { FUNNY_PHRASES } from "@/lib/funny-phrases";

interface ImportResult {
  rows_processed: number;
  created: number;
  updated: number;
  images_copied: number;
  videos_copied: number;
  videos_external: number;
  parse_errors: string[];
  import_errors: string[];
  images_missing: string[];
  videos_missing: string[];
}

export function ProductsImportExport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportStage, setExportStage] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [funnyIndex, setFunnyIndex] = useState(0);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

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
    setExportPct(0);
    setExportStage("Старт…");
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/products/export-zip-stream`, {
        credentials: "include",
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let msg = `Ошибка ${res.status}`;
        try {
          const j = JSON.parse(text);
          if (j.error) msg = j.error;
        } catch {}
        setError(msg);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalFile: string | null = null;
      let finalPublicUrl: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);
          if (!line) continue;

          let msg: any;
          try { msg = JSON.parse(line); } catch { continue; }

          if (msg.error) { setError(msg.error); return; }
          if (typeof msg.progress === "number") setExportPct(msg.progress);
          if (msg.stage) setExportStage(msg.stage);
          if (msg.done && msg.file) finalFile = msg.file;
          if (msg.done && msg.public_url) finalPublicUrl = msg.public_url;
        }
      }

      if (!finalFile) { setError("Сервер не вернул имя файла"); return; }

      setExportStage("Скачивание…");
      const fileName = finalFile.replace(/^exports\//, "");

      if (finalPublicUrl) {
        // Быстрый путь: ZIP лежит в public/exports и отдаётся статикой — обычный <a download>
        // без fetch/blob (большие архивы через прокси + blob в памяти ломались с 502)
        const a = document.createElement("a");
        a.href = finalPublicUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Fallback: старый путь через авторизованный fetch
        const dlRes = await fetch(
          `${apiUrl}/admin/products/export-zip-download/${encodeURIComponent(fileName)}`,
          { credentials: "include" }
        );
        if (!dlRes.ok) { setError("Не удалось скачать ZIP"); return; }
        const blob = await dlRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      setExportPct(100);
      setExportStage("Готово");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setExporting(false);
      setTimeout(() => { setExportPct(0); setExportStage(""); }, 1500);
    }
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
          className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-60"
        >
          {exporting ? `Готовим ZIP… ${exportPct}%` : "📤 Экспорт"}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing || exporting}
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
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

      {exporting && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>
              {exportPct < 92 ? FUNNY_PHRASES[funnyIndex] : exportStage}
            </span>
            <span>{exportPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-soft)]">
            <div
              className="h-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${exportPct}%` }}
            />
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
            Картинок: <b>{result.images_copied}</b>,
            видео: <b>{result.videos_copied}</b>
            {result.videos_external > 0 && (
              <>, внешних видео-URL: <b>{result.videos_external}</b></>
            )}
          </p>

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