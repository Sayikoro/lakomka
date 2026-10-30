"use client";

/* PDF-документы — клиентская версия (список через публичный /api/pdfs). */

import { useEffect, useState } from "react";
import { PdfManager } from "@/components/admin/PdfManager";
import type { PdfDocInfo } from "@/components/pdf/PdfButtons";

interface DocsMap {
  [alias: string]: PdfDocInfo | null;
}

export default function AdminPdfPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [docs, setDocs] = useState<DocsMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/pdfs`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setError(`Ошибка ${res.status}`);
          setDocs({});
          return;
        }
        setDocs((json.data as DocsMap) ?? {});
      } catch {
        if (alive) {
          setError("Ошибка сети");
          setDocs({});
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiUrl]);

  const items = [
    {
      alias: "catalog_1",
      title: docs?.catalog_1?.title ?? "Каталог №1",
      hint: "Первый печатный каталог — открывается во всплывающем окне «Посмотреть каталоги» (вкладка 1) и на странице «Скачать каталоги».",
      doc: docs?.catalog_1 ?? null,
    },
    {
      alias: "catalog_2",
      title: docs?.catalog_2?.title ?? "Каталог №2",
      hint: "Второй печатный каталог — вкладка 2 в том же окне «Посмотреть каталоги» и на странице «Скачать каталоги».",
      doc: docs?.catalog_2 ?? null,
    },
    {
      alias: "certificate",
      title: docs?.certificate?.title ?? "Сертификат соответствия",
      hint: "Сертификат/декларация соответствия — открывается из футера по ссылке «Сертификат соответствия».",
      doc: docs?.certificate ?? null,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
          PDF-документы
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Загрузка печатных каталогов и сертификата. При загрузке файл
          привязывается к алиасу — постоянному месту на сайте.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Не удалось получить список документов: {error}
        </div>
      )}

      {docs === null ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      ) : (
        <PdfManager items={items} />
      )}
    </div>
  );
}
