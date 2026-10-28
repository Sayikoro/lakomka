"use client";

/**
 * Клиентская часть страницы «Скачать каталоги»: карточки документов
 * с просмотром во флипбуке и скачиванием.
 */

import { useState } from "react";
import { PdfViewerModal } from "@/components/pdf/PdfViewerModal";
import { SmartImg } from "@/components/ui/SmartImg";
import type { PdfDocInfo } from "@/components/pdf/PdfButtons";

interface Item {
  alias: string;
  title: string;
  description: string;
  doc: PdfDocInfo | null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export function CatalogsBrowser({ items }: { items: Item[] }) {
  const [viewing, setViewing] = useState<Item | null>(null);

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.alias}
            className="flex flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)]"
          >
            <div className="flex items-start gap-4">
              {/* Квадратик-миниатюра: обложка из первой страницы PDF
                  (загружается в админке), без неё — иконка PDF */}
              {item.doc?.cover ? (
                <SmartImg
                  src={item.doc.cover}
                  alt={`Обложка — ${item.title}`}
                  wrapperClassName="h-20 w-16 shrink-0 rounded-lg border border-[var(--color-border)] shadow-inner"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-b from-[#fdeef1] to-[#f9dfe5] text-[var(--color-primary)] shadow-inner">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M9 13h6M9 17h4" />
                  </svg>
                  <span className="mt-0.5 text-[9px] font-bold tracking-wider">PDF</span>
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold text-[var(--color-heading)]">
                  {item.title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">
                  {item.description}
                </p>
                {item.doc && (
                  <p className="mt-1.5 text-[12px] text-[var(--color-muted)]">
                    PDF · {formatSize(item.doc.size)} · обновлён{" "}
                    {new Date(item.doc.updated_at).toLocaleDateString("ru-RU")}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setViewing(item)}
                disabled={!item.doc}
                className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.04em] text-white transition hover:bg-[var(--color-primary-hover)] active:scale-95 disabled:pointer-events-none disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
                Смотреть
              </button>

              {item.doc ? (
                <a
                  href={item.doc.url}
                  download={`${item.title}.pdf`}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-white px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.04em] text-[var(--color-heading)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] active:scale-95"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                  Скачать PDF
                </a>
              ) : (
                <span className="inline-flex items-center rounded-[var(--radius-btn)] bg-[var(--color-bg-soft)] px-5 py-2.5 text-[13px] text-[var(--color-muted)]">
                  Файл ещё не загружен
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Вьювер поверх страницы */}
      <PdfViewerModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? ""}
        url={viewing?.doc?.url ?? null}
      />
    </>
  );
}
