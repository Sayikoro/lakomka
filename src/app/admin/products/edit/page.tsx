"use client";

/* Редактирование товара — клиентская версия (бывшая /admin/products/[id]).
 * В статическом деплое динамические роуты не работают без generateStaticParams,
 * поэтому редактирование живёт на query-параметре: /admin/products/edit?id=123.
 * Данные: GET /api/admin/products/{id} + /bundle, httpOnly-кука автоматом. */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ProductForm, type ProductFormValues } from "@/components/admin/ProductForm";
import { BundleEditor, type BundleRow } from "@/components/admin/BundleEditor";
import { MediaUploader, type MediaItem } from "@/components/admin/MediaUploader";

interface AdminProductFull {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  type: string;
  price_kopecks: number;
  stock_qty: number;
  show_in_catalog: number;
  is_published: number;
  description: string | null;
  manufacturer: string | null;
  packaging_material: string | null;
  weight_g: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  recipe_weight_g: number | null;
  media?: MediaItem[];
}

function ProductEditInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [product, setProduct] = useState<AdminProductFull | null>(null);
  const [bundle, setBundle] = useState<BundleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [prodRes, bundleRes] = await Promise.all([
        fetch(`${apiUrl}/admin/products/${id}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`${apiUrl}/admin/products/${id}/bundle`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const prodJson = await prodRes.json().catch(() => ({}));
      if (!prodRes.ok) {
        setError(prodJson.error ?? `Ошибка ${prodRes.status}`);
        setProduct(null);
        return;
      }
      setProduct((prodJson.data as AdminProductFull) ?? null);
      if (bundleRes.ok) {
        const bJson = await bundleRes.json().catch(() => ({}));
        setBundle((bJson.data as BundleRow[]) ?? []);
      } else {
        setBundle([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) {
    return (
      <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Не указан товар. Выберите его в{" "}
        <Link href="/admin/products" className="underline">
          списке товаров
        </Link>
        .
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
        Загрузка товара…
      </div>
    );
  }

  if (error || !product) {
    return (
      <div>
        <div className="mb-6">
          <Link
            href="/admin/products"
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
          >
            ← К списку товаров
          </Link>
        </div>
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error ?? "Товар не найден"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/products"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
        >
          ← К списку товаров
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">{product.name}</h1>
        <span className="text-sm text-[var(--color-muted)]">
          ID: {product.id} · {product.type === "bundle" ? "набор" : "товар"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <ProductForm
            mode="edit"
            initial={{
              id: product.id,
              name: product.name,
              slug: product.slug,
              sku: product.sku ?? "",
              type: product.type as ProductFormValues["type"],
              price_kopecks: product.price_kopecks,
              stock_qty: product.stock_qty,
              show_in_catalog: product.show_in_catalog,
              is_published: product.is_published,
              description: product.description ?? "",
              manufacturer: product.manufacturer ?? "",
              packaging_material: product.packaging_material ?? "",
              weight_g: product.weight_g ?? null,
              length_cm: product.length_cm ?? null,
              width_cm: product.width_cm ?? null,
              height_cm: product.height_cm ?? null,
              recipe_weight_g: product.recipe_weight_g ?? null,
            }}
          />

          <MediaUploader productId={product.id} initial={product.media ?? []} />
        </div>

        {product.type === "bundle" ? (
          <BundleEditor
            productId={product.id}
            initial={bundle}
            initialRecipeWeight={product.recipe_weight_g ?? null}
          />
        ) : (
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-6 text-sm text-[var(--color-muted)]">
            Это простой товар. Состав набора появляется только у наборов.
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminProductEditPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка товара…
        </div>
      }
    >
      <ProductEditInner />
    </Suspense>
  );
}
