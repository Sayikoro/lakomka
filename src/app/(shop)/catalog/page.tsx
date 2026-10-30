import { getCategories, getProducts } from "@/lib/products";
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
  const [products, categories, cfg] = await Promise.all([
    getProducts(),
    getCategories(),
    getPublicSettings(),
  ]);

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10">
      <h1 className="mb-6 text-[40px] font-medium text-[var(--color-heading)]">
        {tFrom(cfg.texts, "catalog_h1")}
      </h1>

      {/* CatalogClient — клиентский: если запечённый каталог пуст (сборка при
          недоступном API) или устарел — после монтирования подтянет живые
          данные с /api/products (скелетон вместо дебаг-подсказки) */}
      <CatalogClient
        products={products}
        categories={categories}
        template={cfg.product_card_template}
      />
    </div>
  );
}