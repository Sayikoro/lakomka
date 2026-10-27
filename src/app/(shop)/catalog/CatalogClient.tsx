"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductCardNew } from "@/components/ui/ProductCardNew";
import { PACKAGING_LABELS } from "@/lib/constants";
import type { Product } from "@/lib/types";

interface Props {
  products: Product[];
  /** Шаблон карточки: classic (светлая) | new (тёмная со свайпом) — задаётся в админке */
  template?: "classic" | "new";
}

const PRICE_RANGES = [
  { key: "all", label: "Любая цена", min: 0, max: Infinity },
  { key: "lt500", label: "до 500 ₽", min: 0, max: 50000 },
  { key: "500-1500", label: "500 – 1 500 ₽", min: 50000, max: 150000 },
  { key: "1500-3000", label: "1 500 – 3 000 ₽", min: 150000, max: 300000 },
  { key: "gt3000", label: "от 3 000 ₽", min: 300000, max: Infinity },
] as const;

export function CatalogClient({ products, template = "classic" }: Props) {
  const [packaging, setPackaging] = useState<string>("all");
  const [priceRange, setPriceRange] = useState<string>("all");
  const [search, setSearch] = useState("");

  const packagingOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.packaging_material && set.add(p.packaging_material));
    return ["all", ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    const range = PRICE_RANGES.find((r) => r.key === priceRange) ?? PRICE_RANGES[0];
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (packaging !== "all" && p.packaging_material !== packaging) return false;
      if (p.price_kopecks < range.min || p.price_kopecks > range.max) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, packaging, priceRange, search]);

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--color-heading)]">Поиск</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название товара"
            className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Упаковка</div>
          <div className="space-y-1">
            {packagingOptions.map((opt) => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="packaging"
                  value={opt}
                  checked={packaging === opt}
                  onChange={() => setPackaging(opt)}
                  className="accent-[var(--color-primary)]"
                />
                {opt === "all" ? "Все" : PACKAGING_LABELS[opt] ?? opt}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-[var(--color-heading)]">Цена</div>
          <div className="space-y-1">
            {PRICE_RANGES.map((r) => (
              <label key={r.key} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="price"
                  value={r.key}
                  checked={priceRange === r.key}
                  onChange={() => setPriceRange(r.key)}
                  className="accent-[var(--color-primary)]"
                />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      </aside>

      <section>
        <div className="mb-4 text-sm text-[var(--color-muted)]">
          Найдено: {filtered.length} из {products.length}
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] p-12 text-center text-[var(--color-muted)]">
            Ничего не нашлось. Попробуй изменить фильтры.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) =>
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