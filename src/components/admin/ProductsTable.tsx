"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminProduct } from "@/app/admin/products/page";

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

export function ProductsTable({ initialProducts }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === "catalog" && !(p.show_in_catalog === 1 && p.is_published === 1 && p.type !== "recipe")) return false;
      if (filter === "hidden" && !(p.show_in_catalog === 0 || p.is_published === 0)) return false;
      if (filter === "bundles" && p.type !== "bundle") return false;
      if (filter === "simple" && p.type !== "simple") return false;
      if (filter === "recipe" && p.type !== "recipe") return false;
      if (q) {
        const haystack = `${p.name} ${p.sku ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, filter]);

  async function patch(id: number, payload: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
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
      setProducts((list) => list.map((p) => (p.id === id ? { ...p, ...json.data } : p)));
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
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
      </div>

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
            {filtered.map((p) => {
              const isRecipe = p.type === "recipe";
              return (
                <tr
                  key={p.id}
                  className={`border-b border-[var(--color-border)] last:border-none ${
                    savingId === p.id || deletingId === p.id ? "opacity-50" : ""
                  }`}
                >
                  <td className="p-3">
                    <Link href={`/admin/products/${p.id}`} className="hover:text-[var(--color-primary)]">
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
                    <Link href={`/admin/products/${p.id}`} className="mr-3 text-xs text-[var(--color-primary)] hover:underline">
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
          </tbody>
        </table>
      </div>
    </div>
  );
} 