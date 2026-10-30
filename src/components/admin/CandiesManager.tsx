"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ================= Типы ================= */

interface Candy {
  id: number;
  sku: string | null;
  slug: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  price_kopecks: number;
  stock_qty: number;
  weight_g: number | null;
  is_published: number;
  recipes_count: number;
  bundles_count: number;
  sets_count: number;
}

interface SetItem {
  product_id: number;
  quantity: number;
  product_name: string;
  sku: string | null;
  manufacturer: string | null;
}

interface CandySet {
  id: number;
  name: string;
  is_filter: number;
  created_at: string;
  items: SetItem[];
}

interface CandyOption {
  id: number;
  name: string;
  sku: string | null;
  manufacturer: string | null;
  weight_g: number | null;
}

/* ================= Утилиты ================= */

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-heading)]";

function usageLabel(c: Candy): string {
  const parts: string[] = [];
  if (c.recipes_count > 0) parts.push(`рецепты: ${c.recipes_count}`);
  if (c.bundles_count > 0) parts.push(`составы: ${c.bundles_count}`);
  if (c.sets_count > 0) parts.push(`кастомные наборы: ${c.sets_count}`);
  return parts.length ? parts.join(" · ") : "не используется";
}

/* ================= Главный компонент ================= */

export function CandiesManager() {
  const [tab, setTab] = useState<"candies" | "sets">("candies");
  const [candies, setCandies] = useState<Candy[]>([]);
  const [sets, setSets] = useState<CandySet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // модалки
  const [candyModal, setCandyModal] = useState<
    { mode: "create" } | { mode: "edit"; candy: Candy } | null
  >(null);
  const [setModal, setSetModal] = useState<
    { mode: "create" } | { mode: "edit"; set: CandySet } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Candy | null>(null);
  const [deleteSetTarget, setDeleteSetTarget] = useState<CandySet | null>(null);

  const loadCandies = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/candies`, { credentials: "include" });
      const json = (await res.json()) as { data?: Candy[]; error?: string };
      if (!res.ok) { setError(json.error ?? "Не удалось загрузить конфеты"); return; }
      setCandies(json.data ?? []);
    } catch { setError("Ошибка сети"); }
  }, []);

  const loadSets = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/candy-sets`, { credentials: "include" });
      const json = (await res.json()) as { data?: CandySet[]; error?: string };
      if (!res.ok) { setError(json.error ?? "Не удалось загрузить наборы"); return; }
      setSets(json.data ?? []);
    } catch { setError("Ошибка сети"); }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await Promise.all([loadCandies(), loadSets()]);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [loadCandies, loadSets]);

  return (
    <div>
      {/* Табы */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab("candies")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "candies"
              ? "bg-[var(--color-primary)] text-white"
              : "border border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:border-[var(--color-primary)]"
          }`}
        >
          Конфеты <span className="opacity-70">({candies.length})</span>
        </button>
        <button
          onClick={() => setTab("sets")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "sets"
              ? "bg-[var(--color-primary)] text-white"
              : "border border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:border-[var(--color-primary)]"
          }`}
        >
          Кастомные наборы <span className="opacity-70">({sets.length})</span>
        </button>
        <span className="ml-auto flex gap-2">
          {tab === "candies" ? (
            <button
              onClick={() => setCandyModal({ mode: "create" })}
              className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              + Добавить конфету
            </button>
          ) : (
            <button
              onClick={() => setSetModal({ mode: "create" })}
              className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              + Создать набор
            </button>
          )}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-xs underline">закрыть</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-10 text-center text-sm text-[var(--color-muted)]">
          Загружаем…
        </div>
      ) : tab === "candies" ? (
        <CandiesTable
          candies={candies}
          onEdit={(c) => setCandyModal({ mode: "edit", candy: c })}
          onDelete={(c) => setDeleteTarget(c)}
        />
      ) : (
        <SetsList
          sets={sets}
          onEdit={(s) => setSetModal({ mode: "edit", set: s })}
          onDelete={(s) => setDeleteSetTarget(s)}
        />
      )}

      {/* Модалки */}
      {candyModal && (
        <CandyModal
          initial={candyModal.mode === "edit" ? candyModal.candy : null}
          onClose={() => setCandyModal(null)}
          onSaved={async () => { setCandyModal(null); await loadCandies(); }}
        />
      )}
      {setModal && (
        <SetModal
          initial={setModal.mode === "edit" ? setModal.set : null}
          onClose={() => setSetModal(null)}
          onSaved={async () => { setSetModal(null); await Promise.all([loadSets(), loadCandies()]); }}
        />
      )}
      {deleteTarget && (
        <DeleteCandyModal
          candy={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={async () => { setDeleteTarget(null); await Promise.all([loadCandies(), loadSets()]); }}
        />
      )}
      {deleteSetTarget && (
        <DeleteSetModal
          set={deleteSetTarget}
          onClose={() => setDeleteSetTarget(null)}
          onDeleted={async () => { setDeleteSetTarget(null); await loadSets(); }}
        />
      )}
    </div>
  );
}

