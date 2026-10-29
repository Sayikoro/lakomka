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
  product_image_url: string | null;
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
    images?: { copied: number; missing_files: string[] };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [coverFor, setCoverFor] = useState<WeightRecipeRow | null>(null);

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
      const json = (await res.json()) as { data: WeightRecipeRow[] };
      setRows(json.data ?? []);
    } catch { setError("Ошибка сети"); }
    finally { setLoading(false); }
  }

  if (selected !== null && rows.length === 0 && !loading && !error) {
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
          {weights.map((w) => (
            <button
              key={w.weight_g}
              type="button"
              onClick={() => load(w.weight_g)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                selected === w.weight_g
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]"
              }`}
            >
              <span className="font-medium">{w.weight_g} г</span>
              <span className={`text-xs ${selected === w.weight_g ? "text-white/80" : "text-[var(--color-muted)]"}`}>
                {w.items_count} поз.
              </span>
            </button>
          ))}
        </aside>

        <section>
          {selected !== null && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--color-heading)]">
                  Рецепт {selected} г
                  {rows.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                      ({rows.length} поз., {rows.reduce((s, r) => s + r.quantity, 0)} шт.)
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
                    onClick={openPicker}
                    className="whitespace-nowrap rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
                  >
                    + Конфета
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-[var(--color-muted)]">Загружаем…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  {rows.length === 0 ? "В рецепте нет позиций." : "Ничего не найдено."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                        <th className="p-3 w-20"></th>
                        <th className="p-3">Конфета</th>
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
          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-6 shadow-xl">
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
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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