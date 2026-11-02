"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { uploadFileInChunks } from "@/lib/chunked-upload";

export interface WeightSummary {
  weight_g: number;
  items_count: number;
  total_qty: number;
}

export interface WeightRecipeRow {
  weight_g: number;
  quantity: number;
  product_id: number;
  product_name: string;
  product_manufacturer: string | null;
  product_sku: string | null;
  /** Вес конфеты (г) — для товаров без веса показываем редактор (Task 114) */
  product_weight_g?: number | null;
  product_image_url: string | null;
}

/* Task 114: «своя позиция» — состав без карточки товара (упаковка, открытка…) */
export interface CustomItem {
  id: number;
  weight_g: number;
  name: string;
  quantity: number;
}

interface Component {
  id: number;
  name: string;
  sku: string | null;
}

interface Props {
  initialWeights: WeightSummary[];
}

export function WeightRecipesViewer({ initialWeights }: Props) {
  const router = useRouter();
  const [weights, setWeights] = useState<WeightSummary[]>(initialWeights);
  const [selected, setSelected] = useState<number | null>(
    initialWeights[0]?.weight_g ?? null
  );
  const [rows, setRows] = useState<WeightRecipeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [savingQty, setSavingQty] = useState<number | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [allComponents, setAllComponents] = useState<Component[] | null>(null);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [pickedQty, setPickedQty] = useState(1);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importResult, setImportResult] = useState<{
    resolved: number;
    total_entries: number;
    missing: string[];
    weights: number[];
    rows_processed?: number;
    manufacturers_filled?: number;
    images?: { copied: number; missing_files: string[] };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [coverFor, setCoverFor] = useState<WeightRecipeRow | null>(null);

  /* Task 114: свои граммовки и свои позиции */
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [newWeightOpen, setNewWeightOpen] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newWeightErr, setNewWeightErr] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const [customErr, setCustomErr] = useState<string | null>(null);
  const [savingWeight, setSavingWeight] = useState<number | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  async function load(weight: number) {
    setSelected(weight);
    setLoading(true);
    setError(null);
    setSearch("");
    try {
      const res = await fetch(`${apiUrl}/admin/weight-recipes/${weight}`, {
        credentials: "include",
      });
      if (!res.ok) { setError("Не удалось загрузить рецепт"); return; }
      const json = (await res.json()) as { data: WeightRecipeRow[]; custom?: CustomItem[] };
      setRows(json.data ?? []);
      setCustomItems(json.custom ?? []);
    } catch { setError("Ошибка сети"); }
    finally { setLoading(false); }
  }

  if (selected !== null && rows.length === 0 && customItems.length === 0 && !loading && !error) {
    load(selected);
  }

  async function saveQty(row: WeightRecipeRow, qty: number) {
    if (qty <= 0) return;
    setSavingQty(row.product_id);
    try {
      await fetch(`${apiUrl}/admin/weight-recipes/${row.weight_g}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ product_id: row.product_id, quantity: qty }),
      });
      setRows((list) =>
        list.map((r) => r.product_id === row.product_id ? { ...r, quantity: qty } : r)
      );
      refreshWeightsMeta();
    } catch { setError("Ошибка сохранения"); }
    finally { setSavingQty(null); }
  }

  async function removeRow(row: WeightRecipeRow) {
    if (!confirm(`Удалить «${row.product_name}» из рецепта ${row.weight_g} г?`)) return;
    try {
      await fetch(`${apiUrl}/admin/weight-recipes/${row.weight_g}/${row.product_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setRows((list) => list.filter((r) => r.product_id !== row.product_id));
      refreshWeightsMeta();
    } catch { setError("Ошибка удаления"); }
  }

  /* ── Task 114: свои граммовки ── */
  async function createWeightGroup() {
    const w = parseInt(newWeight, 10);
    if (!Number.isFinite(w) || w <= 0) { setNewWeightErr("Введите вес в граммах (целое число)"); return; }
    if (weights.some((x) => x.weight_g === w)) {
      setNewWeightErr(`Граммовка ${w} г уже есть`);
      return;
    }
    setNewWeightErr(null);
    try {
      const res = await fetch(`${apiUrl}/admin/weight-recipes/weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ weight_g: w }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setNewWeightErr(json.error ?? "Не удалось создать"); return; }
      setNewWeightOpen(false);
      setNewWeight("");
      setRows([]);
      setCustomItems([]);
      setSelected(w);
      await refreshWeightsMeta();
    } catch { setNewWeightErr("Ошибка сети"); }
  }

  async function deleteWeightGroup() {
    if (selected === null) return;
    if (!confirm(`Удалить граммовку ${selected} г целиком — конфеты, свои позиции, всё?`)) return;
    try {
      const res = await fetch(`${apiUrl}/admin/weight-recipes/${selected}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) {
        setRows([]);
        setCustomItems([]);
        setSelected(null);
        await refreshWeightsMeta();
      }
    } catch { setError("Ошибка удаления"); }
  }

  /* ── Task 114: свои позиции ── */
  async function addCustomItem() {
    if (selected === null) return;
    const name = customName.trim();
    if (name === "") { setCustomErr("Введите название"); return; }
    if (customQty <= 0) { setCustomErr("Количество — больше 0"); return; }
    setCustomErr(null);
    try {
      const res = await fetch(`${apiUrl}/admin/weight-recipes/${selected}/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, quantity: customQty }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setCustomErr(json.error ?? "Не удалось добавить"); return; }
      setCustomOpen(false);
      setCustomName("");
      setCustomQty(1);
      await load(selected);
      refreshWeightsMeta();
    } catch { setCustomErr("Ошибка сети"); }
  }

  async function saveCustomQty(item: CustomItem, qty: number) {
    if (qty <= 0) return;
    try {
      await fetch(`${apiUrl}/admin/weight-recipes/${item.weight_g}/custom/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quantity: qty }),
      });
      setCustomItems((list) => list.map((x) => x.id === item.id ? { ...x, quantity: qty } : x));
      refreshWeightsMeta();
    } catch { setError("Ошибка сохранения"); }
  }

  async function renameCustomItem(item: CustomItem, name: string) {
    const trimmed = name.trim();
    if (trimmed === "" || trimmed === item.name) return;
    try {
      await fetch(`${apiUrl}/admin/weight-recipes/${item.weight_g}/custom/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      setCustomItems((list) => list.map((x) => x.id === item.id ? { ...x, name: trimmed } : x));
    } catch { setError("Ошибка сохранения"); }
  }

  async function removeCustomItem(item: CustomItem) {
    if (!confirm(`Удалить «${item.name}» из рецепта ${item.weight_g} г?`)) return;
    try {
      await fetch(`${apiUrl}/admin/weight-recipes/${item.weight_g}/custom/${item.id}`, {
        method: "DELETE", credentials: "include",
      });
      setCustomItems((list) => list.filter((x) => x.id !== item.id));
      refreshWeightsMeta();
    } catch { setError("Ошибка удаления"); }
  }

  /* ── Task 114: вес конфеты прямо из таблицы ── */
  async function saveProductWeight(row: WeightRecipeRow, raw: string) {
    const v = raw.trim();
    const current = row.product_weight_g ?? null;
    if (v === "") {
      if (current === null) return;
    } else {
      const w = parseInt(v, 10);
      if (!Number.isFinite(w) || w <= 0 || w === current) return;
    }
    setSavingWeight(row.product_id);
    try {
      const res = await fetch(`${apiUrl}/admin/weight-recipes/product-weight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ product_id: row.product_id, weight_g: v === "" ? null : parseInt(v, 10) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "Не удалось сохранить вес"); return; }
      setRows((list) =>
        list.map((x) => x.product_id === row.product_id ? { ...x, product_weight_g: json.data?.weight_g ?? null } : x)
      );
    } catch { setError("Ошибка сети"); }
    finally { setSavingWeight(null); }
  }

  async function refreshWeightsMeta() {
    try {
      const res = await fetch(`${apiUrl}/admin/weight-recipes`, { credentials: "include" });
      if (res.ok) {
        const json = (await res.json()) as { data: WeightSummary[] };
        setWeights(json.data ?? []);
      }
    } catch {}
  }

  async function openPicker() {
    setPickerOpen(true);
    setPickerSearch("");
    setPickedId(null);
    setPickedQty(1);
    setPickerError(null);
    if (allComponents) return;
    setLoadingComponents(true);
    try {
      const res = await fetch(`${apiUrl}/admin/products?filter=recipe`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = (await res.json()) as { data: Component[] };
        setAllComponents(json.data ?? []);
      }
    } finally { setLoadingComponents(false); }
  }

  async function addComponent() {
    if (!pickedId || selected === null) { setPickerError("Выберите конфету"); return; }
    setPickerError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/weight-recipes/${selected}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ product_id: pickedId, quantity: pickedQty }),
      });
      if (!res.ok) {
        const json = await res.json();
        setPickerError(json.error ?? "Не удалось добавить");
        return;
      }
      setPickerOpen(false);
      await load(selected);
      refreshWeightsMeta();
    } catch { setPickerError("Ошибка сети"); }
  }

  const pickerFiltered = (allComponents ?? []).filter((c) => {
    if (!selected) return false;
    if (rows.some((r) => r.product_id === c.id)) return false;
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return true;
    return `${c.name} ${c.sku ?? ""}`.toLowerCase().includes(q);
  });

  /* ---- Импорт CSV или ZIP ---- */
  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const lower = file.name.toLowerCase();
    setImporting(true);
    setImportPct(0);
    setError(null);
    setImportResult(null);
    try {
      if (lower.endsWith(".zip")) {
        // ZIP → chunked upload → import-zip
        const { filePath } = await uploadFileInChunks(file, setImportPct);
        setImportPct(100);
        const res = await fetch(`${apiUrl}/admin/weight-recipes/import-zip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ file_path: filePath }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Не удалось обработать ZIP");
          return;
        }
        setImportResult(json.data);
      } else if (lower.endsWith(".csv")) {
        // CSV → обычный multipart
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${apiUrl}/admin/weight-recipes/import-csv`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Не удалось обработать CSV");
          return;
        }
        setImportResult(json.data);
      } else {
        setError("Поддерживаются только .csv и .zip");
        return;
      }

      await refreshWeightsMeta();
      if (selected !== null) await load(selected);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${r.product_name} ${r.product_manufacturer ?? ""} ${r.product_sku ?? ""}`
      .toLowerCase()
      .includes(q);
  });

  return (
    <div>
      {/* Верхняя панель */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-muted)]">
          Всего граммовок: <b>{weights.length}</b>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setNewWeightOpen(true); setNewWeightErr(null); }}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-heading)] hover:border-[var(--color-primary)]"
          >
            + Своя граммовка
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-60"
          >
            {importing
              ? `Загружаем… ${importPct > 0 && importPct < 100 ? importPct + "%" : ""}`
              : "📥 Загрузить CSV или ZIP"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.zip,text/csv,application/zip"
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
        </div>
      </div>

      {importing && importPct > 0 && importPct < 100 && (
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-soft)]">
          <div
            className="h-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${importPct}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-xs underline">закрыть</button>
        </div>
      )}

      {importResult && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="mb-2 font-semibold text-green-800">✓ Импорт завершён</p>
          <p className="text-green-800">
            Строк: <b>{importResult.rows_processed ?? "—"}</b>, найдено: <b>{importResult.resolved}</b>, записей: <b>{importResult.total_entries}</b>, граммовок: <b>{importResult.weights.length}</b>
            {importResult.images && (
              <>, картинок скопировано: <b>{importResult.images.copied}</b></>
            )}
            {!!importResult.manufacturers_filled && (
              /* Task 117: импорт теперь заполняет производителя из CSV
                 у конфет, где он был пуст */
              <>, заполнено производителей: <b>{importResult.manufacturers_filled}</b></>
            )}
          </p>
          {importResult.images?.missing_files && importResult.images.missing_files.length > 0 && (
            <p className="mt-2 text-amber-700">
              Не найдены в images/: {importResult.images.missing_files.join(", ")}
            </p>
          )}
          {importResult.missing.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-700">
                Конфет не найдено в БД: {importResult.missing.length} позиций
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto pl-4 text-xs text-amber-800">
                {importResult.missing.map((m, i) => (<li key={i}>• {m}</li>))}
              </ul>
            </details>
          )}
          <button onClick={() => setImportResult(null)} className="mt-2 text-xs text-green-800 underline">
            скрыть
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          <h2 className="mb-2 text-sm font-medium text-[var(--color-heading)]">Граммовки</h2>
          {weights.length === 0 && (
            <p className="text-xs text-[var(--color-muted)]">
              Граммовок ещё нет — импортируйте CSV или создайте свою.
            </p>
          )}
          {weights.map((w) => (
            <button
              key={w.weight_g}
              type="button"
              onClick={() => load(w.weight_g)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                selected === w.weight_g
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]"
              }`}
            >
              <span className="font-medium">{w.weight_g} г</span>
              <span className={`text-xs ${selected === w.weight_g ? "text-white/80" : "text-[var(--color-muted)]"}`}>
                {w.items_count} поз.
              </span>
            </button>
          ))}
          {selected !== null && (
            <button
              type="button"
              onClick={deleteWeightGroup}
              className="mt-3 w-full rounded-lg border border-red-200 px-3 py-2 text-left text-xs text-red-600 transition hover:bg-red-50"
            >
              Удалить граммовку {selected} г целиком
            </button>
          )}
        </aside>

        <section>
          {selected !== null && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">
                  Рецепт {selected} г
                  {rows.length + customItems.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                      ({rows.length + customItems.length} поз., {rows.reduce((s, r) => s + r.quantity, 0) + customItems.reduce((s, r) => s + r.quantity, 0)} шт.)
                    </span>
                  )}
                </h2>
                <div className="flex gap-2">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по названию"
                    className="w-full max-w-xs rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => { setCustomOpen(true); setCustomErr(null); }}
                    className="whitespace-nowrap rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-heading)] hover:border-[var(--color-primary)]"
                  >
                    + Своя позиция
                  </button>
                  <button
                    type="button"
                    onClick={openPicker}
                    className="whitespace-nowrap rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
                  >
                    + Конфета
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-[var(--color-muted)]">Загружаем…</p>
              ) : filtered.length === 0 && customItems.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  {rows.length === 0 ? "В рецепте нет позиций." : "Ничего не найдено."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                        <th className="p-3 w-20"></th>
                        <th className="p-3">Конфета</th>
                        <th className="p-3 w-28">Вес, г</th>
                        <th className="p-3">Производитель</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 text-center w-24">Кол-во</th>
                        <th className="p-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr
                          key={r.product_id}
                          className={`border-b border-[var(--color-border)] last:border-none ${
                            savingQty === r.product_id ? "opacity-50" : ""
                          }`}
                        >
                          <td className="p-3">
                            <div className="group relative h-12 w-12 overflow-hidden rounded-md bg-[var(--color-bg-soft)]">
                              {r.product_image_url ? (
                                <Image
                                  src={r.product_image_url}
                                  alt={r.product_name}
                                  fill
                                  sizes="48px"
                                  className="object-contain p-1"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--color-muted)]">
                                  нет
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setCoverFor(r)}
                                title="Сменить картинку"
                                className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg text-white opacity-0 transition group-hover:opacity-100"
                              >
                                📷
                              </button>
                            </div>
                          </td>
                          <td className="p-3 font-medium">{r.product_name}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              min={0}
                              defaultValue={r.product_weight_g ?? ""}
                              key={`${r.product_id}-${r.product_weight_g ?? "none"}`}
                              placeholder="—"
                              title="Вес одной конфеты; для товаров без веса заполните здесь"
                              onBlur={(e) => saveProductWeight(r, e.target.value)}
                              disabled={savingWeight === r.product_id}
                              className={`w-20 rounded border px-2 py-1 text-center text-sm ${
                                (r.product_weight_g ?? 0) <= 0
                                  ? "border-amber-300 bg-amber-50"
                                  : "border-[var(--color-border)]"
                              }`}
                            />
                          </td>
                          <td className="p-3 text-[var(--color-muted)]">{r.product_manufacturer || "—"}</td>
                          <td className="p-3 text-[var(--color-muted)]">{r.product_sku || "—"}</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min={1}
                              value={r.quantity}
                              onChange={(e) => {
                                const v = Number(e.target.value) || 0;
                                setRows((list) =>
                                  list.map((x) => x.product_id === r.product_id ? { ...x, quantity: v } : x)
                                );
                              }}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v > 0 && v !== r.quantity) saveQty(r, v);
                                if (v <= 0) saveQty(r, 1);
                              }}
                              className="w-16 rounded border border-[var(--color-border)] px-2 py-1 text-center text-sm"
                            />
                          </td>
                          <td className="p-3 text-right">
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
                      {customItems
                        .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
                        .map((c) => (
                        <tr key={`custom-${c.id}`} className="border-b border-[var(--color-border)] last:border-none bg-[var(--color-bg-soft)]/50">
                          <td className="p-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-lg" title="Своя позиция — без карточки товара">
                              ✨
                            </div>
                          </td>
                          <td className="p-3 font-medium">
                            <input
                              type="text"
                              defaultValue={c.name}
                              key={`n-${c.id}-${c.name}`}
                              onBlur={(e) => renameCustomItem(c, e.target.value)}
                              className="w-full max-w-xs rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
                            />
                            <span className="ml-1 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">своя</span>
                          </td>
                          <td className="p-3 text-xs text-[var(--color-muted)]">—</td>
                          <td className="p-3 text-xs italic text-[var(--color-muted)]">без карточки</td>
                          <td className="p-3 text-xs text-[var(--color-muted)]">—</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min={1}
                              value={c.quantity}
                              onChange={(e) => {
                                const v = Number(e.target.value) || 0;
                                setCustomItems((list) => list.map((x) => x.id === c.id ? { ...x, quantity: v } : x));
                              }}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v > 0 && v !== c.quantity) saveCustomQty(c, v);
                                if (v <= 0) saveCustomQty(c, 1);
                              }}
                              className="w-16 rounded border border-[var(--color-border)] px-2 py-1 text-center text-sm"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeCustomItem(c)}
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
            </>
          )}
        </section>
      </div>

      {/* Модалка добавления конфеты */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPickerOpen(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-[var(--color-card)] p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              Добавить конфету в {selected} г
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
            ) : pickerFiltered.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Ничего не найдено.</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--color-border)]">
                {pickerFiltered.map((c) => (
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
                ))}
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
            {pickerError && <p className="mt-2 text-xs text-red-600">{pickerError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPickerOpen(false)}
                className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm">
                Отмена
              </button>
              <button type="button" disabled={!pickedId} onClick={addComponent}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm text-white disabled:opacity-50">
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task 114: модалка «своя граммовка» */}
      {newWeightOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setNewWeightOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-[var(--color-card)] p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              Своя граммовка
            </h3>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Создайте любую ступень веса (например 750 г), затем добавьте в неё конфеты и свои позиции.
            </p>
            <input
              type="number"
              min={1}
              autoFocus
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createWeightGroup()}
              placeholder="Вес в граммах, напр. 750"
              className="mb-2 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            {newWeightErr && <p className="mb-2 text-xs text-red-600">{newWeightErr}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setNewWeightOpen(false)}
                className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm">
                Отмена
              </button>
              <button type="button" onClick={createWeightGroup}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm text-white">
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task 114: модалка «своя позиция» */}
      {customOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCustomOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-[var(--color-card)] p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              Своя позиция в {selected} г
            </h3>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Для состава, которого нет среди товаров: упаковка, открытка, бант…
              Позиция живёт только в рецепте (в автосборку набора не попадает).
            </p>
            <input
              type="text"
              autoFocus
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Название, напр. Открытка"
              className="mb-2 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            <label className="flex items-center gap-2 text-sm">
              Кол-во:
              <input
                type="number"
                min={1}
                value={customQty}
                onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
              />
            </label>
            {customErr && <p className="mt-2 text-xs text-red-600">{customErr}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCustomOpen(false)}
                className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm">
                Отмена
              </button>
              <button type="button" onClick={addCustomItem}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm text-white">
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка смены обложки */}
      {coverFor && (
        <CoverModal
          row={coverFor}
          apiUrl={apiUrl}
          onClose={() => setCoverFor(null)}
          onUploaded={() => {
            setCoverFor(null);
            if (selected !== null) load(selected);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Модалка смены обложки ---------- */
function CoverModal({
  row,
  apiUrl,
  onClose,
  onUploaded,
}: {
  row: WeightRecipeRow;
  apiUrl: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", files[0]);
      const res = await fetch(`${apiUrl}/admin/products/${row.product_id}/cover`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Не удалось загрузить");
        return;
      }
      onUploaded();
    } catch {
      setError("Ошибка сети");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--color-card)] p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-semibold text-[var(--color-heading)]">
          Сменить картинку
        </h3>
        <p className="mb-4 text-sm text-[var(--color-muted)]">{row.product_name}</p>

        {row.product_image_url && (
          <div className="relative mb-4 aspect-square overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-soft)]">
            <Image
              src={row.product_image_url}
              alt={row.product_name}
              fill
              sizes="400px"
              className="object-contain p-4"
            />
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => handleFile(e.target.files)}
          disabled={uploading}
          className="block w-full text-sm file:mr-3 file:rounded-[var(--radius-btn)] file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />

        {uploading && <p className="mt-3 text-sm text-[var(--color-muted)]">Загружаем…</p>}
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}