/* ================= Таблица конфет ================= */

function CandiesTable({
  candies,
  onEdit,
  onDelete,
}: {
  candies: Candy[];
  onEdit: (c: Candy) => void;
  onDelete: (c: Candy) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candies;
    return candies.filter((c) =>
      `${c.name} ${c.sku ?? ""} ${c.manufacturer ?? ""}`.toLowerCase().includes(q)
    );
  }, [candies, search]);

  return (
    <div>
      <div className="mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию, артикулу, производителю"
          className="w-full max-w-sm rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <th className="p-3">Название</th>
              <th className="p-3">Производитель</th>
              <th className="p-3 text-right">Вес (г)</th>
              <th className="p-3">Используется</th>
              <th className="p-3 text-center">Опубл.</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[var(--color-muted)]">
                  {search ? "Ничего не найдено" : "Конфет пока нет — добавьте первую"}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-b border-[var(--color-border)] last:border-none">
                  <td className="p-3">
                    <span className="font-medium text-[var(--color-heading)]">{c.name}</span>
                    {c.sku && <span className="ml-2 text-xs text-[var(--color-muted)]">{c.sku}</span>}
                    {c.description && (
                      <div className="mt-0.5 max-w-md truncate text-xs text-[var(--color-muted)]">
                        {c.description}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-[var(--color-muted)]">{c.manufacturer ?? "—"}</td>
                  <td className="p-3 text-right">{c.weight_g ?? "—"}</td>
                  <td className="p-3 text-xs text-[var(--color-muted)]">{usageLabel(c)}</td>
                  <td className="p-3 text-center">
                    {c.is_published === 1 ? (
                      <span className="text-green-700">✓</span>
                    ) : (
                      <span className="text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => onEdit(c)} className="mr-3 text-xs text-[var(--color-primary)] hover:underline">
                      ред.
                    </button>
                    <button onClick={() => onDelete(c)} className="text-xs text-[var(--color-muted)] hover:text-red-600">
                      удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        Показано {filtered.length} из {candies.length}. Конфеты не видны клиентам — они входят в состав наборов и рецепты веса.
      </p>
    </div>
  );
}

/* ================= Модалка конфеты ================= */

function CandyModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Candy | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [weight, setWeight] = useState(initial?.weight_g?.toString() ?? "");
  const [price, setPrice] = useState(initial ? String(Math.round(initial.price_kopecks / 100)) : "0");
  const [published, setPublished] = useState(initial ? initial.is_published === 1 : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Укажите название"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || null,
        manufacturer: manufacturer.trim() || null,
        description: description.trim() || null,
        weight_g: weight === "" ? null : Number(weight),
        price_kopecks: (Number(price) || 0) * 100,
        is_published: published ? 1 : 0,
      };
      const url = initial ? `${apiUrl}/admin/candies/${initial.id}` : `${apiUrl}/admin/candies`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setError(json.error ?? "Не удалось сохранить"); return; }
      onSaved();
    } catch { setError("Ошибка сети"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-card)] bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-medium text-[var(--color-heading)]">
          {initial ? "Редактировать конфету" : "Новая конфета"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Название *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Артикул (SKU)</label>
              <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Производитель</label>
              <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}
                placeholder="Например, Конти" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Описание</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} placeholder="Состав, особенности…" className={inputCls} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Вес одной конфеты (г)</label>
              <input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)}
                placeholder="например, 12" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Цена (₽)</label>
              <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)}
              className="accent-[var(--color-primary)]" />
            Опубликована (доступна для рецептов и составов)
          </label>
          {initial && (
            <p className="text-xs text-[var(--color-muted)]">{usageLabel(initial)}</p>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-6 py-2 text-sm text-[var(--color-heading)] transition hover:border-[var(--color-primary)]">
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

/* ================= Модалка удаления конфеты ================= */

function DeleteCandyModal({
  candy,
  onClose,
  onDeleted,
}: {
  candy: Candy;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const used = candy.recipes_count > 0 || candy.bundles_count > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/candies/${candy.id}${force ? "?force=1" : ""}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setError(json.error ?? "Не удалось удалить"); return; }
      onDeleted();
    } catch { setError("Ошибка сети"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[var(--radius-card)] bg-white p-6 shadow-xl"
      >
        <h2 className="mb-2 text-lg font-medium text-[var(--color-heading)]">Удалить «{candy.name}»?</h2>
        {used ? (
          <>
            <p className="text-sm text-[var(--color-body)]">
              Конфета используется:
              {candy.recipes_count > 0 && <> в рецептах веса — <b>{candy.recipes_count}</b> зап.;</>}
              {candy.bundles_count > 0 && <> в составах наборов — <b>{candy.bundles_count}</b> шт.</>}
              {candy.sets_count > 0 && <> в кастомных наборах — <b>{candy.sets_count}</b> шт.</>}
            </p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              «Удалить везде» уберёт конфету и все её записи в рецептах и составах. В уже оплаченных заказах
              ничего не изменится, но составы наборов на витрине потеряют эту конфету.
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--color-body)]">
            Конфета нигде не используется. Действие необратимо.
          </p>
        )}
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={() => doDelete(used)}
            disabled={busy}
            className="rounded-[var(--radius-btn)] bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Удаляем…" : used ? "Удалить везде" : "Удалить"}
          </button>
          <button onClick={onClose} disabled={busy}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-5 py-2 text-sm text-[var(--color-heading)] transition hover:border-[var(--color-primary)] disabled:opacity-60">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= Список кастомных наборов ================= */

function SetsList({
  sets,
  onEdit,
  onDelete,
}: {
  sets: CandySet[];
  onEdit: (s: CandySet) => void;
  onDelete: (s: CandySet) => void;
}) {
  if (sets.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
        <p className="mb-1 font-medium text-[var(--color-heading)]">Кастомных наборов пока нет</p>
        <p className="mx-auto max-w-lg text-sm text-[var(--color-muted)]">
          Кастомный набор — это именованная подборка конфет: удобный внутренний справочник,
          чтобы быстро смотреть, из каких конфет состоит та или иная подборка.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {sets.map((s) => (
        <div key={s.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--color-heading)]">{s.name}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Конфет: {s.items.length}
                {s.items.length > 0 && (
                  <span className="ml-2">
                    ({s.items.slice(0, 5).map((i) => i.product_name).join(", ")}
                    {s.items.length > 5 && ` … ещё ${s.items.length - 5}`})
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 whitespace-nowrap">
              <button onClick={() => onEdit(s)} className="text-xs text-[var(--color-primary)] hover:underline">
                ред.
              </button>
              <button onClick={() => onDelete(s)} className="text-xs text-[var(--color-muted)] hover:text-red-600">
                удалить
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= Модалка набора ================= */

function SetModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: CandySet | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [items, setItems] = useState<{ product_id: number; quantity: number; product_name: string }[]>(
    initial ? initial.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, product_name: i.product_name })) : []
  );

  const [options, setOptions] = useState<CandyOption[] | null>(null);
  const [pickSearch, setPickSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (options) return;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/admin/candies/options`, { credentials: "include" });
        const json = (await res.json()) as { data?: CandyOption[] };
        setOptions(json.data ?? []);
      } catch { setOptions([]); }
    })();
  }, [options]);

  const pickFiltered = useMemo(() => {
    if (!options) return [];
    const chosen = new Set(items.map((i) => i.product_id));
    const q = pickSearch.trim().toLowerCase();
    return options
      .filter((o) => !chosen.has(o.id))
      .filter((o) => !q || `${o.name} ${o.sku ?? ""} ${o.manufacturer ?? ""}`.toLowerCase().includes(q))
      .slice(0, 60);
  }, [options, pickSearch, items]);

  function addOption(o: CandyOption) {
    setItems((list) => [...list, { product_id: o.id, quantity: 1, product_name: o.name }]);
  }

  function removeItem(pid: number) {
    setItems((list) => list.filter((i) => i.product_id !== pid));
  }

  function setQty(pid: number, qty: number) {
    setItems((list) => list.map((i) => (i.product_id === pid ? { ...i, quantity: Math.max(1, qty) } : i)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Укажите название набора"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      };
      const url = initial ? `${apiUrl}/admin/candy-sets/${initial.id}` : `${apiUrl}/admin/candy-sets`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setError(json.error ?? "Не удалось сохранить"); return; }
      onSaved();
    } catch { setError("Ошибка сети"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-card)] bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-medium text-[var(--color-heading)]">
          {initial ? "Редактировать набор" : "Новый кастомный набор"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Название набора *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Например: Шоколадные фавориты" className={inputCls} />
          </div>

          {/* Выбранные конфеты */}
          <div>
            <label className={labelCls}>Состав набора ({items.length})</label>
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
                Конфеты не выбраны — найдите их в списке ниже
              </p>
            ) : (
              <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
                {items.map((i) => (
                  <div key={i.product_id} className="flex items-center gap-3 p-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{i.product_name}</span>
                    <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                      шт.
                      <input
                        type="number"
                        min={1}
                        value={i.quantity}
                        onChange={(e) => setQty(i.product_id, Number(e.target.value) || 1)}
                        className="w-16 rounded border border-[var(--color-border)] px-2 py-1 text-right text-sm"
                      />
                    </label>
                    <button type="button" onClick={() => removeItem(i.product_id)}
                      className="text-xs text-[var(--color-muted)] hover:text-red-600">
                      убрать
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Пикер конфет */}
          <div>
            <label className={labelCls}>Добавить конфеты из справочника</label>
            <input
              type="search"
              value={pickSearch}
              onChange={(e) => setPickSearch(e.target.value)}
              placeholder="Поиск по названию, артикулу, производителю"
              className={inputCls}
            />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--color-border)]">
              {options === null ? (
                <p className="p-3 text-sm text-[var(--color-muted)]">Загружаем справочник…</p>
              ) : pickFiltered.length === 0 ? (
                <p className="p-3 text-sm text-[var(--color-muted)]">Ничего не найдено</p>
              ) : (
                pickFiltered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => addOption(o)}
                    className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2 text-left text-sm last:border-none hover:bg-[var(--color-bg-soft)]"
                  >
                    <span className="min-w-0 truncate">
                      {o.name}
                      {o.sku && <span className="ml-2 text-xs text-[var(--color-muted)]">{o.sku}</span>}
                      {o.manufacturer && <span className="ml-2 text-xs text-[var(--color-muted)]">{o.manufacturer}</span>}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-primary)]">+ добавить</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          <button type="button" onClick={onClose}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-6 py-2 text-sm text-[var(--color-heading)] transition hover:border-[var(--color-primary)]">
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

/* ================= Модалка удаления набора ================= */

function DeleteSetModal({
  set,
  onClose,
  onDeleted,
}: {
  set: CandySet;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/candy-sets/${set.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setError(json.error ?? "Не удалось удалить"); return; }
      onDeleted();
    } catch { setError("Ошибка сети"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[var(--radius-card)] bg-white p-6 shadow-xl"
      >
        <h2 className="mb-2 text-lg font-medium text-[var(--color-heading)]">Удалить набор «{set.name}»?</h2>
        <p className="text-sm text-[var(--color-body)]">
          Сами конфеты при этом не удаляются — только справочник набора.
        </p>
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <div className="mt-5 flex items-center gap-3">
          <button onClick={doDelete} disabled={busy}
            className="rounded-[var(--radius-btn)] bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60">
            {busy ? "Удаляем…" : "Удалить"}
          </button>
          <button onClick={onClose} disabled={busy}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-5 py-2 text-sm text-[var(--color-heading)] transition hover:border-[var(--color-primary)] disabled:opacity-60">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
