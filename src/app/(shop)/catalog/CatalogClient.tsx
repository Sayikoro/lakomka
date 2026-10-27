"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductCardNew } from "@/components/ui/ProductCardNew";
import type { Category } from "@/lib/products";
import { mockCategories } from "@/lib/mock-data";
import type { Product } from "@/lib/types";

interface Props {
  products: Product[];
  categories: Category[];
  /** Шаблон карточки: classic (светлая) | new (тёмная со свайпом) — задаётся в админке */
  template?: "classic" | "new";
}

/** Миниатюры категорий (те же картинки, что на главной) */
const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  mockCategories.map((c) => [c.slug, c.imageUrl])
);

type SortKey = "default" | "name-asc" | "name-desc" | "price-asc" | "price-desc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default",   label: "По умолчанию" },
  { value: "name-asc",  label: "Название: А—Я" },
  { value: "name-desc", label: "Название: Я—А" },
  { value: "price-asc", label: "Цена: сначала дешевле" },
  { value: "price-desc", label: "Цена: сначала дороже" },
];

/** 200 → «200 г», 1000 → «1 кг», 1100 → «1,1 кг», 2500 → «2,5 кг» */
function weightLabel(g: number): string {
  if (g < 1000) return `${g} г`;
  const kg = g / 1000;
  const s = Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(".", ",");
  return `${s} кг`;
}

