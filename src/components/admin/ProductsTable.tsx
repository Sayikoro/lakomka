"use client";

/* Список товаров админки с фильтрами как в клиентском каталоге (Task 90):
 * плитки категорий с иконками, двойные ползунки цены и веса (общий
 * DualSlider из ui/DualSlider), сортировка «название/цена» и сброс.
 * Админ-специфичные фильтры сохранены: поиск по названию/SKU и статусный
 * select (в каталоге / скрытые / тип товара). Все фильтры клиентские —
 * список приходит целиком с /api/admin/products. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DualSlider, SORT_OPTIONS, priceLabel, weightLabel } from "@/components/ui/DualSlider";
import type { SortKey } from "@/components/ui/DualSlider";
import { SmartImg } from "@/components/ui/SmartImg";
import { mockCategories } from "@/lib/mock-data";
import type { AdminProduct } from "@/app/admin/products/page";

interface AdminCategory {
  id: number;
  slug: string;
  name: string;
}

interface Props {
  initialProducts: AdminProduct[];
}

type Filter = "all" | "catalog" | "hidden" | "bundles" | "simple" | "recipe";

const TYPE_LABEL: Record<string, string> = {
  simple: "Товар",
  bundle: "Набор",
  recipe: "Часть набора",
};

const TYPE_BADGE: Record<string, string> = {
  simple: "bg-blue-100 text-blue-800",
  bundle: "bg-amber-100 text-amber-800",
  recipe: "bg-pink-100 text-pink-800",
};

/** Фолбэк-миниатюры для категорий без товаров — как в клиентском каталоге */
const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  mockCategories.map((c) => [c.slug, c.imageUrl])
);

