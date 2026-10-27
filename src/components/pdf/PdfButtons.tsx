"use client";

/**
 * Кнопки открытия PDF: «Посмотреть каталоги» (попап с двумя каталогами
 * и вкладками) и открытие одного документа (сертификат соответствия).
 * Публичный список документов — GET /api/pdfs.
 */

import { useEffect, useState } from "react";
import { PdfViewerModal } from "./PdfViewerModal";

export interface PdfDocInfo {
  alias: string;
  title: string;
  url: string;
  size: number;
  updated_at: string;
}

export type PdfDocsMap = Record<string, PdfDocInfo | null>;

/** Публичный список загруженных PDF (алиас → файл) */
export function usePdfDocs(): PdfDocsMap | null {
  const [docs, setDocs] = useState<PdfDocsMap | null>(null);
  useEffect(() => {
    let ok = true;
    fetch("/api/pdfs")
      .then((r) => r.json())
      .then((j) => {
        if (ok) setDocs((j?.data as PdfDocsMap) ?? {});
      })
      .catch(() => {
        if (ok) setDocs({});
      });
    return () => {
      ok = false;
    };
  }, []);
  return docs;
}

/* ============================================================
   «Посмотреть каталоги» — попап с двумя каталогами
   ============================================================ */

const CATALOG_ALIASES = ["catalog_1", "catalog_2"] as const;

export function ViewCatalogsButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof CATALOG_ALIASES)[number]>("catalog_1");
  const docs = usePdfDocs();

  const current = docs?.[tab] ?? null;
  const tabTitle = (alias: string) =>
    docs?.[alias]?.title ?? (alias === "catalog_1" ? "Каталог №1" : "Каталог №2");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      <PdfViewerModal
        open={open}
        onClose={() => setOpen(false)}
        title={tabTitle(tab)}
        url={current?.url ?? null}
        toolbar={
          <div className="flex gap-2">
            {CATALOG_ALIASES.map((alias) => (
              <button
                key={alias}
                type="button"
                onClick={() => setTab(alias)}
                className={`rounded-full px-5 py-2 text-[13px] font-semibold transition ${
                  tab === alias
                    ? "bg-white text-stone-900 shadow"
                    : "bg-white/10 text-white/75 hover:bg-white/20 hover:text-white"
                }`}
              >
                {tabTitle(alias)}
              </button>
            ))}
          </div>
        }
      />
    </>
  );
}

/* ============================================================
   Открытие одного PDF (сертификат соответствия)
   ============================================================ */

export function PdfOpenButton({
  alias,
  fallbackTitle,
  className,
  children,
}: {
  alias: string;
  fallbackTitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const docs = usePdfDocs();

  const doc = docs?.[alias] ?? null;
  const title = doc?.title ?? fallbackTitle ?? "Документ";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      <PdfViewerModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        url={doc?.url ?? null}
      />
    </>
  );
}
