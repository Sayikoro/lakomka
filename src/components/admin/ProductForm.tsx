"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductType } from "@/lib/types";

export interface ProductFormValues {
  id?: number;
  name: string;
  slug: string;
  sku: string;
  type: ProductType;
  price_kopecks: number;
  stock_qty: number;
  show_in_catalog: number;
  is_published: number;
  description: string;
  manufacturer: string;
  packaging_material: string;
  weight_g: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  recipe_weight_g: number | null;
}

interface Props {
  mode: "create" | "edit";
  initial?: ProductFormValues;
}

const DEFAULTS: ProductFormValues = {
  name: "", slug: "", sku: "",
  type: "simple",
  price_kopecks: 0, stock_qty: 0,
  show_in_catalog: 1, is_published: 1,
  description: "", manufacturer: "",
  packaging_material: "",
  weight_g: null, length_cm: null, width_cm: null, height_cm: null,
  recipe_weight_g: null,
};

const PACKAGING_OPTIONS = [
  { value: "", label: "— не указано —" },
  { value: "cardboard", label: "Картон" },
  { value: "tin", label: "Жесть" },
  { value: "textile", label: "Текстиль" },
  { value: "tube", label: "Туба" },
  { value: "pouch", label: "Мешочек" },
];

const RECIPE_WEIGHT_OPTIONS = [
  { value: "", label: "— не задано —" },
  { value: 200, label: "200 г" },
  { value: 400, label: "400 г" },
  { value: 500, label: "500 г" },
  { value: 600, label: "600 г" },
  { value: 700, label: "700 г" },
  { value: 800, label: "800 г" },
  { value: 900, label: "900 г" },
  { value: 1000, label: "1000 г" },
  { value: 1100, label: "1100 г" },
  { value: 1200, label: "1200 г" },
  { value: 1400, label: "1400 г" },
  { value: 1600, label: "1600 г" },
  { value: 2500, label: "2500 г" },
];

