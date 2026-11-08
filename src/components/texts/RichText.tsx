"use client";

import { useEffect, useState } from "react";
import { splitByGalleryShortcode } from "@/lib/shortcode";
import { fetchGalleryLive, type GalleryItem } from "@/lib/galleries";

/* ============================================================
   RichText — текст с шорткодами [gallery слаг] (Task 146).

   Любое текстовое поле витрины (сейчас: seo_text категории)
   понимает шорткод галереи: текст рендерится как раньше, а на
   месте [gallery …] встаёт сетка картинок из галереи (админка →
   Файлы → Галерея). Галереи загружаются после монтирования с
   живого API — как остальные динамические блоки витрины.

   Текстовые сегменты сохраняют переносы строк (whitespace-pre-line).
   ============================================================ */

/** Сетка картинок одной галереи (клиентская, живой fetch) */
function GalleryInline({ slug }: { slug: string }) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGalleryLive(slug).then((g) => {
      if (!cancelled) setItems(g?.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  /* Пока грузится — аккуратная заглушка; галереи нет/пуста — ничего */
  if (items === null) {
    return (
      <div
        data-testid="gallery-loading"
        className="my-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
        aria-hidden
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="img-skeleton aspect-square rounded-[var(--radius-card)]"
          />
        ))}
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div
      data-testid="gallery-block"
      className="my-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
    >
      {items.map((it, i) => (
        <a
          key={`${it.url}-${i}`}
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          title={it.alt}
          className="group relative block aspect-square overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={it.url}
            alt={it.alt}
            loading="lazy"
            className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
          />
        </a>
      ))}
    </div>
  );
}

export function RichText({
  text,
  className,
  testId,
}: {
  text: string;
  className?: string;
  testId?: string;
}) {
  const segments = splitByGalleryShortcode(text);
  return (
    <div className={className} data-testid={testId ?? "rich-text"}>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i} className="whitespace-pre-line">
            {seg.value}
          </span>
        ) : (
          <GalleryInline key={i} slug={seg.slug} />
        )
      )}
    </div>
  );
}
