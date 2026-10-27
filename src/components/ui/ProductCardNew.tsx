"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { Product, ProductMedia } from "@/lib/types";

/* ============================================================
   Новая карточка товара (тёмная, со свайп-каруселью и точками).
   Слайды = всё медиа товара в порядке сортировки: фото + видео
   (локальные видео проигрываются прямо в слайде, внешние —
   YouTube/VK — открываются в карточке товара по клику).
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

  const scrollerRef = useRef<HTMLUListElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const [active, setActive] = useState(0);

  const hasDiscount =
    product.old_price_kopecks &&
    product.old_price_kopecks > product.price_kopecks;

  // Синхронизация точки со свайпом
  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const w = s.offsetWidth;
        if (!w) return;
        const i = Math.round(s.scrollLeft / w);
        setActive((cur) => (i !== cur ? i : cur));
      });
    };
    s.addEventListener("scroll", onScroll, { passive: true });
    return () => s.removeEventListener("scroll", onScroll);
  }, []);

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

  const goTo = useCallback((i: number) => {
    const s = scrollerRef.current;
    if (!s) return;
    const li = s.children[i] as HTMLElement | undefined;
    if (!li) return;
    li.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setActive(i);
  }, []);

  const href = `/product/${product.slug}`;
  const count = media.length;

  return (
    <div className={`flex max-w-[calc(100vw-2rem)] ${className}`}>
      <article
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button")) return;
          (e.currentTarget.querySelector("a") as HTMLAnchorElement | null)?.click();
        }}
        className="group relative flex w-full max-w-full cursor-pointer flex-col gap-4 rounded-3xl bg-[hsl(0_0%_22%)] p-1 [-webkit-tap-highlight-color:transparent]"
        style={{
          boxShadow:
            "0 1px 0 0 hsl(0 0% 100% / 0.08) inset, 0 0 0 1px hsl(0 0% 100% / 0.06), 0 4px 12px -4px hsl(0 0% 0% / 0.6)",
        }}
      >
        {/* ── Карусель медиа + точки ── */}
        <div className="relative w-full" style={{ aspectRatio: "385 / 315" }}>
          <ul
            ref={scrollerRef}
            className="m-0 flex h-full w-full list-none overflow-x-auto overflow-y-hidden rounded-[20px] overscroll-none p-0 [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {count === 0 && (
              <li className="h-full w-full shrink-0 [scroll-snap-align:center]">
                <div className="flex h-full w-full items-center justify-center rounded-[20px] bg-[hsl(0_0%_14%)] text-[hsl(0_0%_45%)]">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </li>
            )}

            {media.map((m, i) => (
              <li key={m.id} className="h-full w-full shrink-0 [scroll-snap-align:center]">
                {m.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={i === active ? product.name : ""}
                    draggable={false}
                    className="h-full w-full select-none rounded-[20px] bg-white object-cover"
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
                  <div className="relative h-full w-full select-none rounded-[20px] bg-[hsl(0_0%_14%)]">
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
              </li>
            ))}
          </ul>

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
                      "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(0_0%_22%)] " +
                      (isActive
                        ? "w-6 bg-white/80"
                        : "w-1.5 bg-white/25 hover:bg-white/45")
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Низ карточки ── */}
        <div className="flex flex-1 items-center justify-between gap-2.5 px-2.5 pb-2.5 pt-7">
          <div className="grid min-w-0 gap-0.5">
            <h2
              className="m-0 grid leading-[1.1] tracking-[-0.16px] text-[#cfcfce]"
              /* инлайном — глобальное правило h1..h6 в globals.css перебивает утилиты Tailwind 4 */
              style={{ color: "#cfcfce", lineHeight: 1.1 }}
            >
              {product.manufacturer && (
                <span className="text-[0.675rem] font-extrabold uppercase text-[#9a9a99]">
                  {product.manufacturer}
                </span>
              )}
              <span className="line-clamp-2 break-words text-lg sm:text-2xl">{product.name}</span>
            </h2>
            <p className="m-0 text-[1.2rem] font-light leading-tight tracking-[-0.24px] text-[#91918f]">
              {formatPrice(product.price_kopecks)}
              {hasDiscount && (
                <span className="ml-2 text-sm text-[#6b6b6a] line-through">
                  {formatPrice(product.old_price_kopecks!)}
                </span>
              )}
            </p>
          </div>

          <Link
            href={href}
            aria-label={`Открыть «${product.name}»`}
            className="group/btn relative grid aspect-square h-full max-h-[56px] shrink-0 translate-x-0.5 place-items-end overflow-hidden rounded-full border border-white/20 bg-[hsl(0_0%_8%)] text-inherit no-underline outline-none transition-[background,box-shadow] duration-150 ease-out hover:bg-black"
          >
            <span className="grid h-full w-[200%] grid-cols-2 place-items-center transition-transform duration-150 ease-out group-hover/btn:translate-x-1/2">
              <svg
                viewBox="0 0 16 16"
                className="w-1/2 opacity-50 transition-opacity duration-150 ease-out group-hover/btn:opacity-100"
                fill="none"
                aria-hidden
              >
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <svg
                viewBox="0 0 16 16"
                className="w-1/2 opacity-50 transition-opacity duration-150 ease-out group-hover/btn:opacity-100"
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
