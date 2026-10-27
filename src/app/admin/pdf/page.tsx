import { cookies } from "next/headers";
import { PdfManager } from "@/components/admin/PdfManager";
import type { PdfDocInfo } from "@/components/pdf/PdfButtons";

const API_URL = process.env.PHP_API_URL ?? "http://127.0.0.1:8000/api";

interface DocsMap {
  [alias: string]: PdfDocInfo | null;
}

async function getDocs(): Promise<DocsMap> {
  try {
    const res = await fetch(`${API_URL}/pdfs`, { cache: "no-store" });
    if (!res.ok) return {};
    const json = (await res.json()) as { data?: DocsMap };
    return json.data ?? {};
  } catch {
    return {};
  }
}

export default async function AdminPdfPage() {
  const docs = await getDocs();

  const items = [
    {
      alias: "catalog_1",
      title: docs.catalog_1?.title ?? "Каталог №1",
      hint: "Первый печатный каталог — открывается во всплывающем окне «Посмотреть каталоги» (вкладка 1) и на странице «Скачать каталоги».",
      doc: docs.catalog_1 ?? null,
    },
    {
      alias: "catalog_2",
      title: docs.catalog_2?.title ?? "Каталог №2",
      hint: "Второй печатный каталог — вкладка 2 в том же окне «Посмотреть каталоги» и на странице «Скачать каталоги».",
      doc: docs.catalog_2 ?? null,
    },
    {
      alias: "certificate",
      title: docs.certificate?.title ?? "Сертификат соответствия",
      hint: "Сертификат/декларация соответствия — открывается из футера по ссылке «Сертификат соответствия».",
      doc: docs.certificate ?? null,
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

      <PdfManager items={items} />
    </div>
  );
}
