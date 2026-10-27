"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { Product, ProductMedia } from "@/lib/types";

/* ============================================================
   Новая карточка товара (белая, карусель-кроссфейд + точки).
   Слайды = всё медиа товара в порядке сортировки: фото + видео
   (локальные видео проигрываются прямо в слайде, внешние —
   YouTube/VK — открываются в карточке товара по клику).
   Перелистывание — кликом по картинке (следующий слайд) и
   горизонтальным свайпом. Смена слайда — кроссфейд на месте:
   картинка никуда не «уезжает» за пределы карточки. Колесо
   мыши и вертикальный свайп над картинкой всегда скроллят
   страницу, ничего не «замирает».
   ============================================================ */

interface Props {
  product: Product;
  className?: string;
}

function isLocalVideo(url: string): boolean {
  return url.startsWith("/uploads/") || /\.(mp4|webm)(\?|$)/i.test(url);
}

export function ProductCardNew({ product, className = "" }: Props) {
  const media: ProductMedia[] = useMemo(
    () => [...product.media].sort((a, b) => a.sort_order - b.sort_order),
    [product.media]
  );

  const posterUrl = useMemo(
    () => media.find((m) => m.type === "image")?.url ?? null,
    [media]
  );

  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const swipeRef = useRef<{ x: number; y: number; consumed: boolean } | null>(
    null
  );
  const [active, setActive] = useState(0);

  const count = media.length;

  const hasDiscount =
    product.old_price_kopecks &&
    product.old_price_kopecks > product.price_kopecks;

  // Видео играет только на активном слайде
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (i === active) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [active]);

  const goTo = useCallback((i: number) => setActive(i), []);
  const nextSlide = useCallback(
    () => setActive((cur) => (count ? (cur + 1) % count : 0)),
    [count]
  );
  const prevSlide = useCallback(
    () => setActive((cur) => (count ? (cur - 1 + count) % count : 0)),
    [count]
  );

  const href = `/product/${product.slug}`;

  return (
    <div className={`flex max-w-[calc(100vw-2rem)] ${className}`}>
      <article
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button")) return;
          (e.currentTarget.querySelector("a") as HTMLAnchorElement | null)?.click();
        }}
        className="group relative flex w-full max-w-full cursor-pointer flex-col gap-3 rounded-3xl bg-white p-1 [-webkit-tap-highlight-color:transparent]"
        style={{
          boxShadow:
            "0 0 0 1px hsl(0 0% 0% / 0.07), 0 4px 12px -4px hsl(0 0% 0% / 0.15)",
        }}
      >
        {/* ── Карусель медиа (кроссфейд, без выезда за карточку) + точки ── */}
        {/* Рамка 1:1 — фото не обрезаются; внутри отступ 10px (p-[10px] на img с object-contain) */}
        <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
          <div
            className={
              "relative h-full w-full overflow-hidden rounded-[20px] [touch-action:pan-y] " +
              (count > 1 ? "cursor-pointer" : "")
            }
            onPointerDown={(e) => {
              swipeRef.current = { x: e.clientX, y: e.clientY, consumed: false };
            }}
            onPointerMove={(e) => {
              const s = swipeRef.current;
              if (!s || s.consumed) return;
              const dx = e.clientX - s.x;
              const dy = e.clientY - s.y;
              if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                s.consumed = true;
                if (dx < 0) nextSlide();
                else prevSlide();
              }
            }}
            onPointerLeave={() => {
              swipeRef.current = null;
            }}
            onPointerCancel={() => {
              swipeRef.current = null;
            }}
            onClick={(e) => {
              if (swipeRef.current?.consumed) return; // это был свайп, не клик
              if (count > 1) {
                e.stopPropagation(); // не открывать карточку товара
                nextSlide();
              }
              // Один слайд — клик открывает товар (обрабатывает article)
            }}
          >
            {count === 0 && (
              <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-soft)] text-[var(--color-muted)]">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            )}

            {media.map((m, i) => (
              <div
                key={m.id}
                aria-hidden={i !== active}
                className="absolute inset-0 transition-opacity duration-300 ease-out"
                style={{
                  opacity: i === active ? 1 : 0,
                  pointerEvents: i === active ? "auto" : "none",
                }}
              >
                {m.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={i === active ? product.name : ""}
                    draggable={false}
                    className="h-full w-full select-none rounded-[20px] bg-white object-contain p-[10px]"
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                ) : isLocalVideo(m.url) ? (
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(i, el);
                      else videoRefs.current.delete(i);
                    }}
                    src={m.url}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onError={(e) => {
                      (e.currentTarget.style.visibility = "hidden");
                    }}
                    className="h-full w-full select-none rounded-[20px] bg-black object-cover"
                  />
                ) : (
                  /* Внешнее видео (YouTube/VK/Rutube) — постер с кнопкой, внутри карточки товара */
                  <div className="relative h-full w-full select-none rounded-[20px] bg-[var(--color-bg-soft)]">
                    {posterUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={posterUrl}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-cover opacity-90"
                        loading="lazy"
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white shadow-lg">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {count > 1 && (
            <div
              role="tablist"
              aria-label="Слайды товара"
              className="absolute left-1/2 top-[calc(100%+6px)] z-10 flex h-3.5 -translate-x-1/2 items-center justify-center gap-1.5"
            >
              {media.map((_, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Слайд ${i + 1} из ${count}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      goTo(i);
                    }}
                    className={
                      "h-1.5 shrink-0 cursor-pointer rounded-full border-0 p-0 outline-none transition-all duration-300 ease-out " +
                      "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
                      (isActive
                        ? "w-6 bg-[var(--color-primary)]"
                        : "w-1.5 bg-black/20 hover:bg-black/40")
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Название сразу после картинки ── */}
        <div className="px-2.5 pt-2">
          <h2
            className="m-0 leading-[1.1] tracking-[-0.16px]"
            /* инлайном — глобальное правило h1..h6 в globals.css перебивает утилиты Tailwind 4 */
            style={{ color: "#3a3a3a", lineHeight: 1.1 }}
          >
            {product.manufacturer && (
              <span className="block text-[9px] sm:text-[10px] font-extrabold uppercase text-[#7a7a7a]">
                {product.manufacturer}
              </span>
            )}
            <span className="block line-clamp-2 break-words text-[10px] sm:text-[12px] lg:text-[14px]">{product.name}</span>
          </h2>
        </div>

        {/* ── Цена слева, кнопка справа ── */}
        <div className="mt-auto flex items-center justify-between gap-2.5 px-2.5 pb-2.5 pt-1">
          <p className="m-0 text-[1.2rem] font-light leading-tight tracking-[-0.24px] text-[#4b4f58]">
            {formatPrice(product.price_kopecks)}
            {hasDiscount && (
              <span className="ml-2 text-sm text-[#9a9a99] line-through">
                {formatPrice(product.old_price_kopecks!)}
              </span>
            )}
          </p>

          <Link
            href={href}
            aria-label={`Открыть «${product.name}»`}
            className="group/btn relative grid aspect-square h-full max-h-[44px] shrink-0 translate-x-0.5 place-items-end overflow-hidden rounded-full bg-[var(--color-primary)] text-white no-underline outline-none transition-[background] duration-150 ease-out hover:bg-[var(--color-primary-hover)]"
          >
            <span className="grid h-full w-[200%] grid-cols-2 place-items-center transition-transform duration-150 ease-out group-hover/btn:translate-x-1/2">
              <svg
                viewBox="0 0 16 16"
                className="w-1/2 opacity-80 transition-opacity duration-150 ease-out group-hover/btn:opacity-100"
                fill="none"
                aria-hidden
              >
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <svg
                viewBox="0 0 16 16"
                className="w-1/2 opacity-80 transition-opacity duration-150 ease-out group-hover/btn:opacity-100"
                fill="none"
                aria-hidden
              >
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="sr-only">{`Открыть «${product.name}»`}</span>
          </Link>
        </div>
      </article>
    </div>
  );
}
