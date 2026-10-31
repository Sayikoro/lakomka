"use client";

/* Общие элементы фильтров каталога и админки (Task 90):
 * — DualSlider: двойной ползунок «от — до» (цена/вес);
 * — weightLabel / priceLabel: подписи ступеней;
 * — SORT_OPTIONS: единые варианты сортировки.
 * Разметка и поведение 1-в-1 как в клиентском каталоге
 * (src/app/(shop)/catalog/CatalogClient.tsx). */

export type SortKey = "default" | "name-asc" | "name-desc" | "price-asc" | "price-desc";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default",   label: "По умолчанию" },
  { value: "name-asc",  label: "Название: А—Я" },
  { value: "name-desc", label: "Название: Я—А" },
  { value: "price-asc", label: "Цена: сначала дешевле" },
  { value: "price-desc", label: "Цена: сначала дороже" },
];

/** 200 → «200 г», 1000 → «1 кг», 1100 → «1,1 кг», 2500 → «2,5 кг» */
export function weightLabel(g: number): string {
  if (g < 1000) return `${g} г`;
  const kg = g / 1000;
  const s = Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(".", ",");
  return `${s} кг`;
}

/** kopecks → «1 850 ₽» */
export function priceLabel(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString("ru-RU")} ₽`;
}

/** Двойной ползунок «от — до» по ступеням */
export function DualSlider({
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
