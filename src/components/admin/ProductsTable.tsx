"use client";

/* Список товаров админки с фильтрами как в клиентском каталоге (Task 90):
 * плитки категорий с иконками, двойные ползунки цены и веса (общий
 * DualSlider из ui/DualSlider), сортировка «название/цена» и сброс.
 * Админ-специфичные фильтры: поиск по названию/SKU и статусный select.
 *
 * Task 121: ВСЕ ФИЛЬТРЫ СЕРВЕРНЫЕ — список приходит страницами
 * (page/per_page, поиск и диапазоны считаются в SQL), в ответе — total,
 * pages и фасеты (границы цены, ступени веса, категории набора).
 * Сотни товаров больше не грузятся целиком: LIMIT 500 легаси-режима
 * остался для остальных вкладок (рецепты, состав, корзина).
 *
 * Task 97-106 добавили:
 *  - дублирование товара в один клик (черновик с теми же картинками);
 *  - массовые операции: чекбоксы → статус/категория/цена ±%/удаление;
 *  - мягкое удаление с «Отменить» вместо подтверждающих окон
 *    (удалённое живёт в «Корзине», восстановление в один клик);
 *  - метки медиа в строке: «нет фото» и «видео: N». */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** Перезагрузить список с сервера (после bulk/дублирования/восстановления) */
  reload?: () => void | Promise<void>;
}

type Filter = "all" | "catalog" | "hidden" | "bundles" | "simple" | "recipe" | "deleted" | "low_stock";

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