/** kopecks → «1 850 ₽» */
function priceLabel(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString("ru-RU")} ₽`;
}

/** Двойной ползунок «от — до» по ступеням */
function DualSlider({
  min,
  max,
  step,
  value,
  onChange,
  format,
  ariaLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const [lo, hi] = value;
  const loPct = ((lo - min) / (max - min)) * 100;
  const hiPct = ((hi - min) / (max - min)) * 100;

  return (
    <div>
      <div className="relative h-6">
        <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-[var(--color-border)]" />
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--color-primary)]"
          style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi - step), hi])}
          className="dual-range"
          aria-label={`${ariaLabel}: минимум`}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + step)])}
          className="dual-range"
          aria-label={`${ariaLabel}: максимум`}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-[var(--color-muted)]">
        <span>от {format(lo)}</span>
        <span>до {format(hi)}</span>
      </div>
    </div>
  );
}

export function CatalogClient({ products, categories, template = "classic" }: Props) {
  const [category, setCategory] = useState<string>("all"); // slug категории | "all"
  const [weightIdx, setWeightIdx] = useState<[number, number]>([0, 0]); // индексы ступеней, пересчитываются от данных
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]); // kopecks, пересчитываются от данных
  const [search, setSearch] = useState("");
  const [boundsReady, setBoundsReady] = useState(false);
  const [sort, setSort] = useState<SortKey>("default");

  // Ступени веса из каталога (по возрастанию)
  const weightSteps = useMemo(() => {
    const set = new Set<number>();
    products.forEach((p) => p.recipe_weight_g && set.add(p.recipe_weight_g));
    return Array.from(set).sort((a, b) => a - b);
  }, [products]);

  // Границы цены по каталогу, округлённые до сотен рублей
  const priceBounds = useMemo(() => {
    let min = Infinity;
    let max = 0;
    products.forEach((p) => {
      if (p.price_kopecks < min) min = p.price_kopecks;
      if (p.price_kopecks > max) max = p.price_kopecks;
    });
    if (!Number.isFinite(min)) return { min: 0, max: 0 };
    return {
      min: Math.floor(min / 10000) * 10000,
      max: Math.max(Math.ceil(max / 10000) * 10000, Math.floor(min / 10000) * 10000 + 10000),
    };
  }, [products]);

  // Инициализация ползунков после получения данных + категория из URL (?category=slug с главной)
  useEffect(() => {
    if (weightSteps.length && !boundsReady) {
      setWeightIdx([0, weightSteps.length - 1]);
      setPriceRange([priceBounds.min, priceBounds.max]);
      setBoundsReady(true);
    }
    const cat = new URLSearchParams(window.location.search).get("category");
    if (cat) setCategory(cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightSteps.length]);

  // Категории, реально представленные в каталоге (порядок — как на главной)
  const categoryOptions = useMemo(() => {
    const present = new Set<number>();
    products.forEach((p) => p.category_id && present.add(p.category_id));
    return categories.filter((c) => present.has(c.id));
  }, [products, categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wLo = weightSteps[weightIdx[0]];
    const wHi = weightSteps[weightIdx[1]];
    const weightActive = boundsReady && weightSteps.length > 0 && (weightIdx[0] > 0 || weightIdx[1] < weightSteps.length - 1);
    const priceActive = boundsReady && (priceRange[0] > priceBounds.min || priceRange[1] < priceBounds.max);
    const cat = categoryOptions.find((c) => c.slug === category);

    return products.filter((p) => {
      if (cat && p.category_id !== cat.id) return false;
      if (weightActive) {
        const w = p.recipe_weight_g ?? 0;
        if (w < wLo || w > wHi) return false;
      }
      if (priceActive && (p.price_kopecks < priceRange[0] || p.price_kopecks > priceRange[1])) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, category, categoryOptions, weightIdx, weightSteps, priceRange, priceBounds, search, boundsReady]);

  const hasFilters =
    category !== "all" ||
    search.trim() !== "" ||
    (boundsReady && weightSteps.length > 0 && (weightIdx[0] > 0 || weightIdx[1] < weightSteps.length - 1)) ||
    (boundsReady && (priceRange[0] > priceBounds.min || priceRange[1] < priceBounds.max));

  // Сортировка отфильтрованного списка
  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case "name-asc":
        arr.sort((a, b) => a.name.localeCompare(b.name, "ru"));
        break;
      case "name-desc":
        arr.sort((a, b) => b.name.localeCompare(a.name, "ru"));
        break;
      case "price-asc":
        arr.sort((a, b) => a.price_kopecks - b.price_kopecks);
        break;
      case "price-desc":
        arr.sort((a, b) => b.price_kopecks - a.price_kopecks);
        break;
    }
    return arr;
  }, [filtered, sort]);

  const changeCategory = (slug: string) => {
    setCategory(slug);
    // Синхронизируем ?category= в адресе (ссылки с главной: /catalog?category=vip)
    const url = new URL(window.location.href);
    if (slug === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", slug);
    window.history.replaceState(null, "", url);
  };

  const resetFilters = () => {
    setCategory("all");
    setWeightIdx([0, Math.max(weightSteps.length - 1, 0)]);
    setPriceRange([priceBounds.min, priceBounds.max]);
    setSearch("");
    const url = new URL(window.location.href);
    url.searchParams.delete("category");
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[240px_1fr]">
      <aside className="space-y-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--color-heading)]">Поиск</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название подарка"
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm placeholder:text-xs focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        {categoryOptions.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Категория</div>
            {/* Бенто-плитки: 2 кол. на телефоне, 4 кол. на планшете (фильтры сверху),
                снова 2 кол. в узком сайдбаре на xl+ */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
              <button
                onClick={() => changeCategory("all")}
                aria-pressed={category === "all"}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-2.5 text-center text-[12px] font-medium leading-tight transition-colors ${
                  category === "all"
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-bg-soft)] text-[var(--color-heading)] hover:border-[var(--color-primary)]"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
                  <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
                  <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
                  <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
                </svg>
                Все
              </button>
              {categoryOptions.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => changeCategory(c.slug)}
                  aria-pressed={category === c.slug}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center text-[12px] font-medium leading-tight transition-colors ${
                    category === c.slug
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-bg-soft)] text-[var(--color-heading)] hover:border-[var(--color-primary)]"
                  }`}
                >
                  {CATEGORY_ICONS[c.slug] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={CATEGORY_ICONS[c.slug]}
                      alt=""
                      className="h-9 w-9 rounded-xl object-cover"
                      loading="lazy"
                    />
                  )}
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Планшет (sm–xl, фильтры сверху): ползунки друг за другом; на телефоне и в узком сайдбаре — друг под другом */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          {weightSteps.length > 1 && boundsReady && (
            <div>
              <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Вес</div>
              <DualSlider
                min={0}
                max={weightSteps.length - 1}
                step={1}
                value={weightIdx}
                onChange={setWeightIdx}
                format={(i) => weightLabel(weightSteps[i] ?? 0)}
                ariaLabel="Вес"
              />
            </div>
          )}

          {priceBounds.max > 0 && boundsReady && (
            <div>
              <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Цена</div>
              <DualSlider
                min={priceBounds.min}
                max={priceBounds.max}
                step={10000}
                value={priceRange}
                onChange={setPriceRange}
                format={priceLabel}
                ariaLabel="Цена"
              />
            </div>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={resetFilters}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            Сбросить фильтры
          </button>
        )}
      </aside>

      <section>
        {/* Тулбар: счётчик + сортировка над сеткой */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-[var(--color-muted)]">
            Найдено: {filtered.length} из {products.length}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-sm text-[var(--color-primary)] underline-offset-2 hover:underline xl:hidden"
              >
                Сбросить
              </button>
            )}
            <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <span className="hidden sm:inline">Сортировка:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Сортировка"
                className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-heading)] focus:border-[var(--color-primary)] focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {sorted.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] p-12 text-center text-[var(--color-muted)]">
            Ничего не нашлось. Попробуйте изменить фильтры.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {sorted.map((p) =>
              template === "new" ? (
                <ProductCardNew key={p.id} product={p} />
              ) : (
                <ProductCard key={p.id} product={p} />
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
