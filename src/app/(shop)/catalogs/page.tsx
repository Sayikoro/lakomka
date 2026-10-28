import type { Metadata } from "next";
import Link from "next/link";
import { CatalogsBrowser } from "./CatalogsBrowser";
import { getPublicSettings } from "@/lib/settings";
import { tFrom } from "@/lib/page-texts";
import type { PdfDocInfo } from "@/components/pdf/PdfButtons";

export const metadata: Metadata = {
  title: "Скачать каталоги",
  description:
    "Печатные каталоги сладких подарков «Лакомка» в PDF: посмотрите с перелистыванием страниц или скачайте. Сертификат соответствия.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/catalogs" },
};

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

export default async function CatalogsPage() {
  const [docs, cfg] = await Promise.all([getDocs(), getPublicSettings()]);

  /* Описание карточки: из админки (раздел «PDF») → иначе дефолт из
     реестра «Текст на страницах» */
  const items = [
    {
      alias: "catalog_1",
      title: docs.catalog_1?.title ?? "Каталог №1",
      description:
        docs.catalog_1?.description ||
        tFrom(cfg.texts, "catalogs_card1_desc"),
      doc: docs.catalog_1 ?? null,
    },
    {
      alias: "catalog_2",
      title: docs.catalog_2?.title ?? "Каталог №2",
      description:
        docs.catalog_2?.description ||
        tFrom(cfg.texts, "catalogs_card2_desc"),
      doc: docs.catalog_2 ?? null,
    },
    {
      alias: "certificate",
      title: docs.certificate?.title ?? "Сертификат соответствия",
      description:
        docs.certificate?.description ||
        tFrom(cfg.texts, "catalogs_cert_desc"),
      doc: docs.certificate ?? null,
    },
  ];

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10">
      <nav className="mb-6 text-sm text-[var(--color-muted)]">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Главная
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-heading)]">Каталоги</span>
      </nav>

      <h1 className="text-[30px] font-medium uppercase tracking-wide text-[var(--color-heading)]">
        {tFrom(cfg.texts, "catalogs_h1")}
      </h1>
      <p className="mb-8 mt-3 max-w-[720px] text-[15px] leading-relaxed text-[var(--color-muted)]">
        {tFrom(cfg.texts, "catalogs_intro")}
      </p>

      <CatalogsBrowser items={items} />
    </div>
  );
}