/** Окно номеров страниц для пагинации: 1 … (текущая ±2) … последняя */
function pageNumbers(current: number, total: number): number[] {
  const out = new Set<number>([1, total]);
  for (let n = current - 2; n <= current + 2; n++) {
    if (n >= 1 && n <= total) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export function ProductsTable({ initialProducts, reload }: Props) {
  /* Task 121: данные — С СЕРВЕРА страницами. initialProducts (легаси-
   * ответ родителя) используется только для первой отрисовки, пока не
   * отработал собственный запрос (ownDataRef). */
  const [products, setProducts] = useState(initialProducts);
  const ownDataRef = useRef(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // применённый поиск (после дебаунса)
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  /* Task 152: плитка-тревога ведёт на /admin/products?filter=low_stock —
   * начальный фильтр читаем из URL ПОСЛЕ гидрации (в useEffect, чтобы не
   * расходиться с prerender). */
  const filterFromUrlRef = useRef(false);
  useEffect(() => {
    if (filterFromUrlRef.current) return;
    filterFromUrlRef.current = true;
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f === "low_stock") {
      /* Миктотаск: синхронный setState в эффекте — react-hooks/set-state-in-effect. */
      void Promise.resolve().then(() => {
        setFilter("low_stock");
        setPage(1);
      });
    }
  }, []);
  /* Task 130: 20 товаров на страницу (просил владелец) */
  const [perPage, setPerPage] = useState(20);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [fetching, setFetching] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  /* ── Task 97-106: выбор, bulk, дублирование, undo-удаление ── */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [bulkPricePercent, setBulkPricePercent] = useState("");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  /* Тост «удалено — отменить»: мягкое удаление без подтверждающих окон */
  const [undo, setUndo] = useState<{ ids: number[]; label: string; timer: number } | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  /* ── Фильтры каталога (Task 90) ── */
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [category, setCategory] = useState<string>("all"); // slug | "all"
  const [sort, setSort] = useState<SortKey>("default");
  // Ползунки: пока пользователь их не трогал — следуют за границами данных
  // («прикоснулся» = touched, сброс = touched=false)
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
  const [priceTouched, setPriceTouched] = useState(false);
  const [weightIdx, setWeightIdx] = useState<[number, number]>([0, 0]);
  const [weightTouched, setWeightTouched] = useState(false);

  /* Фасеты с сервера (Task 121): границы цены, ступени веса, категории
     набора и иконки плиток — считаются по ВСЕМУ набору, не по странице */
  const [facets, setFacets] = useState<{
    priceMin: number;
    priceMax: number;
    weightSteps: number[];
    categoriesPresent: number[];
    categoryThumbs: { id: number; url: string }[];
  } | null>(null);

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

  /* router.refresh() приносит новые props — синхронизируем state, только
   * пока таблица ещё не перешла на собственные серверные данные.
   * set в микротаске — react-hooks/set-state-in-effect запрещает синхрон. */
  useEffect(() => {
    if (ownDataRef.current) return;
    Promise.resolve().then(() => {
      if (!ownDataRef.current) setProducts(initialProducts);
    });
  }, [initialProducts]);

  const showUndoToast = (ids: number[], label: string) => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    const timer = window.setTimeout(() => setUndo(null), 10000);
    undoTimerRef.current = timer;
    setUndo({ ids, label, timer });
  };

  /* ── Серверная пагинация (Task 121) ──
   * Границы цены/ступени веса приходят фасетами; ползунки шлют свои
   * значения в SQL. Дебаунс 250 мс: перетаскивание ползунка и набор
   * поиска дают ОДИН запрос после паузы. refreshTick — ручной «перечитать
   * текущую страницу» после bulk/дублирования/восстановления. */
  const fetchToken = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const reloadSelf = useCallback(() => {
    setRefreshTick((t) => t + 1);
    void reload?.(); // родитель перечитает легаси-список (счётчик в шапке)
  }, [reload]);

  const priceBounds = useMemo(() => {
    const rawMin = facets?.priceMin ?? 0;
    const rawMax = facets?.priceMax ?? 0;
    if (rawMax <= 0) return { min: 0, max: 0 };
    const min = Math.floor(rawMin / 10000) * 10000;
    return {
      min,
      max: Math.max(Math.ceil(rawMax / 10000) * 10000, min + 10000),
    };
  }, [facets]);
  const weightSteps = useMemo(() => facets?.weightSteps ?? [], [facets]);

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

  /* Task 130: примитивы для deps эффекта загрузки (см. комментарий там) */
  const priceLo = effPrice[0];
  const priceHi = effPrice[1];
  const weightLo = weightSteps[effWeight[0]] ?? 0;
  const weightHi = weightSteps[effWeight[1]] ?? 0;

  // Категории, реально представленные в наборе (фасет с сервера —
  // текущая страница всего набора не покрывает)
  const categoryOptions = useMemo(() => {
    if (!categories) return [];
    const present = new Set(facets?.categoriesPresent ?? []);
    if (present.size === 0) return categories; // фасетов ещё нет — показываем все
    return categories.filter((c) => present.has(c.id));
  }, [categories, facets]);

  // Иконки плиток: первая картинка товара категории (фасет с сервера),
  // без товаров — фолбэк из мока, ровно как в каталоге
  const iconBySlug = useMemo(() => {
    const byId = new Map<number, string>();
    for (const t of facets?.categoryThumbs ?? []) byId.set(t.id, t.url);
    const map = new Map<string, string>();
    for (const c of categories ?? []) {
      const icon = byId.get(c.id);
      map.set(c.slug, icon ?? CATEGORY_ICONS[c.slug] ?? mockCategories[0].imageUrl);
    }
    return map;
  }, [facets, categories]);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      const token = ++fetchToken.current;
      setFetching(true);
      try {
        const qp = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
          filter,
        });
        if (search.trim() !== "") qp.set("q", search.trim());
        const cat = (categories ?? []).find((c) => c.slug === category);
        if (cat) qp.set("category", String(cat.id));
        if (sort !== "default") {
          const sortMap: Record<string, string> = {
            "name-asc": "name_asc",
            "name-desc": "name_desc",
            "price-asc": "price_asc",
            "price-desc": "price_desc",
          };
          const s = sortMap[sort];
          if (s) qp.set("sort", s);
        }
        if (priceActive) {
          qp.set("price_min", String(effPrice[0]));
          qp.set("price_max", String(effPrice[1]));
        }
        if (weightActive) {
          qp.set("weight_min", String(weightSteps[effWeight[0]] ?? 0));
          qp.set("weight_max", String(weightSteps[effWeight[1]] ?? 0));
        }
        const res = await fetch(`${apiUrl}/admin/products?${qp.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (token !== fetchToken.current) return; // устарел — есть свежее
        if (!res.ok) {
          setError(json.error ?? `Ошибка ${res.status}`);
          setProducts([]);
          return;
        }
        ownDataRef.current = true;
        setProducts((json.data as AdminProduct[]) ?? []);
        setTotal(typeof json.total === "number" ? json.total : null);
        setPages(typeof json.pages === "number" && json.pages > 0 ? json.pages : 1);
        setFacets({
          priceMin: typeof json.price_min === "number" ? json.price_min : 0,
          priceMax: typeof json.price_max === "number" ? json.price_max : 0,
          weightSteps: Array.isArray(json.weight_steps)
            ? (json.weight_steps as number[])
            : [],
          categoriesPresent: Array.isArray(json.categories_present)
            ? (json.categories_present as number[])
            : [],
          categoryThumbs: Array.isArray(json.category_thumbs)
            ? (json.category_thumbs as { id: number; url: string }[])
            : [],
        });
      } catch (e) {
        if (token === fetchToken.current) {
          setError(e instanceof Error ? e.message : "Ошибка сети");
        }
      } finally {
        if (token === fetchToken.current) setFetching(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    apiUrl, page, perPage, search, filter, category, sort, refreshTick,
    priceTouched, priceRange, weightTouched, weightIdx, categories,
    /* Task 130: FIX «бесконечно обновляется пагинация». Раньше в deps был
     * сам объект facets, а эффект его же и перезаписывал (setFacets —
     * новый объект каждый раз) → fetch → effect → fetch… бесконечный цикл
     * перезапросов. Оставляем только ПРИМИТИВЫ, производные от facets:
     * их значения между ответами совпадают — цикл не возобновляется. */
    priceActive, priceLo, priceHi, weightActive, weightLo, weightHi,
  ]);

  /* Task 130: обновить список, когда товары изменили вне таблицы
   * (импорт ZIP в ProductsImportExport шлёт событие) — «пагинация
   * обновляется, когда добавлен новый товар» */
  useEffect(() => {
    const onChange = () => reloadSelf();
    window.addEventListener("lakomka-products-changed", onChange);
    return () => window.removeEventListener("lakomka-products-changed", onChange);
  }, [reloadSelf]);

  /** Восстановить из корзины (Task 100) и перечитать текущую страницу */
  const restoreProducts = async (ids: number[]) => {
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`${apiUrl}/admin/products/${id}/restore`, {
            method: "POST",
            credentials: "include",
          })
        )
      );
      setUndo(null);
      setSelected(new Set());
      reloadSelf(); // сервер вернёт страницу уже без/с восстановленными
    } catch {
      setError("Не удалось восстановить");
    }
  };

  const hasFilters =
    category !== "all" ||
    searchInput.trim() !== "" ||
    search.trim() !== "" ||
    filter !== "all" ||
    weightActive ||
    priceActive;

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setFilter("all");
    setCategory("all");
    setSort("default");
    setPriceTouched(false);
    setWeightTouched(false);
    setPage(1);
  };

  /* Поиск с дебаунсом (Task 121): печатаем — запрос уходит через 400 мс
   * после паузы; смена поиска сбрасывает на первую страницу */
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  /* Task 157: ПОЧИНКА inline-правки цены/остатка — она не работала с появления:
     onChange уже записывал ввод в state, а onBlur сравнивал ввод с ЭТИМ ЖЕ
     обновлённым state → значения всегда совпадали и PATCH никогда не уходил.
     Теперь при фокусе фиксируем исходное значение и сравниваем с ним. */
  const editBase = useRef<Record<number, { price: number; stock: number }>>({});

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
    /* Task 100: мягкое удаление без подтверждающего окна — товар падает
       в «Корзину», 10 секунд можно «Отменить» прямо в тосте. */
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
      setTotal((t) => (t === null ? null : Math.max(0, t - 1)));
      showUndoToast([id], `«${name}» перемещён в корзину`);
    } catch {
      setError("Ошибка сети");
    } finally {
      setDeletingId(null);
    }
  }

  /* ── Task 98: дублирование товара ── */
  async function duplicate(p: AdminProduct) {
    setDuplicatingId(p.id);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/products/${p.id}/duplicate`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось дублировать");
        return;
      }
      reloadSelf();
    } catch {
      setError("Ошибка сети");
    } finally {
      setDuplicatingId(null);
    }
  }

  /* ── Task 99: массовые операции ── */
  async function bulkAction(action: "status" | "category" | "price_percent" | "delete", value: unknown) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/products/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [...selected], action, value }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Массовая операция не удалась");
        return;
      }
      const d = json.data as { updated: number; skipped: number; skipped_names?: string[] };
      if (action === "delete") {
        const deletedIds = [...selected];
        setProducts((list) => list.filter((p) => !selected.has(p.id)));
        setTotal((t) => (t === null ? null : Math.max(0, t - deletedIds.length)));
        setSelected(new Set());
        showUndoToast(
          deletedIds,
          `Удалено: ${d.updated}` + (d.skipped ? ` · пропущены: ${d.skipped}` : "")
        );
      } else {
        setSelected(new Set());
        reloadSelf();
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setBulkBusy(false);
    }
  }

  /* ── Task 131: PDF по выбранным подаркам (название + картинка + цена) ── */
  async function exportProductsPdf() {
    if (selected.size === 0 || pdfBusy) return;
    setPdfBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/products/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      a.download = `lakomka-podarki-${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сформировать PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Поиск по названию или SKU"
          className="w-full max-w-sm rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        />
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as Filter);
            setSelected(new Set());
            setPage(1);
          }}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          <option value="all">Все</option>
          <option value="catalog">В каталоге</option>
          <option value="hidden">Скрытые</option>
          <option value="simple">Только товары</option>
          <option value="bundles">Только наборы</option>
          <option value="recipe">Только конфеты</option>
          <option value="low_stock">Заканчиваются</option>
          <option value="deleted">Корзина</option>
        </select>
        <span className="text-sm text-[var(--color-muted)]">
          Найдено: {total ?? products.length}
          {fetching && <span className="ml-2 animate-pulse">обновляем…</span>}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <span className="hidden sm:inline">Сортировка</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setPage(1);
            }}
            aria-label="Сортировка"
            className="cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-heading)] focus:border-[var(--color-primary)] focus:outline-none"
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
        <div className="mb-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          {categoryOptions.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Категория</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
                <button
                  onClick={() => {
                    setCategory("all");
                    setPage(1);
                  }}
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
                    onClick={() => {
                      setCategory(c.slug);
                      setPage(1);
                    }}
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

      {/* ── Панель массовых операций (Task 99) ── */}
      {filter !== "deleted" && selected.size > 0 && (
        <div
          data-testid="bulk-bar"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-primary)] bg-[var(--color-card)] p-3 text-sm shadow-sm"
        >
          <span className="font-medium text-[var(--color-heading)]">
            Выбрано: {selected.size}
          </span>
          {/* Task 131: PDF по выбранным подаркам — первая кнопка панели */}
          <button
            data-testid="pdf-btn"
            disabled={pdfBusy}
            onClick={exportProductsPdf}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pdfBusy ? "Формируем…" : "Сформировать PDF"}
          </button>
          <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />
          <button
            disabled={bulkBusy}
            onClick={() => bulkAction("status", { is_published: 1 })}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 hover:border-[var(--color-primary)] disabled:opacity-50"
          >
            Опубликовать
          </button>
          <button
            disabled={bulkBusy}
            onClick={() => bulkAction("status", { is_published: 0 })}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 hover:border-[var(--color-primary)] disabled:opacity-50"
          >
            Скрыть
          </button>
          <button
            disabled={bulkBusy}
            onClick={() => bulkAction("status", { show_in_catalog: 1 })}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 hover:border-[var(--color-primary)] disabled:opacity-50"
          >
            В каталог
          </button>
          <button
            disabled={bulkBusy}
            onClick={() => bulkAction("status", { show_in_catalog: 0 })}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 hover:border-[var(--color-primary)] disabled:opacity-50"
          >
            Из каталога
          </button>
          <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />
          <select
            value={bulkCategoryId}
            onChange={(e) => setBulkCategoryId(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] px-2 py-1.5"
            aria-label="Категория для массовой смены"
          >
            <option value="">Категория…</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
          <button
            disabled={bulkBusy || bulkCategoryId === ""}
            onClick={() => bulkAction("category", bulkCategoryId)}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 hover:border-[var(--color-primary)] disabled:opacity-50"
          >
            Применить категорию
          </button>
          <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />
          <input
            type="number"
            value={bulkPricePercent}
            onChange={(e) => setBulkPricePercent(e.target.value)}
            placeholder="±%"
            aria-label="Процент изменения цены"
            className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1.5"
          />
          <button
            disabled={bulkBusy || bulkPricePercent === "" || Number(bulkPricePercent) === 0}
            onClick={() => bulkAction("price_percent", Number(bulkPricePercent))}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 hover:border-[var(--color-primary)] disabled:opacity-50"
          >
            Изменить цены
          </button>
          <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />
          <button
            disabled={bulkBusy}
            onClick={() => bulkAction("delete", null)}
            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Удалить выбранные
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-[var(--color-muted)] underline"
          >
            Снять выделение
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {filter !== "deleted" && (
                <th className="w-10 p-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="Выбрать всё"
                    checked={products.length > 0 && products.every((p) => selected.has(p.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected(new Set(products.map((p) => p.id)));
                      } else {
                        setSelected(new Set());
                      }
                    }}
                    className="accent-[var(--color-primary)]"
                  />
                </th>
              )}
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
            {products.map((p) => {
              const isRecipe = p.type === "recipe";
              const isDeletedRow = filter === "deleted";
              return (
                <tr
                  key={p.id}
                  className={`border-b border-[var(--color-border)] last:border-none ${
                    savingId === p.id || deletingId === p.id || duplicatingId === p.id ? "opacity-50" : ""
                  } ${isDeletedRow ? "bg-orange-50/50" : ""}`}
                >
                  {!isDeletedRow && (
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Выбрать «${p.name}»`}
                        checked={selected.has(p.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          setSelected(next);
                        }}
                        className="accent-[var(--color-primary)]"
                      />
                    </td>
                  )}
                  <td className="p-3">
                    <Link href={`/admin/products/edit?id=${p.id}`} className="hover:text-[var(--color-primary)]">
                      {p.name}
                    </Link>
                    {p.sku && <span className="ml-2 text-xs text-[var(--color-muted)]">{p.sku}</span>}
                    {/* Метки медиа (Task 101): незаполненное фото и тяжёлые видео */}
                    {(p.imgs ?? 0) === 0 && (
                      <span
                        data-testid="no-photo-badge"
                        title="У товара нет ни одной картинки — карточка будет пустой"
                        className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                      >
                        нет фото
                      </span>
                    )}
                    {(p.vids ?? 0) > 0 && (
                      <span
                        title="В товаре есть видео — с выключенной галочкой «Показывать видео в карточках» каталог грузится быстрее"
                        className="ml-1.5 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                      >
                        видео: {p.vids}
                      </span>
                    )}
                    {isDeletedRow && p.deleted_at && (
                      <span className="ml-2 text-xs text-[var(--color-muted)]">
                        удалён: {new Date(p.deleted_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[p.type] ?? "bg-gray-100"}`}>
                      {TYPE_LABEL[p.type] ?? p.type}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {/* Task 157: inline-правка цены/остатка (была ранее) + коммит по Enter
                        и aria-label — раньше сохранение было только по клику мимо поля. */}
                    <input
                      type="number"
                      aria-label="Цена, ₽"
                      value={Math.round(p.price_kopecks / 100)}
                      onFocus={() => { editBase.current[p.id] = { price: p.price_kopecks, stock: p.stock_qty }; }}
                      onChange={(e) => setProducts((list) => list.map((x) => x.id === p.id ? { ...x, price_kopecks: (Number(e.target.value) || 0) * 100 } : x))}
                      onBlur={(e) => {
                        const newKopecks = (Number(e.target.value) || 0) * 100;
                        if (newKopecks !== (editBase.current[p.id]?.price ?? p.price_kopecks)) patch(p.id, { price_kopecks: newKopecks });
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      className="w-24 rounded border border-[var(--color-border)] px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      aria-label="Остаток, шт"
                      value={p.stock_qty}
                      onFocus={() => { editBase.current[p.id] = { price: p.price_kopecks, stock: p.stock_qty }; }}
                      onChange={(e) => setProducts((list) => list.map((x) => x.id === p.id ? { ...x, stock_qty: Number(e.target.value) || 0 } : x))}
                      onBlur={(e) => {
                        const newStock = Number(e.target.value) || 0;
                        if (newStock !== (editBase.current[p.id]?.stock ?? p.stock_qty)) patch(p.id, { stock_qty: newStock });
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
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
                    {isDeletedRow ? (
                      <>
                        <button
                          onClick={() => restoreProducts([p.id])}
                          className="mr-3 text-xs text-[var(--color-primary)] hover:underline"
                        >
                          восстановить
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`Удалить «${p.name}» НАВСЕГДА? Вернуть будет нельзя.`)) return;
                            (async () => {
                              try {
                                const res = await fetch(`${apiUrl}/admin/products/${p.id}?force=1`, {
                                  method: "DELETE",
                                  credentials: "include",
                                });
                                const json = await res.json();
                                if (!res.ok) {
                                  setError(json.error ?? "Не удалось удалить");
                                  return;
                                }
                                reloadSelf();
                              } catch {
                                setError("Ошибка сети");
                              }
                            })();
                          }}
                          className="text-xs text-[var(--color-muted)] hover:text-red-600"
                        >
                          удалить навсегда
                        </button>
                      </>
                    ) : (
                      <>
                        <Link href={`/admin/products/edit?id=${p.id}`} className="mr-3 text-xs text-[var(--color-primary)] hover:underline">
                          ред.
                        </Link>
                        {/* Task 157: «открыть на сайте» прямо из строки — раньше приходилось
                            искать товар на витрине вручную. У «частей набора» своей карточки
                            нет; у скрытого товара карточка недоступна — приглушаем и предупреждаем. */}
                        {p.type !== "recipe" && p.slug && (
                          <a
                            href={`/product/${p.slug}/`}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`site-link-${p.id}`}
                            title={p.show_in_catalog === 1
                              ? "Открыть карточку товара на сайте (в новой вкладке)"
                              : "Товар скрыт из каталога — на сайте карточка недоступна"}
                            className={`mr-3 text-xs ${p.show_in_catalog === 1
                              ? "text-[var(--color-primary)] hover:underline"
                              : "text-[var(--color-muted)] hover:text-[var(--color-body)]"}`}
                          >
                            сайт
                          </a>
                        )}
                        <button
                          onClick={() => duplicate(p)}
                          disabled={duplicatingId === p.id}
                          title="Создать копию товара (черновик с теми же картинками и составом)"
                          className="mr-3 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)]"
                        >
                          {duplicatingId === p.id ? "копируем…" : "копия"}
                        </button>
                        <button onClick={() => destroy(p.id, p.name)} disabled={deletingId === p.id}
                          title="Переместить в корзину (можно отменить)"
                          className="text-xs text-[var(--color-muted)] hover:text-red-600">
                          удалить
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-sm text-[var(--color-muted)]">
                  {filter === "deleted"
                    ? "Корзина пуста."
                    : "Ничего не найдено — попробуйте изменить или сбросить фильтры."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Пагинация (Task 121): сервер отдаёт страницу за страницей ── */}
      {pages > 1 && (
        <div
          data-testid="pagination"
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
        >
          <span className="text-sm text-[var(--color-muted)]">
            Страница {page} из {pages}
            {total !== null && ` · всего ${total}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1 || fetching}
              onClick={() => setPage(1)}
              aria-label="Первая страница"
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]"
            >
              «
            </button>
            <button
              type="button"
              disabled={page <= 1 || fetching}
              onClick={() => setPage(page - 1)}
              aria-label="Предыдущая страница"
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]"
            >
              ‹
            </button>
            {pageNumbers(page, pages).map((n) => (
              <button
                key={n}
                type="button"
                disabled={fetching}
                onClick={() => setPage(n)}
                aria-current={n === page ? "page" : undefined}
                className={`min-w-[34px] rounded-lg border px-2 py-1.5 text-sm transition-colors ${
                  n === page
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= pages || fetching}
              onClick={() => setPage(page + 1)}
              aria-label="Следующая страница"
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]"
            >
              ›
            </button>
            <button
              type="button"
              disabled={page >= pages || fetching}
              onClick={() => setPage(pages)}
              aria-label="Последняя страница"
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]"
            >
              »
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            На странице
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value) || 20);
                setPage(1);
              }}
              aria-label="Товаров на странице"
              className="rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm"
            >
              {[20, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* ── Тост «удалено — отменить» (Task 100) ── */}
      {undo && (
        <div
          data-testid="undo-toast"
          className="fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#3a3a3a] px-5 py-2.5 text-sm text-white shadow-xl"
        >
          <span>{undo.label}</span>
          <button
            onClick={() => restoreProducts(undo.ids)}
            className="font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
          >
            Отменить
          </button>
        </div>
      )}
    </div>
  );
}
