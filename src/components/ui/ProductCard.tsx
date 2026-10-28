"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { SmartImage } from "@/components/ui/SmartImg";
import type { Product } from "@/lib/types";

interface Props {
  product: Product;
}

function isPlayableLocalVideo(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/uploads/")) return true;
  return /\.(mp4|webm)(\?|$)/i.test(url);
}

export function ProductCard({ product }: Props) {
  const add = useCart((s) => s.add);
  const [hover, setHover] = useState(false);
  const [videoError, setVideoError] = useState(false);

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
  const showVideo = hover && canPlay && !videoError;

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

        {hasAnyVideo && !showVideo && (
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

        <div className="mt-auto flex items-end justify-between gap-2">
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
            onClick={() => add(product, 1)}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] active:scale-95"
            aria-label={`Добавить «${product.name}» в корзину`}
          >
            В корзину
          </button>
        </div>
      </div>
    </div>
  );
}