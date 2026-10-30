"use client";

/* ============================================================
   Плитки категорий на главной.
   Клиентский компонент: стартует с запечённых данных (SEO,
   мгновенный рендер), после монтирования подтягивает живые
   товары/категории с API — новые товары и категории появляются
   на развёрнутом сайте без пересборки. Картинки плиток
   рандомизируются только на клиенте (иначе гидратация
   расходится с разметкой).
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types";
import type { Category } from "@/lib/products";
import { fetchLiveCategories, fetchLiveProducts, productsDiffer } from "@/lib/product-api";
import { mockCategories } from "@/lib/mock-data";
import { SmartImage } from "@/components/ui/SmartImg";

interface CategoryGridProps {
  categories: Category[];
  products: Product[];
}

export function CategoryGrid({ categories, products }: CategoryGridProps) {
  const [liveProducts, setLiveProducts] = useState<Product[]>(products);
  const [liveCategories, setLiveCategories] = useState<Category[]>(categories);
  /* Пул картинок на категорию: первая (главная) картинка каждого товара */
  const poolByCategory = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const p of liveProducts) {
      if (p.category_id == null) continue;
      const img = p.images[0]?.url;
      if (!img) continue;
      const pool = map.get(p.category_id);
      if (pool) pool.push(img);
      else map.set(p.category_id, [img]);
    }
    return map;
  }, [liveProducts]);

  /* Фолбэк для категорий без товаров — прежние мок-картинки */
  const mockBySlug = useMemo(
    () => new Map(mockCategories.map((c) => [c.slug, c.imageUrl])),
    [],
  );

  /* Детерминированный выбор по хешу slug: одинаков на сервере (сборка)
     и клиенте → гидратация без рассинхрона, в запечённой главной
     реальные картинки товаров, а не моки */
  const initialBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of liveCategories) {
      const pool = poolByCategory.get(cat.id);
      if (!pool || pool.length === 0) continue;
      let h = 0;
      for (let i = 0; i < cat.slug.length; i++) h = (h * 31 + cat.slug.charCodeAt(i)) | 0;
      map.set(cat.slug, pool[Math.abs(h) % pool.length]);
    }
    return map;
  }, [liveCategories, poolByCategory]);

  /* Случайная картинка каждой плитки — только после монтирования
     (каждая загрузка главной даёт новый набор) */
  const [picked, setPicked] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    const map = new Map<string, string>();
    for (const cat of liveCategories) {
      const pool = poolByCategory.get(cat.id);
      map.set(
        cat.slug,
        pool && pool.length > 0
          ? pool[Math.floor(Math.random() * pool.length)]
          : mockBySlug.get(cat.slug) ?? mockCategories[0].imageUrl,
      );
    }
    setPicked(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCategories, poolByCategory]);

  /* Живые данные: новые товары/категории без пересборки */
  useEffect(() => {
    let cancelled = false;
    fetchLiveProducts().then((fresh) => {
      if (cancelled || !fresh) return;
      setLiveProducts((cur) => (productsDiffer(cur, fresh) ? fresh : cur));
    });
    fetchLiveCategories().then((fresh) => {
      if (cancelled || !fresh) return;
      setLiveCategories((cur) =>
        JSON.stringify(cur) === JSON.stringify(fresh) ? cur : fresh,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {liveCategories.map((cat) => {
        const imageUrl =
          picked?.get(cat.slug) ??
          initialBySlug.get(cat.slug) ??
          mockBySlug.get(cat.slug) ??
          mockCategories[0].imageUrl;
        return (
          <Link
            key={cat.slug}
            href={`/catalog?category=${cat.slug}`}
            className="group relative mx-auto flex w-full max-w-[240px] flex-col transition hover:-translate-y-0.5"
          >
            <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-soft)]">
              <SmartImage
                src={imageUrl}
                alt={cat.name}
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 240px"
                className="object-contain p-5 transition group-hover:scale-105"
              />
              <span
                aria-hidden
                className="absolute bottom-0 right-0 z-20 flex h-[71px] w-[71px] items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] text-white transition group-hover:bg-[var(--color-primary-hover)]"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </span>
            </div>
            <h3 className="mt-3 text-center text-[24px] font-medium uppercase leading-tight text-[var(--color-heading)]">
              {cat.name}
            </h3>
          </Link>
        );
      })}
    </div>
  );
}
