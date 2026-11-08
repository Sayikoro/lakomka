"use client";

/* ============================================================
   Вкладка «Галерея» раздела «Файлы» (Task 146).

   Галерея = папка картинок + шорткод [gallery слаг], которым она
   ставится в нужный блок сайта (сейчас — блок «конфеты от фабрик»
   на главной, шорткод живёт в Настройках). Здесь можно:
     - создать галерею (название → слаг, автотранслит);
     - загрузить картинки (мультизагрузка с прогрессом, оптимизатор
       на бэкенде сожмёт jpg/png в webp);
     - поменять порядок картинок (стрелки ← →);
     - удалить картинку или галерею целиком;
     - скопировать шорткод кнопкой.

   Хранилище то же, что у проводника (раздел galleries) — файлы,
   загруженные здесь, видны и в проводнике, и наоборот.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/admin/Feedback";
import { uploadToStorage } from "@/lib/file-storage";

interface GalleryInfo {
  slug: string;
  title: string;
  count: number;
  cover: string | null;
  size: number;
  mtime: number;
  shortcode: string;
}

interface GalleryItemInfo {
  name: string;
  url: string;
  size: number;
  mtime: number;
  pos: number;
}

const input =
  "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " МБ";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " КБ";
  return bytes + " Б";
}

/* Транслит для подсказки слага при создании галереи */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function suggestSlug(title: string): string {
  let out = "";
  for (const ch of title.toLowerCase()) {
    if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (/[a-z0-9-]/.test(ch)) out += ch;
    else out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export function GalleryManager() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const { confirm } = useConfirm();

  const [galleries, setGalleries] = useState<GalleryInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<GalleryItemInfo[]>([]);
  const [title, setTitle] = useState("");
  const [shortcode, setShortcode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* создание галереи */
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);

  /* загрузка картинок */
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/galleries`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Ошибка ${res.status}`);
      setGalleries(json.data?.galleries ?? []);
      return (json.data?.galleries ?? []) as GalleryInfo[];
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      return [];
    }
  }, [apiUrl]);

  const openGallery = useCallback(
    async (slug: string) => {
      setSelected(slug);
      setItems([]);
      setError(null);
      try {
        const res = await fetch(`${apiUrl}/admin/galleries/items?slug=${encodeURIComponent(slug)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Ошибка ${res.status}`);
        setItems(json.data?.items ?? []);
        setTitle(json.data?.title ?? slug);
        setShortcode(json.data?.shortcode ?? `[gallery ${slug}]`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сети");
      }
    },
    [apiUrl]
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const list = await loadList();
      setLoading(false);
      if (list.length > 0) void openGallery(list[0].slug);
    })();
  }, [loadList, openGallery]);

  async function createGallery() {
    setCreatingBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/galleries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: newTitle, slug: newSlug }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Ошибка ${res.status}`);
      setCreating(false);
      setNewTitle("");
      setNewSlug("");
      await loadList();
      void openGallery(json.data?.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setCreatingBusy(false);
    }
  }

  async function saveTitle() {
    if (!selected) return;
    try {
      const res = await fetch(`${apiUrl}/admin/galleries/title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug: selected, title }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Ошибка ${res.status}`);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!selected || !files || files.length === 0) return;
    setUploading(true);
    setUploadPct(0);
    setUploadNote(null);
    setError(null);
    try {
      const notes: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const r = await uploadToStorage(files[i], `galleries/${selected}`, (pct) =>
          setUploadPct(Math.round(((i + pct / 100) / files.length) * 100))
        );
        if (r.optimized) notes.push(r.optimized);
      }
      if (notes.length) setUploadNote(notes.join("; "));
      await openGallery(selected);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function moveItem(name: string, dir: "left" | "right") {
    if (!selected) return;
    try {
      const res = await fetch(`${apiUrl}/admin/galleries/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug: selected, name, dir }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Ошибка ${res.status}`);
      await openGallery(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    }
  }

  async function removeItem(name: string) {
    if (!selected) return;
    const ok = await confirm({
      title: `Удалить картинку «${name}» из галереи?`,
      message: "Действие необратимо.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`${apiUrl}/admin/galleries/item-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug: selected, name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Ошибка ${res.status}`);
      await openGallery(selected);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    }
  }

  async function deleteGallery() {
    if (!selected) return;
    const ok = await confirm({
      title: `Удалить галерею «${title}» целиком (${items.length} карт.)?`,
      message: `Шорткод [gallery ${selected}] перестанет показывать картинки. Действие необратимо.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`${apiUrl}/admin/galleries/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug: selected }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Ошибка ${res.status}`);
      setSelected(null);
      setItems([]);
      const list = await loadList();
      if (list.length > 0) void openGallery(list[0].slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    }
  }

  function copyShortcode() {
    navigator.clipboard?.writeText(shortcode).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => { /* clipboard недоступен — шорткод и так виден */ }
    );
  }

  return (
    <div data-testid="gallery-manager">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* ── Список галерей ── */}
        <div className="space-y-3">
          <button
            type="button"
            data-testid="gallery-create"
            onClick={() => setCreating(true)}
            className="w-full rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            + Создать галерею
          </button>

          {loading ? (
            <p className="text-sm text-[var(--color-muted)]">Загружаем…</p>
          ) : galleries.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Галерей пока нет. Создайте первую — например «Наши фабрики» — и поставьте её шорткод в нужный блок.
            </p>
          ) : (
            <ul className="space-y-2">
              {galleries.map((g) => (
                <li key={g.slug}>
                  <button
                    type="button"
                    data-testid={`gallery-card-${g.slug}`}
                    onClick={() => void openGallery(g.slug)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-card)] border p-2 text-left transition ${
                      selected === g.slug
                        ? "border-[var(--color-primary)] bg-[var(--color-bg)] shadow-sm"
                        : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]"
                    }`}
                  >
                    <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--color-bg-soft)]">
                      {g.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.cover} alt="" className="h-full w-full object-contain p-1" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-lg text-[var(--color-muted)]">🖼</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--color-heading)]">
                        {g.title}
                      </span>
                      <span className="block text-xs text-[var(--color-muted)]">
                        [gallery {g.slug}] · {g.count} шт.
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Содержимое выбранной галереи ── */}
        <div className="min-w-0">
          {!selected ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
              Выберите галерею слева или создайте новую.
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-6">
              {/* Заголовок + шорткод + действия */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => void saveTitle()}
                  data-testid="gallery-title"
                  className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-lg font-semibold text-[var(--color-heading)] hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
                  aria-label="Название галереи"
                />
                <button
                  type="button"
                  data-testid="gallery-copy"
                  onClick={copyShortcode}
                  title="Скопировать шорткод"
                  className="shrink-0 rounded-lg border border-[var(--color-primary)] px-3 py-1.5 font-mono text-sm text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white"
                >
                  {copied ? "Скопировано ✓" : shortcode}
                </button>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
                  {uploading ? `Загружаем… ${uploadPct}%` : "Загрузить картинки"}
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.gif,.avif"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void uploadFiles(e.target.files)}
                    data-testid="gallery-upload-input"
                  />
                </label>
                <button
                  type="button"
                  data-testid="gallery-delete"
                  onClick={() => void deleteGallery()}
                  className="rounded-[var(--radius-btn)] border border-red-200 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
                >
                  Удалить галерею
                </button>
                {uploading && (
                  <span className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--color-border)]">
                    <span
                      className="block h-full bg-[var(--color-primary)] transition-all"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </span>
                )}
                {uploadNote && (
                  <span className="text-xs text-[var(--color-muted)]">{uploadNote}</span>
                )}
              </div>

              {items.length === 0 ? (
                <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]" data-testid="gallery-empty">
                  Папка пуста — загрузите картинки кнопкой выше. Порядок можно менять стрелками, шорткод вставляется в любой блок.
                </div>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {items.map((it, i) => (
                    <li
                      key={it.name}
                      data-testid={`gallery-item-${i}`}
                      className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg)]"
                    >
                      <div className="relative aspect-square bg-[var(--color-bg-soft)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.url}
                          alt={it.name}
                          className="h-full w-full object-contain p-2"
                          loading="lazy"
                        />
                      </div>
                      <div className="space-y-1.5 p-2">
                        <p className="truncate text-xs font-medium text-[var(--color-heading)]" title={it.name}>
                          {it.name}
                        </p>
                        <p className="text-[11px] text-[var(--color-muted)]">{humanSize(it.size)}</p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void moveItem(it.name, "left")}
                            disabled={i === 0}
                            className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-xs disabled:opacity-30"
                            aria-label="Раньше"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => void moveItem(it.name, "right")}
                            disabled={i === items.length - 1}
                            className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-xs disabled:opacity-30"
                            aria-label="Позже"
                          >
                            →
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeItem(it.name)}
                            className="ml-auto rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                            aria-label="Удалить картинку"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Модалка создания галереи ── */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-card)] bg-[var(--color-card)] p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-[var(--color-heading)]">
              Новая галерея
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-heading)]">
                  Название
                </label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    setNewSlug(suggestSlug(e.target.value));
                  }}
                  placeholder="Наши фабрики"
                  className={input}
                  data-testid="gallery-new-title"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--color-heading)]">
                  Слаг (латиницей — входит в шорткод)
                </label>
                <input
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="fabriki"
                  className={`${input} font-mono`}
                  data-testid="gallery-new-slug"
                />
                {newSlug && (
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Шорткод: <span className="font-mono">[gallery {newSlug.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}]</span>
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                data-testid="gallery-create-submit"
                disabled={creatingBusy || !newTitle.trim() || !newSlug.trim()}
                onClick={() => void createGallery()}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {creatingBusy ? "Создаём…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
