import { getProducts } from "@/lib/products";
import { CatalogClient } from "./CatalogClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Каталог подарков",
  description:
    "Полный каталог новогодних подарков и наборов конфет. Фильтры по упаковке и цене. Доставка по Хабаровску.",
  alternates: {
    canonical: "/catalog",
  },
  openGraph: {
    title: "Каталог — Лакомка",
    description: "Новогодние наборы, VIP-подарки, конфеты. Доставка по Хабаровску.",
    url: "/catalog",
  },
};

export default async function CatalogPage() {
  const products = await getProducts();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <h1 className="mb-6 text-[40px] font-medium text-[var(--color-heading)]">
        Каталог
      </h1>

      {products.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-12 text-center">
          <p className="mb-2 font-medium text-[var(--color-heading)]">
            В каталоге пока ничего нет
          </p>
          <p className="text-sm text-[var(--color-muted)]">
            Проверь{" "}
            <code className="rounded bg-white px-1.5 py-0.5">
              curl http://localhost:8000/api/products
            </code>
          </p>
        </div>
      ) : (
        <CatalogClient products={products} />
      )}
    </div>
  );
}