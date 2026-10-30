"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductCardNew } from "@/components/ui/ProductCardNew";
import { SmartImg } from "@/components/ui/SmartImg";
import { useT } from "@/components/texts/TextsProvider";
import { fetchLiveProducts, productsDiffer } from "@/lib/product-api";
import type { Category } from "@/lib/products";
import { mockCategories } from "@/lib/mock-data";
import type { Product } from "@/lib/types";

interface Props {
  products: Product[];
  categories: Category[];
  /** Шаблон карточки: classic (светлая) | new (тёмная со свайпом) — задаётся в админке */
  template?: "classic" | "new";
}

/** Фолбэк-миниатюры для категорий без товаров */
const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  mockCategories.map((c) => [c.slug, c.imageUrl])
);

type SortKey = "default" | "name-asc" | "name-desc" | "price-asc" | "price-desc";

/** Товаров на одной странице каталога */
const PAGE_SIZE = 20;

/** Список кнопок пагинации: 1 … 4 5 6 … 19 (с «…» при большом числе страниц) */
function buildPageList(current: number, total: number): (number | "dots")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set<number>([1, total, current]);
  if (current > 1) wanted.add(current - 1);
  if (current < total) wanted.add(current + 1);
  if (current <= 3) {
    wanted.add(2);
    wanted.add(3);
    wanted.add(4);
  }
  if (current >= total - 2) {
    wanted.add(total - 1);
    wanted.add(total - 2);
    wanted.add(total - 3);
  }
  const nums = Array.from(wanted).sort((a, b) => a - b);
  const out: (number | "dots")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push("dots");
    out.push(n);
    prev = n;
  }
  return out;
}

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
  const t = useT();
  const [category, setCategory] = useState<string>("all"); // slug категории | "all"
  const [weightIdx, setWeightIdx] = useState<[number, number]>([0, 0]); // индексы ступеней, пересчитываются от данных
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]); // kopecks, пересчитываются от данных
  const [search, setSearch] = useState("");
  const [boundsReady, setBoundsReady] = useState(false);
  const [sort, setSort] = useState<SortKey>("default");
  const [page, setPage] = useState(1);
  const gridTopRef = useRef<HTMLDivElement | null>(null);

  /* ── Живой шаблон карточки ──
     template запекается в статику при сборке (серверный fetch настроек
     с force-cache), поэтому смена шаблона в админке на развёрнутом
     сайте сама по себе не видна. После монтирования подтягиваем свежий
     product_card_template с /api/settings/public (no-store) — карточки
     переключаются на новый шаблон по F5, без пересборки. */
  const [cardTemplate, setCardTemplate] = useState<"classic" | "new">(template);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/public", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const t = json?.data?.product_card_template;
        if ((t === "classic" || t === "new") && t !== cardTemplate) {
          setCardTemplate(t);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Живые данные витрины ──
     Стартуем с запечённых при сборке товаров (мгновенный рендер, SEO),
     после монтирования подтягиваем свежий каталог с /api/products:
     новые товары, цены и видео появляются на развёрнутом сайте
     без пересборки. API недоступен → остаётся запечённая версия. */
  const [liveProducts, setLiveProducts] = useState<Product[]>(products);
  const liveRef = useRef<Product[]>(products); // зеркало состояния — без устаревших замыканий
  const [liveChecked, setLiveChecked] = useState(false); // API ответил (успешно или нет)
  const filtersTouchedRef = useRef(false); // пользователь менял фильтры?

  useEffect(() => {
    let cancelled = false;
    fetchLiveProducts()
      .then((fresh) => {
        if (cancelled) return;
        setLiveChecked(true);
        if (!fresh || !productsDiffer(liveRef.current, fresh)) return;
        liveRef.current = fresh;
        setLiveProducts(fresh);

        const steps = Array.from(
          new Set(fresh.map((p) => p.recipe_weight_g ?? 0).filter((w) => w > 0)),
        ).sort((a, b) => a - b);
        let pmin = Infinity;
        let pmax = 0;
        for (const p of fresh) {
          if (p.price_kopecks < pmin) pmin = p.price_kopecks;
          if (p.price_kopecks > pmax) pmax = p.price_kopecks;
        }
        const bounds = Number.isFinite(pmin)
          ? {
              min: Math.floor(pmin / 10000) * 10000,
              max: Math.max(Math.ceil(pmax / 10000) * 10000, Math.floor(pmin / 10000) * 10000 + 10000),
            }
          : { min: 0, max: 0 };

        if (!filtersTouchedRef.current) {
          // Фильтры ещё не трогали — пересчитать границы от свежих данных
          if (steps.length) setWeightIdx([0, steps.length - 1]);
          if (bounds.max > 0) setPriceRange([bounds.min, bounds.max]);
          setPage(1);
        } else {
          // Фильтры активны — только прижать индексы ступеней веса к новому диапазону
          if (steps.length) {
            setWeightIdx(([lo, hi]) => [
              Math.min(lo, steps.length - 1),
              Math.min(hi, steps.length - 1),
            ]);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLiveChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ступени веса из каталога (по возрастанию)
  const weightSteps = useMemo(() => {
    const set = new Set<number>();
    liveProducts.forEach((p) => p.recipe_weight_g && set.add(p.recipe_weight_g));
    return Array.from(set).sort((a, b) => a - b);
  }, [liveProducts]);

  // Границы цены по каталогу, округлённые до сотен рублей
  const priceBounds = useMemo(() => {
    let min = Infinity;
    let max = 0;
    liveProducts.forEach((p) => {
      if (p.price_kopecks < min) min = p.price_kopecks;
      if (p.price_kopecks > max) max = p.price_kopecks;
    });
    if (!Number.isFinite(min)) return { min: 0, max: 0 };
    return {
      min: Math.floor(min / 10000) * 10000,
      max: Math.max(Math.ceil(max / 10000) * 10000, Math.floor(min / 10000) * 10000 + 10000),
    };
  }, [liveProducts]);

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
    liveProducts.forEach((p) => p.category_id && present.add(p.category_id));
    return categories.filter((c) => present.has(c.id));
  }, [liveProducts, categories]);

  /* Миниатюры-кнопки фильтров: пул первых картинок товаров категории,
     как на главной. Рандом выбирается только на клиенте после монтирования
     (иначе SSR и гидратация дают разные src → рассинхрон). До монтирования
     показывается скелетон. */
  const [pickedIcons, setPickedIcons] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const poolByCategory = new Map<number, string[]>();
    for (const p of products) {
      if (p.category_id == null) continue;
      const img = p.images[0]?.url;
      if (!img) continue;
      const pool = poolByCategory.get(p.category_id);
      if (pool) pool.push(img);
      else poolByCategory.set(p.category_id, [img]);
    }
    const map = new Map<string, string>();
    for (const c of categories) {
      const pool = poolByCategory.get(c.id);
      map.set(
        c.slug,
        pool && pool.length > 0
          ? pool[Math.floor(Math.random() * pool.length)]
          : CATEGORY_ICONS[c.slug] ?? mockCategories[0].imageUrl
      );
    }
    setPickedIcons(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // один раз на монтаж — каждая загрузка каталога даёт новый набор

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wLo = weightSteps[weightIdx[0]];
    const wHi = weightSteps[weightIdx[1]];
    const weightActive = boundsReady && weightSteps.length > 0 && (weightIdx[0] > 0 || weightIdx[1] < weightSteps.length - 1);
    const priceActive = boundsReady && (priceRange[0] > priceBounds.min || priceRange[1] < priceBounds.max);
    const cat = categoryOptions.find((c) => c.slug === category);

    return liveProducts.filter((p) => {
      if (cat && p.category_id !== cat.id) return false;
      if (weightActive) {
        const w = p.recipe_weight_g ?? 0;
        if (w < wLo || w > wHi) return false;
      }
      if (priceActive && (p.price_kopecks < priceRange[0] || p.price_kopecks > priceRange[1])) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [liveProducts, category, categoryOptions, weightIdx, weightSteps, priceRange, priceBounds, search, boundsReady]);

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

  // Пагинация: всего страниц + срез текущей страницы.
  // safePage прижимает страницу к допустимому диапазону, если после
  // смены фильтров страниц стало меньше — без лишних setState.
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage]
  );

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages || p === safePage) return;
    setPage(p);
    // Плавная прокрутка к началу списка после смены страницы
    requestAnimationFrame(() =>
      gridTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const changeCategory = (slug: string) => {
    filtersTouchedRef.current = true;
    setCategory(slug);
    setPage(1); // смена категории — к первой странице
    // Синхронизируем ?category= в адресе (ссылки с главной: /catalog?category=vip)
    const url = new URL(window.location.href);
    if (slug === "all") url.searchParams.delete("category");
    else url.searchParams.set("category", slug);
    window.history.replaceState(null, "", url);
  };

  const resetFilters = () => {
    filtersTouchedRef.current = true;
    setCategory("all");
    setWeightIdx([0, Math.max(weightSteps.length - 1, 0)]);
    setPriceRange([priceBounds.min, priceBounds.max]);
    setSearch("");
    setPage(1);
    const url = new URL(window.location.href);
    url.searchParams.delete("category");
    window.history.replaceState(null, "", url);
  };

  const pagesLabel = t("catalog_pages", {
    page: safePage,
    pages: totalPages,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[240px_1fr]">
      {/* self-start: колонка по высоте контента, а не на всю высоту сетки товаров */}
      <aside className="self-start space-y-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--color-heading)]">{t("catalog_search_label")}</label>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              filtersTouchedRef.current = true;
              setPage(1); // новый поиск — к первой странице
            }}
            placeholder={t("catalog_search_placeholder")}
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm placeholder:text-xs focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        {categoryOptions.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">{t("catalog_category_label")}</div>
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
                {t("catalog_all")}
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
                  {pickedIcons.get(c.slug) ? (
                    <SmartImg
                      src={pickedIcons.get(c.slug)!}
                      alt=""
                      loading="lazy"
                      wrapperClassName="h-9 w-9 rounded-xl"
                      skeletonClassName="rounded-xl"
                      className="h-9 w-9 rounded-xl object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="img-skeleton block h-9 w-9 rounded-xl"
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
              <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">{t("catalog_weight_label")}</div>
              <DualSlider
                min={0}
                max={weightSteps.length - 1}
                step={1}
                value={weightIdx}
                onChange={(v) => {
                  setWeightIdx(v);
                  filtersTouchedRef.current = true;
                  setPage(1); // новый фильтр — к первой странице
                }}
                format={(i) => weightLabel(weightSteps[i] ?? 0)}
                ariaLabel="Вес"
              />
            </div>
          )}

          {priceBounds.max > 0 && boundsReady && (
            <div>
              <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">{t("catalog_price_label")}</div>
              <DualSlider
                min={priceBounds.min}
                max={priceBounds.max}
                step={10000}
                value={priceRange}
                onChange={(v) => {
                  setPriceRange(v);
                  filtersTouchedRef.current = true;
                  setPage(1); // новый фильтр — к первой странице
                }}
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
            {t("catalog_reset")}
          </button>
        )}
      </aside>

      <section>
        {/* Тулбар: счётчик страниц + сортировка над сеткой */}
        <div
          ref={gridTopRef}
          className="mb-4 flex flex-wrap items-center justify-between gap-3 scroll-mt-28"
        >
          <div className="text-sm text-[var(--color-muted)]">
            {pagesLabel}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-sm text-[var(--color-primary)] underline-offset-2 hover:underline xl:hidden"
              >
                {t("catalog_reset")}
              </button>
            )}
            <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <span className="hidden sm:inline">{t("catalog_sort_label")}</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                  filtersTouchedRef.current = true;
                  setPage(1); // новая сортировка — к первой странице
                }}
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
        {/* Пока живые данные не загружены и запечённых нет — скелетон сетки
            (случается на сайте, собранном при недоступном API) */}
        {liveProducts.length === 0 && !liveChecked ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                aria-hidden
                className="aspect-square animate-pulse rounded-3xl bg-white shadow-sm"
              />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] p-12 text-center text-[var(--color-muted)]">
            {t("catalog_empty_result")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {pageItems.map((p) =>
              cardTemplate === "new" ? (
                <ProductCardNew key={p.id} product={p} />
              ) : (
                <ProductCard key={p.id} product={p} />
              )
            )}
          </div>
        )}

        {/* Пагинация: снизу по центру */}
        {totalPages > 1 && (
          <nav
            aria-label="Пагинация"
            className="mt-8 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5"
          >
            <button
              type="button"
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage <= 1}
              aria-label="Предыдущая страница"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-heading)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            {buildPageList(safePage, totalPages).map((item, i) =>
              item === "dots" ? (
                <span
                  key={`dots-${i}`}
                  className="px-1 text-sm text-[var(--color-muted)]"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => goToPage(item)}
                  aria-current={item === safePage ? "page" : undefined}
                  aria-label={`Страница ${item}`}
                  className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-medium transition-colors sm:h-10 sm:min-w-10 ${
                    item === safePage
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  }`}
                >
                  {item}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage >= totalPages}
              aria-label="Следующая страница"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-heading)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