export function ProductForm({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ProductFormValues>(initial ?? DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductFormValues>(k: K, v: ProductFormValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  function setType(t: ProductType) {
    setForm((f) => ({
      ...f,
      type: t,
      // recipe — всегда скрыт из каталога
      show_in_catalog: t === "recipe" ? 0 : f.show_in_catalog,
      // при выборе рецепта цена обычно 0
      price_kopecks: t === "recipe" && f.price_kopecks === 0 ? 0 : f.price_kopecks,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const url = mode === "create"
        ? `${apiUrl}/admin/products`
        : `${apiUrl}/admin/products/${form.id}`;

      const payload: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        sku: form.sku || null,
        price_kopecks: form.price_kopecks,
        stock_qty: form.stock_qty,
        show_in_catalog: form.type === "recipe" ? 0 : form.show_in_catalog,
        is_published: form.is_published,
        description: form.description,
        manufacturer: form.manufacturer,
        packaging_material: form.packaging_material,
        weight_g: form.weight_g,
        length_cm: form.length_cm,
        width_cm: form.width_cm,
        height_cm: form.height_cm,
      };
      if (mode === "create") payload.type = form.type;
      if (form.type === "bundle") {
        payload.recipe_weight_g = form.recipe_weight_g;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Не удалось сохранить"); return; }

      if (mode === "create") {
        router.push(`/admin/products/${json.data.id}`);
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch { setError("Ошибка сети"); }
    finally { setSaving(false); }
  }

  const input =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const label = "mb-1 block text-sm font-medium text-[var(--color-heading)]";

  return (
    <form onSubmit={submit} className="space-y-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
      {/* Тип */}
      <div>
        <label className={label}>Тип товара</label>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setType("simple")}
            disabled={mode === "edit"}
            className={`rounded-lg border-2 px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
              form.type === "simple"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]"
            }`}
          >
            <div className="font-medium">Простой</div>
            <div className={`text-xs ${form.type === "simple" ? "text-white/80" : "text-[var(--color-muted)]"}`}>
              Чай, самовар — продаётся отдельно
            </div>
          </button>
          <button
            type="button"
            onClick={() => setType("bundle")}
            disabled={mode === "edit"}
            className={`rounded-lg border-2 px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
              form.type === "bundle"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]"
            }`}
          >
            <div className="font-medium">Набор</div>
            <div className={`text-xs ${form.type === "bundle" ? "text-white/80" : "text-[var(--color-muted)]"}`}>
              Подарок из нескольких позиций
            </div>
          </button>
          <button
            type="button"
            onClick={() => setType("recipe")}
            disabled={mode === "edit"}
            className={`rounded-lg border-2 px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
              form.type === "recipe"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]"
            }`}
          >
            <div className="font-medium">Часть набора</div>
            <div className={`text-xs ${form.type === "recipe" ? "text-white/80" : "text-[var(--color-muted)]"}`}>
              Конфета или компонент состава набора, не в каталоге
            </div>
          </button>
        </div>
        {mode === "edit" && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Тип нельзя изменить после создания
          </p>
        )}
      </div>

      {/* Название */}
      <div>
        <label className={label}>Название *</label>
        <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={input} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Slug</label>
          <input value={form.slug} onChange={(e) => set("slug", e.target.value)}
            placeholder="оставь пустым — сгенерируется" className={input} />
        </div>
        <div>
          <label className={label}>SKU / Артикул</label>
          <input value={form.sku} onChange={(e) => set("sku", e.target.value)} className={input} />
        </div>
      </div>

      <div>
        <label className={label}>Производитель</label>
        <input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)}
          placeholder="Например, Конти" className={input} />
      </div>

      <div>
        <label className={label}>Описание</label>
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)}
          rows={4} placeholder="Состав, вес, особенности…" className={input} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Цена (₽)</label>
          <input type="number" min={0}
            value={Math.round(form.price_kopecks / 100)}
            onChange={(e) => set("price_kopecks", (Number(e.target.value) || 0) * 100)}
            className={input} />
        </div>
        <div>
          <label className={label}>Остаток (шт.)</label>
          <input type="number" min={0}
            value={form.stock_qty}
            onChange={(e) => set("stock_qty", Number(e.target.value) || 0)}
            className={input} />
        </div>
      </div>

      {form.type === "bundle" && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-4">
          <label className={label}>Граммовка рецепта</label>
          <select
            value={form.recipe_weight_g ?? ""}
            onChange={(e) =>
              set("recipe_weight_g", e.target.value === "" ? null : Number(e.target.value))
            }
            className={input}
          >
            {RECIPE_WEIGHT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {mode === "create"
              ? "После создания состав набора автоматически заполнится конфетами из рецепта."
              : "Только для справки. Заполнить состав можно кнопкой в панели состава."}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-4">
        <p className="mb-3 text-sm font-medium text-[var(--color-heading)]">Упаковка и габариты</p>
        <div className="space-y-3">
          <div>
            <label className={label}>Материал упаковки</label>
            <select
              value={form.packaging_material}
              onChange={(e) => set("packaging_material", e.target.value)}
              className={input}
            >
              {PACKAGING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Вес (г)</label>
            <input type="number" min={0}
              value={form.weight_g ?? ""}
              onChange={(e) => set("weight_g", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="например, 1500" className={input} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={label}>Длина (см)</label>
              <input type="number" min={0} step="0.1"
                value={form.length_cm ?? ""}
                onChange={(e) => set("length_cm", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="0" className={input} />
            </div>
            <div>
              <label className={label}>Ширина (см)</label>
              <input type="number" min={0} step="0.1"
                value={form.width_cm ?? ""}
                onChange={(e) => set("width_cm", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="0" className={input} />
            </div>
            <div>
              <label className={label}>Высота (см)</label>
              <input type="number" min={0} step="0.1"
                value={form.height_cm ?? ""}
                onChange={(e) => set("height_cm", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="0" className={input} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        {form.type !== "recipe" && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={form.show_in_catalog === 1}
              onChange={(e) => set("show_in_catalog", e.target.checked ? 1 : 0)}
              className="accent-[var(--color-primary)]" />
            Показывать в каталоге
          </label>
        )}
        {form.type === "recipe" && (
          <p className="text-xs text-[var(--color-muted)]">
            Конфеты не показываются в каталоге — они только входят в состав наборов
          </p>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_published === 1}
            onChange={(e) => set("is_published", e.target.checked ? 1 : 0)}
            className="accent-[var(--color-primary)]" />
          Опубликован
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving}
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
          {saving ? "Сохраняем…" : mode === "create" ? "Создать" : "Сохранить"}
        </button>
        {saved && <span className="text-sm text-green-700">✓ Сохранено</span>}
      </div>
    </form>
  );
}