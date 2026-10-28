"use client";

/**
 * Управление PDF-документами сайта (каталоги, сертификат).
 * Алиас — фиксированное место назначения; загруженный файл заменяет
 * предыдущий по этому адресу. Загрузка чанками по 2 МБ (каталоги бывают
 * по 20–50 МБ, обычный multipart упирается в лимиты PHP).
 *
 * У каждого документа ещё есть:
 *  — описание (текст на карточке «Скачать каталоги»), сохраняется
 *    отдельным запросом в settings (pdf_description_{alias});
 *  — обложка для «квадратика»: картинка первой страницы PDF.
 *    После загрузки PDF обложка генерируется автоматически (pdf.js
 *    рендерит страницу 1 → JPEG), можно перегенерировать или
 *    загрузить свою картинку.
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

/* ============================================================
   Обложка: рендер первой страницы PDF через pdf.js → JPEG
   ============================================================ */

async function generateCoverBlob(pdfUrl: string, width = 480): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ url: pdfUrl }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = width / base.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  // Белая подложка: у PDF без фона страница может быть прозрачной
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) throw new Error("Не удалось создать обложку");
  return blob;
}

async function uploadCover(alias: string, blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([blob], `${alias}-cover.jpg`, { type: "image/jpeg" }));
  const res = await fetch(`/api/admin/pdfs/${alias}/cover`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Не удалось загрузить обложку");
  return json.data.cover as string;
}

/** Конвертация произвольной картинки в JPEG (для «загрузить свою обложку») */
async function imageToJpeg(file: File, maxW = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) throw new Error("Не удалось обработать картинку");
  return blob;
}

