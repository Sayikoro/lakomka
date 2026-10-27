"use client";

/**
 * Модалка PDF-вьювера: тёмный фон во весь экран, сверху заголовок
 * с кнопками «Скачать» и закрытием, в центре — флипбук.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Flipbook } from "./Flipbook";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string | null;
  /** Дополнительное содержимое над книгой (например, вкладки каталогов) */
  toolbar?: React.ReactNode;
}

export function PdfViewerModal({ open, onClose, title, url, toolbar }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#171412]/95 backdrop-blur-sm">
      {/* Шапка */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <h2 className="truncate text-[15px] font-semibold text-white sm:text-lg">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {url && (
            <a
              href={url}
              download={`${title}.pdf`}
              className="hidden items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-[13px] font-medium text-white/90 transition hover:border-white/50 hover:text-white sm:inline-flex"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
              Скачать PDF
            </a>
          )}
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      </div>

      {toolbar && <div className="flex justify-center px-4 pb-3">{toolbar}</div>}

      {/* Книга */}
      <div className="min-h-0 flex-1 px-2 pb-2 sm:px-6 sm:pb-4">
        {url ? (
          <Flipbook key={url} url={url} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <svg viewBox="0 0 24 24" className="h-12 w-12 text-white/30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <p className="text-white/70">Документ пока не загружен</p>
            <p className="max-w-xs text-[13px] text-white/40">
              Файл появится здесь после загрузки в админке — раздел «PDF».
            </p>
          </div>
        )}
      </div>

      {/* Скачать на мобильных — в подвале */}
      {url && (
        <div className="flex justify-center pb-4 sm:hidden">
          <a
            href={url}
            download={`${title}.pdf`}
            className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[13px] font-medium text-white/90"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            Скачать PDF
          </a>
        </div>
      )}
    </div>,
    document.body
  );
}
