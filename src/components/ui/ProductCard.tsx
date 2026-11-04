"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { SmartImage } from "@/components/ui/SmartImg";
import type { Product } from "@/lib/types";

interface Props {
  product: Product;
  /** Показывать видео в карточке (галочка в админке «Настройки»).
      Выключено — карточка не играет видео при наведении и без значка видео. */
  showVideos?: boolean;
}

function isPlayableLocalVideo(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/uploads/")) return true;
  return /\.(mp4|webm)(\?|$)/i.test(url);
}

export function ProductCard({ product, showVideos = true }: Props) {
  const add = useCart((s) => s.add);
  const [hover, setHover] = useState(false);
  const [videoError, setVideoError] = useState(false);
  /* Task 140: зелёная галочка после добавления — как в карточке каталога
     (ProductCardNew): нажал — корзина приняла, ответ на месте. */
  const [added, setAdded] = useState(false);

  const quickAdd = () => {
    add(product, 1);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  const hasDiscount =
    product.old_price_kopecks && product.old_price_kopecks > product.price_kopecks;

  const cover = product.media?.find((m) => m.type === "image") ?? null;

  const firstLocalVideo = product.media?.find(
    (m) =>
      m.type === "video" &&
      (m.url.startsWith("/uploads/") || /\.(mp4|webm)(\?|$)/i.test(m.url))
  );

  const hasAnyVideo = product.media?.some((m) => m.type === "video") ?? false;

  const playableVideoUrl = firstLocalVideo?.url;
  const canPlay = isPlayableLocalVideo(playableVideoUrl);
  const showVideo = showVideos && hover && canPlay && !videoError;

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white shadow-sm transition hover:shadow-md"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Link
        href={`/product/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-white"
      >
        {cover ? (
          <SmartImage
            src={cover.url}
            alt={cover.alt || product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className={`object-contain p-4 transition duration-300 ${
              showVideo ? "opacity-0" : "opacity-100 group-hover:scale-105"
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--color-muted)]">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}

        {showVideo && playableVideoUrl && (
          <video
            src={playableVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            onError={() => setVideoError(true)}
            className="absolute inset-0 h-full w-full object-contain p-4"
          />
        )}

        {hasDiscount && (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
            Скидка
          </span>
        )}

        {showVideos && hasAnyVideo && !showVideo && (
          <span
            aria-hidden
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-md"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link
          href={`/product/${product.slug}`}
          className="line-clamp-2 font-medium hover:text-[var(--color-primary)]"
        >
          {product.name}
        </Link>

        {/* Task 140: кнопка «в корзину» — круглая, с иконкой корзины, как в
            карточках каталога (ProductCardNew): цена слева, справа круглая
            кнопка; после добавления — зелёная галочка. Иконка «проезжает»
            при наведении — тот же приём, что у стрелки «Перейти». */}
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-[var(--color-heading)]">
              {formatPrice(product.price_kopecks)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-[var(--color-muted)] line-through">
                {formatPrice(product.old_price_kopecks!)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={quickAdd}
            aria-label={`Добавить «${product.name}» в корзину`}
            title="Добавить в корзину"
            className={`group/cart relative grid h-9 w-9 shrink-0 place-items-end overflow-hidden rounded-full text-white outline-none transition-all duration-150 ease-out active:scale-90 sm:h-11 sm:w-11 ${
              added
                ? "bg-[#2e9e5b]"
                : "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
            }`}
          >
            {added ? (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 place-self-center"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4.5 12.5l5 5L20 7" />
              </svg>
            ) : (
              /* Корзинка «проезжает» через кнопку при наведении — как у
                 круглых кнопок в каталоге: лента 200% ширины, на hover
                 уезжает вправо (place-items-end на самой кнопке). */
              <span className="grid h-full w-[200%] grid-cols-2 place-items-center transition-transform duration-150 ease-out group-hover/cart:translate-x-1/2">
                <svg
                  viewBox="0 0 24 24"
                  className="h-[19px] w-[19px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
                  <circle cx="17.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
                  <path d="M2.5 3.5h2.2l2.5 12h11.2l2.1-8.6H6.1" />
                </svg>
                <svg
                  viewBox="0 0 24 24"
                  className="h-[19px] w-[19px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
                  <circle cx="17.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
                  <path d="M2.5 3.5h2.2l2.5 12h11.2l2.1-8.6H6.1" />
                </svg>
              </span>
            )}
            <span className="sr-only">Добавить в корзину</span>
          </button>
        </div>
      </div>
    </div>
  );
}