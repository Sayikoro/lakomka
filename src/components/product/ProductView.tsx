"use client";

/* ============================================================
   Живая карточка товара.
   ProductView — вся вёрстка страницы товара (перенесена из
   server-компоненты, чтобы данные можно было обновлять на клиенте).
   ProductLive — держит состояние товара: стартует с запечённой
   версии (SEO, мгновенный рендер), после монтирования подтягивает
   свежую с /api/products/<slug> — цены, фото, видео и описание
   на развёрнутом сайте обновляются без пересборки.
   ============================================================ */

import { useEffect, useState } from "react";
import Link from "next/link";

import { fetchLiveProductBySlug, productsDiffer } from "@/lib/product-api";
import { AddToCart } from "@/components/ui/AddToCart";
import { ProductGallery } from "@/components/ui/ProductGallery";
import { ProductTabs } from "@/components/ui/ProductTabs";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/lib/types";

/** Вес в человекочитаемом виде: 520 → «520 г», 1500 → «1,5 кг» */
function formatWeightLine(g: number | null | undefined): string | null {
  if (!g || g <= 0) return null;
  if (g >= 1000) {
    const kg = g / 1000;
    const s = kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `${s} кг`;
  }
  return `${g} г`;
}

/** Габариты: «20 × 15 × 10 см»; null если все размеры пустые */
function formatDimsLine(
  l: number | null | undefined,
  w: number | null | undefined,
  h: number | null | undefined,
): string | null {
  if (!l && !w && !h) return null;
  const fmt = (n: number | null | undefined) =>
    n ? (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".0", "").replace(".", ",")) : "—";
  return `${fmt(l)} × ${fmt(w)} × ${fmt(h)} см`;
}

export function ProductView({ product }: { product: Product }) {
  const hasDiscount =
    product.old_price_kopecks && product.old_price_kopecks > product.price_kopecks;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 sm:py-8">
      {/* Хлебные крошки */}
      <nav className="mb-4 text-xs text-[var(--color-muted)] sm:mb-6 sm:text-sm">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Главная
        </Link>
        <span className="mx-2">/</span>
        <Link href="/catalog" className="hover:text-[var(--color-primary)]">
          Каталог
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-heading)]">{product.name}</span>
      </nav>

      {/* Верх: галерея + инфо */}
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <ProductGallery media={product.media} productName={product.name} />

        <div className="space-y-4 sm:space-y-5">
          <h1 className="text-2xl font-medium leading-tight text-[var(--color-heading)] sm:text-[32px]">
            {product.name}
          </h1>

          {product.manufacturer && (
            <p className="text-sm text-[var(--color-body)]">
              Производитель:{" "}
              <span className="font-medium text-[var(--color-heading)]">
                {product.manufacturer}
              </span>
            </p>
          )}

          <div className="flex items-end gap-3">
            <span className="text-[26px] font-semibold text-[var(--color-heading)] sm:text-[32px]">
              {formatPrice(product.price_kopecks)}
            </span>
            {hasDiscount && (
              <span className="text-lg text-[var(--color-muted)] line-through">
                {formatPrice(product.old_price_kopecks!)}
              </span>
            )}
          </div>

          <AddToCart product={product} />

          {(formatWeightLine(product.weight_g) || formatDimsLine(product.length_cm, product.width_cm, product.height_cm)) && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm text-[var(--color-body)]">
              {formatWeightLine(product.weight_g) && (
                <span className="inline-flex items-center gap-2">
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]">
                    <path d="M8.5 8.5a3.5 3.5 0 0 1 7 0" />
                    <rect x="4.5" y="8.5" width="15" height="11.5" rx="2.5" />
                  </svg>
                  <span>
                    Вес:{" "}
                    <span className="font-medium text-[var(--color-heading)]">
                      {formatWeightLine(product.weight_g)}
                    </span>
                  </span>
                </span>
              )}
              {formatDimsLine(product.length_cm, product.width_cm, product.height_cm) && (
                <span className="inline-flex items-center gap-2">
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]">
                    <rect x="2.5" y="9" width="19" height="6" rx="1.5" />
                    <path d="M7 9v3M12 9v2.5M17 9v3" />
                  </svg>
                  <span>
                    Габариты:{" "}
                    <span className="font-medium text-[var(--color-heading)]">
                      {formatDimsLine(product.length_cm, product.width_cm, product.height_cm)}
                    </span>
                  </span>
                </span>
              )}
            </div>
          )}

          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5 text-sm text-[var(--color-body)]">
            <h2 className="mb-2 font-semibold text-[var(--color-heading)]">
              Доставка
            </h2>
            <p>
              Бесплатно по Хабаровску от 5 000 ₽. За городом — по тарифам ТК.
              Точную стоимость подтвердим после оформления.
            </p>
          </div>
        </div>
      </div>

      {/* Низ: табы */}
      <div className="mt-6 sm:mt-10">
        <ProductTabs product={product} />
      </div>
    </div>
  );
}

export function ProductLive({
  slug,
  initial,
}: {
  slug: string;
  initial: Product;
}) {
  const [product, setProduct] = useState<Product>(initial);

  useEffect(() => {
    let cancelled = false;
    fetchLiveProductBySlug(slug)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        setProduct((cur) =>
          productsDiffer([cur], [fresh]) ? fresh : cur,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return <ProductView product={product} />;
}
