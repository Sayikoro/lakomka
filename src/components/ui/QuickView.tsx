"use client";

/* ============================================================
   Task 141: быстрый просмотр товара из каталога.

   Модалка с компактной версией карточки: фото, производитель,
   цена, количество + «В корзину», краткое описание и ссылка
   «Открыть карточку товара». Открывается кнопкой-глазом на
   карточке каталога (включается галочкой в Настройках).

   Открытие модалки считается просмотром подарка: trackGiftView
   с той же защитой от дублирования (раз в минуту на slug), что
   и у полной карточки — конверсия в «Популярных подарках»
   остаётся честной. Данные берутся из уже загруженного каталога
   — лишних запросов модалка не делает.
   ============================================================ */

import { useEffect } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { SmartImg } from "@/components/ui/SmartImg";
import { AddToCart } from "@/components/ui/AddToCart";
import { formatPrice } from "@/lib/utils";
import { trackGiftView } from "@/lib/visit-tracker";
import { useT } from "@/components/texts/TextsProvider";
import type { Product } from "@/lib/types";

interface Props {
  product: Product | null;
  onClose: () => void;
}

export function QuickView({ product, onClose }: Props) {
  const t = useT();

  /* Открытие = просмотр подарка (аналитика; раз в минуту на slug).
     Обложка вычисляется прямо при рендере — без состояния и лишних
     перерендеров: модалка каждый раз монтируется с новым товаром. */
  useEffect(() => {
    if (!product) return;
    trackGiftView(product.slug, product.name);
  }, [product]);

  if (!product) return null;

  const hasDiscount =
    product.old_price_kopecks && product.old_price_kopecks > product.price_kopecks;

  const description = (product.description ?? "").trim();
  const cover = product.images[0]?.url ?? product.media[0]?.url ?? null;

  return (
    <Modal open onClose={onClose} title={product.name} testId="quick-view-dialog">
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Фото */}
        <div className="relative">
          {cover ? (
            <SmartImg
              src={cover}
              alt={product.name}
              wrapperClassName="block aspect-square w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white"
              skeletonClassName="rounded-[var(--radius-card)]"
              className="h-full w-full object-contain p-3"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white text-[var(--color-muted)]">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
          {hasDiscount && (
            <span className="absolute left-3 top-3 rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
              Скидка
            </span>
          )}
        </div>

        {/* Информация */}
        <div className="flex min-w-0 flex-col gap-3">
          {product.manufacturer && (
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#7a7a7a]">
              {product.manufacturer}
            </p>
          )}

          <p className="text-2xl font-semibold leading-tight text-[var(--color-heading)]">
            {formatPrice(product.price_kopecks)}
            {hasDiscount && (
              <span className="ml-2 text-base font-normal text-[var(--color-muted)] line-through">
                {formatPrice(product.old_price_kopecks!)}
              </span>
            )}
          </p>

          <AddToCart product={product} />

          {description && (
            <p className="line-clamp-4 text-sm leading-relaxed text-[var(--color-body)]">
              {description}
            </p>
          )}

          <Link
            href={`/product/${product.slug}`}
            onClick={onClose}
            data-testid="quick-view-open"
            className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] underline-offset-4 hover:underline"
          >
            {t("product_open_full")}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