export function ProductsTable({ initialProducts }: Props) {
  const [products, setProducts] = useState(initialProducts);
  // router.refresh() приносит новые props — синхронизируем state, иначе таблица
  // навсегда показывает snapshot на момент монтирования (после импорта список
  // выглядел «не обновившимся», хотя данные в БД уже были новые).
  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ── Фильтры каталога (Task 90) ── */
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [category, setCategory] = useState<string>("all"); // slug | "all"
  const [sort, setSort] = useState<SortKey>("default");
  // Ползунки: пока пользователь их не трогал — следуют за границами данных
  // (без эффектов и boundsReady: «прикоснулся» = touched, сброс = touched=false)
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
  const [priceTouched, setPriceTouched] = useState(false);
  const [weightIdx, setWeightIdx] = useState<[number, number]>([0, 0]);
  const [weightTouched, setWeightTouched] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/categories`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setCategories((json?.data as AdminCategory[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  // Ступени веса из списка товаров (по возрастанию) — как в каталоге
  const weightSteps = useMemo(() => {
    const set = new Set<number>();
    products.forEach((p) => p.recipe_weight_g && set.add(p.recipe_weight_g));
    return Array.from(set).sort((a, b) => a - b);
  }, [products]);

  // Границы цены по списку, округлённые до сотен рублей — как в каталоге
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

  // Категории, реально представленные среди товаров (порядок — общий)
  const categoryOptions = useMemo(() => {
    if (!categories) return [];
    const present = new Set<number>();
    products.forEach((p) => p.category_id && present.add(p.category_id));
    return categories.filter((c) => present.has(c.id));
  }, [categories, products]);

  // Иконки плиток: первое фото товара категории (thumb из API),
  // без товаров — фолбэк из мока, ровно как в каталоге
  const iconBySlug = useMemo(() => {
    const byId = new Map<number, string>();
    for (const p of products) {
      if (p.category_id == null || byId.has(p.category_id)) continue;
      if (!p.thumb) continue;
      byId.set(p.category_id, p.thumb);
    }
    const map = new Map<string, string>();
    for (const c of categories ?? []) {
      const icon = byId.get(c.id);
      map.set(c.slug, icon ?? CATEGORY_ICONS[c.slug] ?? mockCategories[0].imageUrl);
    }
    return map;
  }, [products, categories]);

  // Эффективные границы ползунков: до первого касания — весь span данных
  const effWeight = useMemo<[number, number]>(
    () => (weightTouched ? weightIdx : [0, Math.max(weightSteps.length - 1, 0)]),
    [weightTouched, weightIdx, weightSteps.length]
  );
  const effPrice = useMemo<[number, number]>(
    () => (priceTouched ? priceRange : [priceBounds.min, priceBounds.max]),
    [priceTouched, priceRange, priceBounds.min, priceBounds.max]
  );
  const weightActive =
    weightTouched && weightSteps.length > 1 &&
    (effWeight[0] > 0 || effWeight[1] < weightSteps.length - 1);
  const priceActive =
    priceTouched && priceBounds.max > 0 &&
    (effPrice[0] > priceBounds.min || effPrice[1] < priceBounds.max);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cat = categoryOptions.find((c) => c.slug === category);
    const wLo = weightSteps[effWeight[0]];
    const wHi = weightSteps[effWeight[1]];
    return products.filter((p) => {
      if (filter === "catalog" && !(p.show_in_catalog === 1 && p.is_published === 1 && p.type !== "recipe")) return false;
      if (filter === "hidden" && !(p.show_in_catalog === 0 || p.is_published === 0)) return false;
      if (filter === "bundles" && p.type !== "bundle") return false;
      if (filter === "simple" && p.type !== "simple") return false;
      if (filter === "recipe" && p.type !== "recipe") return false;
      if (cat && p.category_id !== cat.id) return false;
      if (weightActive) {
        const w = p.recipe_weight_g ?? 0;
        if (w < wLo || w > wHi) return false;
      }
      if (priceActive && (p.price_kopecks < effPrice[0] || p.price_kopecks > effPrice[1])) return false;
      if (q) {
        const haystack = `${p.name} ${p.sku ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, filter, categoryOptions, category, weightSteps, effWeight, weightActive, effPrice, priceActive]);

  // Сортировка отфильтрованного списка — те же варианты, что в каталоге
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

  const hasFilters =
    category !== "all" ||
    search.trim() !== "" ||
    filter !== "all" ||
    weightActive ||
    priceActive;

  const resetFilters = () => {
    setSearch("");
    setFilter("all");
    setCategory("all");
    setSort("default");
    setPriceTouched(false);
    setWeightTouched(false);
  };

  async function patch(id: number, payload: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/products/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сохранить");
        return;
      }
      setProducts((list) =>
        list.map((p) => (p.id === id ? { ...p, ...json.data, thumb: json.data?.thumb ?? p.thumb } : p))
      );
    } catch {
      setError("Ошибка сети");
    } finally {
      setSavingId(null);
    }
  }

  async function destroy(id: number, name: string) {
    if (!confirm(`Удалить «${name}»? Это действие необратимо.`)) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/products/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось удалить");
        return;
      }
      setProducts((list) => list.filter((p) => p.id !== id));
    } catch {
      setError("Ошибка сети");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию или SKU"
          className="w-full max-w-sm rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          <option value="all">Все</option>
          <option value="catalog">В каталоге</option>
          <option value="hidden">Скрытые</option>
          <option value="simple">Только товары</option>
          <option value="bundles">Только наборы</option>
          <option value="recipe">Только конфеты</option>
        </select>
        <span className="text-sm text-[var(--color-muted)]">
          Найдено: {filtered.length}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <span className="hidden sm:inline">Сортировка</span>
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

      {/* ── Панель фильтров каталога: плитки категорий + ползунки цены/веса ── */}
      {(categoryOptions.length > 0 || priceBounds.max > 0 || weightSteps.length > 1) && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5">
          {categoryOptions.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Категория</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
                <button
                  onClick={() => setCategory("all")}
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
                    onClick={() => setCategory(c.slug)}
                    aria-pressed={category === c.slug}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center text-[12px] font-medium leading-tight transition-colors ${
                      category === c.slug
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-bg-soft)] text-[var(--color-heading)] hover:border-[var(--color-primary)]"
                    }`}
                  >
                    <SmartImg
                      src={iconBySlug.get(c.slug) ?? mockCategories[0].imageUrl}
                      alt=""
                      loading="lazy"
                      wrapperClassName="h-9 w-9 rounded-xl"
                      skeletonClassName="rounded-xl"
                      className="h-9 w-9 rounded-xl object-cover"
                    />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(priceBounds.max > 0 || weightSteps.length > 1) && (
            <div className={`grid gap-5 sm:grid-cols-2 ${categoryOptions.length > 0 ? "mt-5" : ""}`}>
              {priceBounds.max > 0 && (
                <div>
                  <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Цена</div>
                  <DualSlider
                    min={priceBounds.min}
                    max={priceBounds.max}
                    step={10000}
                    value={effPrice}
                    onChange={(v) => {
                      setPriceRange(v);
                      setPriceTouched(true);
                    }}
                    format={priceLabel}
                    ariaLabel="Цена"
                  />
                </div>
              )}
              {weightSteps.length > 1 && (
                <div>
                  <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Вес</div>
                  <DualSlider
                    min={0}
                    max={weightSteps.length - 1}
                    step={1}
                    value={effWeight}
                    onChange={(v) => {
                      setWeightIdx(v);
                      setWeightTouched(true);
                    }}
                    format={(i) => weightLabel(weightSteps[i] ?? 0)}
                    ariaLabel="Вес"
                  />
                </div>
              )}
            </div>
          )}

          {hasFilters && (
            <button
              onClick={resetFilters}
              className="mt-5 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-xs underline">закрыть</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <th className="p-3">Название</th>
              <th className="p-3">Тип</th>
              <th className="p-3 text-right">Цена</th>
              <th className="p-3 text-right">Остаток</th>
              <th className="p-3 text-center">В кат.</th>
              <th className="p-3 text-center">Опубл.</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const isRecipe = p.type === "recipe";
              return (
                <tr
                  key={p.id}
                  className={`border-b border-[var(--color-border)] last:border-none ${
                    savingId === p.id || deletingId === p.id ? "opacity-50" : ""
                  }`}
                >
                  <td className="p-3">
                    <Link href={`/admin/products/edit?id=${p.id}`} className="hover:text-[var(--color-primary)]">
                      {p.name}
                    </Link>
                    {p.sku && <span className="ml-2 text-xs text-[var(--color-muted)]">{p.sku}</span>}
                  </td>
                  <td className="p-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[p.type] ?? "bg-gray-100"}`}>
                      {TYPE_LABEL[p.type] ?? p.type}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      value={Math.round(p.price_kopecks / 100)}
                      onChange={(e) => setProducts((list) => list.map((x) => x.id === p.id ? { ...x, price_kopecks: (Number(e.target.value) || 0) * 100 } : x))}
                      onBlur={(e) => {
                        const newKopecks = (Number(e.target.value) || 0) * 100;
                        if (newKopecks !== p.price_kopecks) patch(p.id, { price_kopecks: newKopecks });
                      }}
                      className="w-24 rounded border border-[var(--color-border)] px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      value={p.stock_qty}
                      onChange={(e) => setProducts((list) => list.map((x) => x.id === p.id ? { ...x, stock_qty: Number(e.target.value) || 0 } : x))}
                      onBlur={(e) => {
                        const newStock = Number(e.target.value) || 0;
                        if (newStock !== p.stock_qty) patch(p.id, { stock_qty: newStock });
                      }}
                      className="w-20 rounded border border-[var(--color-border)] px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="p-3 text-center">
                    {isRecipe ? (
                      <span className="text-xs text-[var(--color-muted)]">—</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={p.show_in_catalog === 1}
                        onChange={(e) => patch(p.id, { show_in_catalog: e.target.checked ? 1 : 0 })}
                        className="accent-[var(--color-primary)]"
                      />
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={p.is_published === 1}
                      onChange={(e) => patch(p.id, { is_published: e.target.checked ? 1 : 0 })}
                      className="accent-[var(--color-primary)]"
                    />
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Link href={`/admin/products/edit?id=${p.id}`} className="mr-3 text-xs text-[var(--color-primary)] hover:underline">
                      ред.
                    </Link>
                    <button onClick={() => destroy(p.id, p.name)} disabled={deletingId === p.id}
                      className="text-xs text-[var(--color-muted)] hover:text-red-600">
                      удалить
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-sm text-[var(--color-muted)]">
                  Ничего не найдено — попробуйте изменить или сбросить фильтры.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
