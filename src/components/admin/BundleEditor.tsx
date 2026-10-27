"use client";

import { useEffect, useMemo, useState } from "react";

export interface BundleRow {
  id: number;
  component_id: number;
  component_name: string;
  sku: string | null;
  type: string;
  price_kopecks: number;
  show_in_catalog: number;
  quantity: number;
}

interface Component {
  id: number;
  name: string;
  sku: string | null;
  type: string;
}

interface WeightOption {
  weight_g: number;
  items_count: number;
}

interface Props {
  productId: number;
  initial: BundleRow[];
  initialRecipeWeight: number | null;
}

export function BundleEditor({ productId, initial, initialRecipeWeight }: Props) {
  const [rows, setRows] = useState<BundleRow[]>(initial);
  const [recipeWeight, setRecipeWeight] = useState<number | null>(initialRecipeWeight);
  const [weightOptions, setWeightOptions] = useState<WeightOption[]>([]);
  const [selectedWeight, setSelectedWeight] = useState<number | "">("");
  const [filling, setFilling] = useState(false);
  const [fillMsg, setFillMsg] = useState<string | null>(null);

  const [allComponents, setAllComponents] = useState<Component[] | null>(null);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [pickedQty, setPickedQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<number | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

  /* ---- Загрузка опций граммовок ---- */
  useEffect(() => {
    fetch(`${apiUrl}/admin/weight-recipes`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        const opts = (j.data as WeightOption[]) ?? [];
        setWeightOptions(opts);
        if (initialRecipeWeight) {
          setSelectedWeight(initialRecipeWeight);
        } else if (opts.length > 0) {
          setSelectedWeight(opts[0].weight_g);
        }
      })
      .catch(() => {
        // viewer или нет рецептов — не блокируем
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    async function loadComponents() {
    if (allComponents || loadingComponents) return;
    setLoadingComponents(true);
    try {
      const res = await fetch(`${apiUrl}/admin/products?filter=recipe`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data: Component[] };
      setAllComponents(json.data ?? []);
    } finally {
      setLoadingComponents(false);
    }
  }

  const availableComponents = useMemo(() => {
    if (!allComponents) return [];
    const used = new Set(rows.map((r) => r.component_id));
    const q = pickerSearch.trim().toLowerCase();
    return allComponents.filter((c) => {
      if (used.has(c.id)) return false;
      if (!q) return true;
      return `${c.name} ${c.sku ?? ""}`.toLowerCase().includes(q);
    });
  }, [allComponents, rows, pickerSearch]);

  async function reload() {
    const res = await fetch(`${apiUrl}/admin/products/${productId}/bundle`, {
      credentials: "include",
    });
    if (res.ok) {
      const json = await res.json();
      setRows(json.data);
    }
  }

  async function fillByWeight() {
    if (!selectedWeight) {
      setError("Выберите граммовку");
      return;
    }
    const w = selectedWeight as number;
    if (!confirm(`Заменить текущий состав на рецепт из ${w} г?`)) return;

    setFilling(true);
    setFillMsg(null);
    setError(null);
    try {
      const res = await fetch(
        `${apiUrl}/admin/products/${productId}/fill-by-weight`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ weight_g: w, mode: "replace" }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось заполнить");
        return;
      }
      const { changed, matched, items } = json.data;
      if (matched && !changed) {
        setFillMsg(`Состав уже совпадает с рецептом ${w} г (${items} позиций)`);
      } else {
        setFillMsg(`Заполнено по рецепту ${w} г: ${items} позиций`);
      }
      setRecipeWeight(w);
      await reload();
    } catch {
      setError("Ошибка сети");
    } finally {
      setFilling(false);
    }
  }

  async function addComponent() {
    if (!pickedId) {
      setError("Выберите компонент");
      return;
    }
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/products/${productId}/bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ component_id: pickedId, quantity: pickedQty }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось добавить");
        return;
      }
      setPickedId(null);
      setPickedQty(1);
      setPickerSearch("");
      setPickerOpen(false);
      await reload();
    } catch {
      setError("Ошибка сети");
    }
  }

  async function updateQty(row: BundleRow, qty: number) {
    if (qty <= 0) return;
    setBusyRow(row.id);
    try {
      const res = await fetch(
        `${apiUrl}/admin/products/${productId}/bundle/${row.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ quantity: qty }),
        }
      );
      if (res.ok) {
        setRows((list) =>
          list.map((r) => (r.id === row.id ? { ...r, quantity: qty } : r))
        );
      }
    } finally {
      setBusyRow(null);
    }
  }

  async function removeRow(row: BundleRow) {
    if (!confirm(`Удалить «${row.component_name}» из состава?`)) return;
    setBusyRow(row.id);
    try {
      const res = await fetch(
        `${apiUrl}/admin/products/${productId}/bundle/${row.id}`,
        { method: "DELETE", credentials: "include" }
      );
      if (res.ok) {
        setRows((list) => list.filter((r) => r.id !== row.id));
      }
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <section className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
      {/* Панель заполнения по граммовке */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-heading)]">
              Заполнить по граммовке
            </h3>
            <p className="text-xs text-[var(--color-muted)]">
              Возьмёт список конфет из справочника рецептов для выбранного веса.
              {recipeWeight && (
                <span className="ml-1 font-medium text-[var(--color-heading)]">
                  Текущая: {recipeWeight} г
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedWeight}
            onChange={(e) =>
              setSelectedWeight(e.target.value === "" ? "" : Number(e.target.value))
            }
            disabled={filling || weightOptions.length === 0}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          >
            {weightOptions.length === 0 && (
              <option value="">Нет рецептов</option>
            )}
            {weightOptions.map((o) => (
              <option key={o.weight_g} value={o.weight_g}>
                {o.weight_g} г ({o.items_count} поз.)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={fillByWeight}
            disabled={filling || !selectedWeight || weightOptions.length === 0}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {filling ? "Заполняем…" : "Заполнить"}
          </button>
        </div>

        {fillMsg && (
          <p className="mt-2 text-xs text-green-700">✓ {fillMsg}</p>
        )}
      </div>

      {/* Существующая шапка */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          Состав набора{" "}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            ({rows.length})
          </span>
        </h2>
        <button
          type="button"
          onClick={() => {
            setPickerOpen(true);
            loadComponents();
          }}
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          + Добавить компонент
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">закрыть</button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          Пока пусто. Заполните по граммовке или добавьте компоненты вручную.
        </p>
      ) : (
        <div className="max-h-[500px] overflow-y-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-bg-soft)]">
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="p-2">Компонент</th>
                <th className="p-2 text-center">Кол-во</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-[var(--color-border)] ${busyRow === r.id ? "opacity-50" : ""}`}
                >
                  <td className="p-2">
                    <p className="font-medium">{r.component_name}</p>
                    {r.sku && <p className="text-xs text-[var(--color-muted)]">{r.sku}</p>}
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number"
                      min={1}
                      value={r.quantity}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0;
                        setRows((list) =>
                          list.map((x) => (x.id === r.id ? { ...x, quantity: v } : x))
                        );
                      }}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v > 0 && v !== r.quantity) updateQty(r, v);
                        if (v <= 0) updateQty(r, 1);
                      }}
                      className="w-16 rounded border border-[var(--color-border)] px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(r)}
                      className="text-xs text-[var(--color-muted)] hover:text-red-600"
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модалка выбора компонента (не изменилась) */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPickerOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              Добавить компонент
            </h3>

            <input
              type="search"
              autoFocus
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Поиск по названию или SKU"
              className="mb-3 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />

            {loadingComponents ? (
              <p className="text-sm text-[var(--color-muted)]">Загружаем…</p>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--color-border)]">
                {availableComponents.length === 0 ? (
                  <p className="p-3 text-sm text-[var(--color-muted)]">Ничего не найдено</p>
                ) : (
                  availableComponents.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPickedId(c.id)}
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-soft)] ${
                        pickedId === c.id ? "bg-[var(--color-bg-soft)] font-medium" : ""
                      }`}
                    >
                      {c.name}
                      {c.sku && <span className="ml-2 text-xs text-[var(--color-muted)]">{c.sku}</span>}
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm">Кол-во:</label>
              <input
                type="number"
                min={1}
                value={pickedQty}
                onChange={(e) => setPickedQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!pickedId}
                onClick={addComponent}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}