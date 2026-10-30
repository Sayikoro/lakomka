"use client";

/* Список товаров — клиентская версия (данные через /api/admin/products),
 * работает и в dev, и в статическом деплое. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProductsTable } from "@/components/admin/ProductsTable";
import { ProductsImportExport } from "@/components/admin/ProductsImportExport";

export interface AdminProduct {
  id: number;
  sku: string | null;
  slug: string;
  name: string;
  type: string;
  price_kopecks: number;
  stock_qty: number;
  show_in_catalog: number;
  is_published: number;
  category_id: number | null;
}

export default function AdminProductsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/products`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        setProducts([]);
        return;
      }
      setProducts((json.data as AdminProduct[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setProducts([]);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
          Товары{" "}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            ({products?.length ?? "…"})
          </span>
        </h1>
        <Link
          href="/admin/products/new"
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
        >
          + Добавить товар
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {products === null ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      ) : (
        <>
          <ProductsImportExport />
          <ProductsTable initialProducts={products} />
        </>
      )}
    </div>
  );
}
