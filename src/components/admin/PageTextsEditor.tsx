"use client";

/**
 * «Текст на страницах» — универсальный редактор текстов витрины.
 * Слева построчно все страницы (реестр PAGE_TEXTS), справа — все
 * текстовые поля выбранной страницы: заголовки, подписи, кнопки,
 * описания. Сохранённые значения лежат в settings (text_*); пустое
 * поле = дефолт из реестра. Подстановки {year}/{n}/{total} работают
 * автоматически.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { PAGE_TEXTS, TEXT_PREFIX } from "@/lib/page-texts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export function PageTextsEditor() {
  const [saved, setSaved] = useState<Record<string, string> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string>(PAGE_TEXTS[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef<Set<string>>(new Set());

  /* Загружаем сохранённые значения */
  useEffect(() => {
    let ok = true;
    setLoading(true);
    fetch(`${API_URL}/admin/page-texts`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!ok) return;
        const data = (j?.data ?? {}) as Record<string, string>;
        setSaved(data);
        setDrafts(data);
        dirtyRef.current = new Set();
      })
      .catch(() => ok && setError("Не удалось загрузить тексты"))
      .finally(() => ok && setLoading(false));
    return () => {
      ok = false;
    };
  }, []);

  const page = useMemo(
    () => PAGE_TEXTS.find((p) => p.id === activeId) ?? PAGE_TEXTS[0],
    [activeId]
  );

  function setDraft(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
    dirtyRef.current.add(key);
  }

  function resetField(key: string) {
    setDrafts((d) => ({ ...d, [key]: "" }));
    dirtyRef.current.add(key);
  }

  async function save() {
    setError(null);
    setSavedAt(null);
    setSaving(true);
    try {
      /* Шлём только изменённые поля (пустая строка = сброс на дефолт) */
      const payload: Record<string, string> = {};
      for (const key of dirtyRef.current) {
        payload[key] = drafts[key] ?? "";
      }
      if (Object.keys(payload).length === 0) {
        setSavedAt(new Date().toLocaleTimeString());
        return;
      }
      const res = await fetch(`${API_URL}/admin/page-texts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Не удалось сохранить");
        return;
      }
      setSaved((s) => ({ ...(s ?? {}), ...payload }));
      dirtyRef.current = new Set();
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const label = "mb-1 block text-sm font-medium text-[var(--color-heading)]";

  if (loading) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6 text-sm text-[var(--color-muted)]">
        Загружаем тексты…
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      {/* Слева — список всех страниц витрины */}
      <aside className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-3">
        <div className="px-2 pb-2 pt-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Страницы
        </div>
        <nav className="space-y-0.5">
          {PAGE_TEXTS.map((p) => {
            const count = p.texts.filter((t) => (drafts[t.key] ?? "") !== "").length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveId(p.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  p.id === page?.id
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
                }`}
              >
                <span className="truncate">{p.title}</span>
                {count > 0 && (
                  <span
                    className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
                      p.id === page?.id
                        ? "bg-white/25 text-white"
                        : "bg-[var(--color-bg-soft)] text-[var(--color-muted)]"
                    }`}
                    title="Сколько полей переопределено"
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <p className="mt-3 px-2 text-[11px] leading-relaxed text-[var(--color-muted)]">
          Пустое поле = текст по умолчанию. Изменённые поля помечаются
          бейджем с числом.
        </p>
      </aside>

      {/* Справа — поля выбранной страницы */}
      <div className="space-y-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-heading)]">
            {page?.title}
          </h2>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="text-sm text-green-700">✓ Сохранено в {savedAt}</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || dirtyRef.current.size === 0}
              className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {page?.texts.map((t) => {
            const value = drafts[t.key] ?? "";
            const def = t.def;
            const changed = (saved?.[t.key] ?? "") !== "" || dirtyRef.current.has(t.key);
            return (
              <div key={t.key} className={t.area ? "md:col-span-2" : ""}>
                <label className={label}>
                  {t.label}
                  {changed && (
                    <span className="ml-2 rounded-full bg-[var(--color-bg-soft)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-muted)]">
                      свой текст
                    </span>
                  )}
                </label>
                {t.area ? (
                  <textarea
                    value={value}
                    onChange={(e) => setDraft(t.key, e.target.value)}
                    rows={3}
                    placeholder={def}
                    className={input}
                  />
                ) : (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setDraft(t.key, e.target.value)}
                    placeholder={def}
                    className={input}
                  />
                )}
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                  <span>Пусто = «{def.length > 60 ? def.slice(0, 60) + "…" : def}»</span>
                  {changed && (
                    <button
                      type="button"
                      onClick={() => resetField(t.key)}
                      className="text-[var(--color-primary)] underline-offset-2 hover:underline"
                    >
                      вернуть по умолчанию
                    </button>
                  )}
                </p>
                {t.hint && (
                  <p className="mt-0.5 text-xs text-[var(--color-muted)] italic">{t.hint}</p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs leading-relaxed text-[var(--color-muted)]">
          Подстановки: <code>{"{year}"}</code> — текущий год,{" "}
          <code>{"{n}"}</code> / <code>{"{total}"}</code> — числа в счётчике
          каталога. Ключи хранения: <code>{TEXT_PREFIX}…</code> (для переноса
          между проектами достаточно скопировать эти строки).
        </p>
      </div>
    </div>
  );
}
