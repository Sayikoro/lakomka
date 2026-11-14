"use client";

import { useEffect, useState } from "react";
import { mockBrands } from "@/lib/mock-data";
import { useT } from "@/components/texts/TextsProvider";
import { SmartImage } from "@/components/ui/SmartImg";
import { DEFAULT_BRANDS_GALLERY, parseGalleryShortcode } from "@/lib/shortcode";
import { fetchGalleryLive, type GalleryItem } from "@/lib/galleries";

/* ============================================================
   Блок «В наших подарках конфеты от фабрик» (Task 146).

   Логотипы берутся из ГАЛЕРЕИ (админка → Файлы → Галерея), которая
   указана в Настройках шорткодом [gallery слаг]; настройка пуста —
   используется дефолтная галерея fabriki, посеянная в репозитории.
   Галереи нет/пуста (и при сборке, и после живого обновления) —
   показываем встроенный набор логотипов (mockBrands): блок не может
   остаться пустым ни при каких действиях владельца.

   Живое обновление — как у hero: при статическом деплое снимок
   галереи запекается в HTML при сборке, после монтирования блок
   подтягивает свежие настройки и содержимое галереи с API. Загрузил
   новый логотип в админке → F5 на сайте → логотип на месте,
   пересборка не нужна.
   ============================================================ */

interface BrandLogosProps {
  /** Слаг галереи (распарсен на сервере из настройки brands_gallery);
   *  null — использовать дефолтную fabriki */
  gallerySlug?: string | null;
  /** Снимок галереи, запечённый при сборке (items могут быть пустыми) */
  initialItems?: GalleryItem[];
}

export function BrandLogos({ gallerySlug, initialItems }: BrandLogosProps) {
  const t = useT();

  /* Пока живая проверка не отработала — показываем запечённый снимок
     (или mock). Ответ API расставляет всё по местам:
     есть картинки → галерея; галерея пуста/удалена → mock. */
  const [items, setItems] = useState<GalleryItem[]>(initialItems ?? []);
  const [mode, setMode] = useState<"loading" | "gallery" | "fallback">("loading");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    let cancelled = false;

    (async () => {
      /* Живой слаг галереи: настройка могла измениться после сборки */
      let slug = gallerySlug ?? null;
      try {
        const res = await fetch(`${apiUrl}/settings/public`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { data?: { brands_gallery?: string } };
          slug = parseGalleryShortcode(json.data?.brands_gallery) ?? DEFAULT_BRANDS_GALLERY;
        }
      } catch { /* нет связи — работаем на запечённом снимке */ }
      if (cancelled) return;

      try {
        const g = await fetchGalleryLive(slug || DEFAULT_BRANDS_GALLERY, apiUrl);
        if (cancelled) return;
        if (g && g.items.length > 0) {
          setItems(g.items);
          setMode("gallery");
        } else {
          setMode("fallback"); // галерея пуста или удалена — встроенный набор
        }
      } catch {
        /* сеть недоступна — остаёмся на запечённом снимке/mock */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gallerySlug]);

  /* Итоговый набор картинок блока */
  const resolved: GalleryItem[] =
    mode === "gallery" ? items : mode === "loading" ? initialItems ?? [] : [];

  const logos =
    resolved.length > 0
      ? resolved.map((it) => ({ name: it.alt || "Логотип фабрики", logoUrl: it.url }))
      : mockBrands;

  return (
    <section data-testid="brand-logos" className="mt-12 bg-[var(--color-bg-soft)] px-6 py-14">
      <div className="mx-auto max-w-[1360px]">
        <h2 className="mb-8 text-center text-[22px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
          {t("home_brands_heading")}
        </h2>
        {/* Логотипы PNG уже с прозрачностью — без белой подложки.
            Телефон 4 в ряд, планшет 6 (18 = 3 полных ряда), ПК 12;
            база 3/5/9 колонок × 0.7 (логотипы на 30% меньше),
            flex + justify-center — ряды, включая последний, центрируются */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-6">
          {logos.map((b) => (
            <div
              key={b.logoUrl}
              title={b.name}
              data-testid="brand-logo"
              className="relative aspect-square w-[calc((100%_-_32px)*0.7/3)] sm:w-[calc((100%_-_64px)*0.7/5)] lg:w-[calc((100%_-_128px)*0.7/9)]"
            >
              <SmartImage
                src={b.logoUrl}
                alt={b.name}
                fill
                sizes="(max-width: 640px) 22vw, (max-width: 1024px) 13vw, 96px"
                className="object-contain p-1"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
