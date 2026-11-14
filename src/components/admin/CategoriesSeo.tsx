"use client";

/* ============================================================
   Task 141: SEO категорий — редактор в админке (страница «Товары»).

   Для каждой категории: meta_title, meta_description (для тегов
   <title>/<meta description> страницы /catalog/<slug>) и seo_text
   (видимый текст над сеткой товаров). Пустые поля = автогенерация
   из названия категории. Сохранение — по кнопке «Сохранить» под
   каждой категорией; операции пишутся в журнал действий.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";

interface AdminCategory {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
  meta_title: string;
  meta_description: string;
  seo_text: string;
}

export function CategoriesSeo() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Pick<AdminCategory, "meta_title" | "meta_description" | "seo_text">>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/categories`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        setCats([]);
        return;
      }
      const list = (json.data as AdminCategory[]) ?? [];
      setCats(list);
      setDrafts(
        Object.fromEntries(
          list.map((c) => [
            c.id,
            { meta_title: c.meta_title ?? "", meta_description: c.meta_description ?? "", seo_text: c.seo_text ?? "" },
          ]),
        ),
      );
    } catch {
      setError("Ошибка сети");
      setCats([]);
    }
  }, [apiUrl]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const setDraft = (id: number, patch: Partial<{ meta_title: string; meta_description: string; seo_text: string }>) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };

  const save = async (c: AdminCategory) => {
    const draft = drafts[c.id];
    if (!draft) return;
    setSavingId(c.id);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/categories/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      setSavedId(c.id);
      window.setTimeout(() => setSavedId((cur) => (cur === c.id ? null : cur)), 1800);
    } catch {
      setError("Ошибка сети");
    } finally {
      setSavingId(null);
    }
  };

  const input =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          SEO категорий
        </h2>
        <span className="text-xs text-[var(--color-muted)]">
          страницы /catalog/&lt;категория&gt; — мета-теги и текст
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Заполните заголовок, описание и текст — они попадут на страницу категории.
        Пустые поля заполняются автоматически из названия.
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {cats === null ? (
        <div className="mt-4 text-center text-sm text-[var(--color-muted)]">Загрузка…</div>
      ) : (
        <div className="mt-4 space-y-2" data-testid="categories-seo-list">
          {cats.map((c) => {
            const draft = drafts[c.id] ?? { meta_title: "", meta_description: "", seo_text: "" };
            const isOpen = openId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-lg border border-[var(--color-border)]"
                data-testid={`categories-seo-item-${c.slug}`}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : c.id)}
                  aria-expanded={isOpen}
                  data-testid={`categories-seo-toggle-${c.slug}`}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium text-[var(--color-heading)]">
                    {c.name}
                    <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                      /catalog/{c.slug}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {savedId === c.id && (
                      <span className="text-xs font-medium text-[#2e9e5b]">Сохранено ✓</span>
                    )}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className={`text-[var(--color-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-[var(--color-border)] p-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-heading)]">
                        Meta title (до 200 символов)
                      </label>
                      <input
                        type="text"
                        value={draft.meta_title}
                        maxLength={200}
                        onChange={(e) => setDraft(c.id, { meta_title: e.target.value })}
                        placeholder={`Авто: «${c.name} — каталог подарков»`}
                        className={input}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-heading)]">
                        Meta description (до 300 символов)
                      </label>
                      <textarea
                        value={draft.meta_description}
                        maxLength={300}
                        rows={2}
                        onChange={(e) => setDraft(c.id, { meta_description: e.target.value })}
                        placeholder="Авто: подарки категории с доставкой по Хабаровску…"
                        className={input}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-heading)]">
                        Текст на странице категории (до 5000 символов)
                      </label>
                      <textarea
                        value={draft.seo_text}
                        maxLength={5000}
                        rows={4}
                        onChange={(e) => setDraft(c.id, { seo_text: e.target.value })}
                        placeholder="Например: какие подарки входят в категорию, чем они хороши, условия доставки…"
                        className={input}
                      />
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        Пусто — блока текста на странице не будет.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void save(c)}
                      disabled={savingId === c.id}
                      data-testid={`categories-seo-save-${c.slug}`}
                      className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                    >
                      {savingId === c.id ? "Сохраняем…" : "Сохранить"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