export function PdfManager({ items: initialItems }: { items: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [busyAlias, setBusyAlias] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const activeAlias = useRef<string | null>(null);

  /* Описания: черновики по алиасу + флаги сохранения */
  const [descDrafts, setDescDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialItems.map((it) => [it.alias, it.doc?.description ?? ""])
    )
  );
  const [descSaved, setDescSaved] = useState<Record<string, boolean>>({});

  function patchDoc(alias: string, patch: Partial<PdfDocInfo>) {
    setItems((list) =>
      list.map((it) =>
        it.alias === alias && it.doc ? { ...it, doc: { ...it.doc, ...patch } } : it
      )
    );
  }

  function pickFile(alias: string) {
    activeAlias.current = alias;
    setError(null);
    inputRef.current?.click();
  }

  function pickCover(alias: string) {
    activeAlias.current = alias;
    setError(null);
    coverInputRef.current?.click();
  }

  /** Авто-обложка из первой страницы только что загруженного PDF */
  async function autoCover(alias: string, doc: PdfDocInfo) {
    try {
      const blob = await generateCoverBlob(doc.url);
      const cover = await uploadCover(alias, blob);
      patchDoc(alias, { cover });
    } catch (err) {
      // Обложка не критична: PDF уже загружен
      setNote(
        `PDF загружен, но обложка не сгенерировалась: ${
          err instanceof Error ? err.message : "ошибка"
        }`
      );
    }
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
        list.map((it) =>
          it.alias === alias
            ? { ...it, doc: { ...doc, description: descDrafts[alias] ?? "" } }
            : it
        )
      );
      // Обложка генерируется после загрузки (фоном, не блокируя интерфейс)
      autoCover(alias, doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setBusyAlias(null);
      setProgress(null);
    }
  }

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const alias = activeAlias.current;
    if (!file || !alias) return;
    setBusyAlias(alias);
    setError(null);
    try {
      const blob = await imageToJpeg(file);
      const cover = await uploadCover(alias, blob);
      if (!items.find((it) => it.alias === alias)?.doc) {
        // Обложка без PDF — сохраняем как миниатюру: doc-объекта нет,
        // но квадратик на витрине показывается только для загруженных PDF
        setNote("Обложка сохранена. Она появится, когда будет загружен PDF-файл.");
      } else {
        patchDoc(alias, { cover });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить обложку");
    } finally {
      setBusyAlias(null);
    }
  }

  async function regenCover(alias: string) {
    const doc = items.find((it) => it.alias === alias)?.doc;
    if (!doc) return;
    setBusyAlias(alias);
    setError(null);
    try {
      const blob = await generateCoverBlob(doc.url);
      const cover = await uploadCover(alias, blob);
      patchDoc(alias, { cover });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить обложку");
    } finally {
      setBusyAlias(null);
    }
  }

  async function saveDescription(alias: string) {
    setError(null);
    setDescSaved((s) => ({ ...s, [alias]: false }));
    try {
      const res = await fetch(`/api/admin/pdfs/${alias}/meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: descDrafts[alias] ?? "" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Не удалось сохранить описание");
      patchDoc(alias, { description: descDrafts[alias] ?? "" });
      setDescSaved((s) => ({ ...s, [alias]: true }));
      window.setTimeout(() => setDescSaved((s) => ({ ...s, [alias]: false })), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить описание");
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
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onCoverChange}
      />

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {note && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {note}
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => {
          const busy = busyAlias === item.alias;
          const pct =
            progress && busy && progress.total > 0
              ? Math.round((progress.done / progress.total) * 100)
              : 0;
          const desc = descDrafts[item.alias] ?? "";
          return (
            <div
              key={item.alias}
              className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  {/* Квадратик с обложкой (как на витрине) */}
                  <div className="flex h-24 w-[76px] shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-soft)]">
                    {item.doc?.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.doc.cover}
                        alt={`Обложка — ${item.title}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center text-[var(--color-muted)]">
                        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        <span className="mt-0.5 text-[9px] font-bold tracking-wider">PDF</span>
                      </div>
                    )}
                  </div>
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
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => pickFile(item.alias)}
                    disabled={!!busyAlias}
                    className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                  >
                    {busy && progress ? "Загрузка…" : item.doc ? "Заменить PDF" : "Загрузить PDF"}
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

              {/* Описание и обложка — для документа */}
              <div className="mt-4 grid gap-4 border-t border-[var(--color-border)] pt-4 md:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-1 block text-[13px] font-medium text-[var(--color-heading)]">
                    Описание на карточке «Скачать каталоги»
                  </label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDescDrafts((d) => ({ ...d, [item.alias]: e.target.value }))}
                    rows={2}
                    placeholder="Например: печатный каталог сладких подарков — полистайте как книгу или скачайте PDF…"
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => saveDescription(item.alias)}
                      className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white"
                    >
                      Сохранить описание
                    </button>
                    {descSaved[item.alias] && (
                      <span className="text-[13px] text-green-700">✓ Сохранено</span>
                    )}
                  </div>
                </div>

                <div className="md:w-[220px]">
                  <label className="mb-1 block text-[13px] font-medium text-[var(--color-heading)]">
                    Обложка (квадратик)
                  </label>
                  <p className="mb-2 text-[12px] leading-relaxed text-[var(--color-muted)]">
                    Берётся из первой страницы PDF при загрузке. Можно обновить или поставить свою.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => regenCover(item.alias)}
                      disabled={!item.doc || !!busyAlias}
                      className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-heading)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40"
                    >
                      Из первой страницы
                    </button>
                    <button
                      type="button"
                      onClick={() => pickCover(item.alias)}
                      disabled={!!busyAlias}
                      className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-heading)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40"
                    >
                      Своя картинка
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-[var(--color-muted)]">
        Файлы сохраняются по адресу вида <code>/uploads/pdfs/{`{алиас}`}.pdf</code> и
        сразу появляются на сайте: во всплывающем окне «Посмотреть каталоги»
        (футер), на странице «Скачать каталоги» и у ссылки «Сертификат
        соответствия». Описание показывается на карточке «Скачать каталоги»
        (если не заполнено — используется текст из «Настройки → Текст на
        страницах»). Повторная загрузка заменяет файл и обложку.
      </p>
    </div>
  );
}
