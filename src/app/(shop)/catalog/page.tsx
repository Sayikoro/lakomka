import { getCategories, getProducts, getCandyFilters } from "@/lib/products";
import { getPublicSettings } from "@/lib/settings";
import { tFrom } from "@/lib/page-texts";
import { CatalogClient } from "./CatalogClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Каталог подарков",
  description:
    "Полный каталог новогодних подарков и наборов конфет. Фильтры по типу упаковки, весу и цене. Доставка по Хабаровску.",
  alternates: {
    canonical: "/catalog",
  },
  openGraph: {
    title: "Каталог — Лакомка",
    description: "Новогодние наборы, ВИП-подарки, конфеты. Доставка по Хабаровску.",
    url: "/catalog",
  },
};

export default async function CatalogPage() {
  const [products, categories, cfg, candyFilters] = await Promise.all([
    getProducts(),
    getCategories(),
    getPublicSettings(),
    getCandyFilters(),
  ]);

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10">
      <h1 className="mb-6 text-[40px] font-medium text-[var(--color-heading)]">
        {tFrom(cfg.texts, "catalog_h1")}
      </h1>

      {products.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-12 text-center">
          <p className="mb-2 font-medium text-[var(--color-heading)]">
            {tFrom(cfg.texts, "catalog_empty_title")}
          </p>
          <p className="text-sm text-[var(--color-muted)]">
            Проверь{" "}
            <code className="rounded bg-white px-1.5 py-0.5">
              curl http://localhost:8000/api/products
            </code>
          </p>
        </div>
      ) : (
        <CatalogClient
          products={products}
          categories={categories}
          template={cfg.product_card_template}
          candyFilters={candyFilters}
        />
      )}
    </div>
  );
}