"use client";

/**
 * Управление PDF-документами сайта (каталоги, сертификат).
 * Алиас — фиксированное место назначения; загруженный файл заменяет
 * предыдущий по этому адресу. Загрузка чанками по 2 МБ (каталоги бывают
 * по 20–50 МБ, обычный multipart упирается в лимиты PHP).
 */

import { useRef, useState } from "react";
import type { PdfDocInfo } from "@/components/pdf/PdfButtons";

interface Item {
  alias: string;
  title: string;
  hint: string;
  doc: PdfDocInfo | null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

async function uploadPdf(
  file: File,
  alias: string,
  onProgress: (done: number, total: number) => void
): Promise<PdfDocInfo> {
  const uploadId =
    (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .slice(0, 24) || "pdfupload0001";

  const CHUNK = 2 * 1024 * 1024;
  const total = Math.max(1, Math.ceil(file.size / CHUNK));

  for (let i = 0; i < total; i++) {
    const blob = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const STEP = 0x8000;
    for (let j = 0; j < buf.length; j += STEP) {
      binary += String.fromCharCode(...buf.subarray(j, j + STEP));
    }
    const res = await fetch("/api/admin/pdfs/chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias,
        upload_id: uploadId,
        chunk_index: i,
        total_chunks: total,
        chunk_base64: btoa(binary),
        filename: file.name,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ?? "Ошибка загрузки");
    onProgress(i + 1, total);
    if (json?.data?.done) return json.data.document as PdfDocInfo;
  }
  throw new Error("Загрузка не завершена");
}

export function PdfManager({ items: initialItems }: { items: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [busyAlias, setBusyAlias] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeAlias = useRef<string | null>(null);

  function pickFile(alias: string) {
    activeAlias.current = alias;
    setError(null);
    inputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const alias = activeAlias.current;
    if (!file || !alias) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Выберите файл в формате PDF");
      return;
    }

    setBusyAlias(alias);
    setError(null);
    setProgress({ done: 0, total: Math.max(1, Math.ceil(file.size / (2 * 1024 * 1024))) });
    try {
      const doc = await uploadPdf(file, alias, (done, total) =>
        setProgress({ done, total })
      );
      setItems((list) =>
        list.map((it) => (it.alias === alias ? { ...it, doc } : it))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setBusyAlias(null);
      setProgress(null);
    }
  }

  async function removeDoc(alias: string) {
    if (!confirm(`Удалить файл «${items.find((i) => i.alias === alias)?.title}»?`)) return;
    setBusyAlias(alias);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pdfs/${alias}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Ошибка удаления");
      setItems((list) =>
        list.map((it) => (it.alias === alias ? { ...it, doc: null } : it))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить файл");
    } finally {
      setBusyAlias(null);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onFileChange}
      />

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => {
          const busy = busyAlias === item.alias;
          const pct =
            progress && busy && progress.total > 0
              ? Math.round((progress.done / progress.total) * 100)
              : 0;
          return (
            <div
              key={item.alias}
              className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[16px] font-semibold text-[var(--color-heading)]">
                      {item.title}
                    </h2>
                    <code className="rounded bg-[var(--color-bg-soft)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
                      {item.alias}
                    </code>
                  </div>
                  <p className="mt-1 text-[13px] text-[var(--color-muted)]">{item.hint}</p>

                  <p className="mt-2 text-[13px]">
                    {item.doc ? (
                      <>
                        <span className="font-medium text-emerald-700">Загружен:</span>{" "}
                        <span className="text-[var(--color-muted)]">
                          {formatSize(item.doc.size)} · обновлён{" "}
                          {new Date(item.doc.updated_at).toLocaleString("ru-RU")}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--color-muted)]">Файл не загружен</span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => pickFile(item.alias)}
                    disabled={!!busyAlias}
                    className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                  >
                    {busy ? "Загрузка…" : item.doc ? "Заменить PDF" : "Загрузить PDF"}
                  </button>
                  {item.doc && (
                    <>
                      <a
                        href={item.doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-[13px] font-medium text-[var(--color-heading)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                      >
                        Открыть
                      </a>
                      <button
                        type="button"
                        onClick={() => removeDoc(item.alias)}
                        disabled={!!busyAlias}
                        className="rounded-[var(--radius-btn)] border border-red-200 px-4 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    </>
                  )}
                </div>
              </div>

              {busy && progress && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-soft)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                    {pct}% ({progress.done} из {progress.total} чанков)
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-[var(--color-muted)]">
        Файлы сохраняются по адресу вида <code>/uploads/pdfs/{`{алиас}`}.pdf</code> и
        сразу появляются на сайте: во всплывающем окне «Посмотреть каталоги»
        (футер), на странице «Скачать каталоги» и у ссылки «Сертификат
        соответствия». Повторная загрузка заменяет файл.
      </p>
    </div>
  );
}
