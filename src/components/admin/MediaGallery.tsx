"use client";

/* Медиа-галерея — выбор картинок/видео из файлов сайта.
 * Основа: раздел «media» файлового менеджера (GET /api/admin/files?path=media[/sub/dir]),
 * тот же бэкенд, что у проводника админки. Галерея для ВЫБОРА + ЗАГРУЗКИ:
 * свои файлы можно закачать прямо сюда (кнопка «Загрузить», летят в открытую
 * папку раздела media) — и тут же отметить и добавить к товару.
 * Клик по плитке — отметить/снять отметку; «Добавить выбранные» —
 * возвращает массив {url, kind} вызывающему коду (форма товара).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  STORAGE_ACCEPT,
  STORAGE_ACCEPT_IMAGES,
  STORAGE_ACCEPT_VIDEO,
  uploadToStorage,
} from "@/lib/file-storage";

export type GalleryKind = "image" | "video";

export interface GalleryPick {
  /** публичный адрес файла вида /uploads/... */
  url: string;
  kind: GalleryKind;
  name: string;
}

interface Entry {
  name: string;
  type?: "dir" | "file";
  size: number;
  mtime: number;
  ext?: string;
  public_url: string | null;
  /* только в режиме «Видео» (плоский рекурсивный список): */
  url?: string;
  folder?: string;
  path?: string;
}

interface FolderData {
  path: string;
  title: string;
  hint?: string;
  entries: Entry[];
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);

const ACCEPT_MAP = {
  all: STORAGE_ACCEPT,
  image: STORAGE_ACCEPT_IMAGES,
  video: STORAGE_ACCEPT_VIDEO,
} as const;

function extKind(name: string): GalleryKind | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** вызывается кнопкой «Добавить выбранные» */
  onPick: (picked: GalleryPick[]) => void;
  /** ограничить выбор типом: только картинки или только видео */
  accept?: "all" | "image" | "video";
  apiUrl?: string;
}

export function MediaGallery({ open, onClose, onPick, accept = "all", apiUrl = "/api" }: Props) {
  const [path, setPath] = useState("media");
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [upError, setUpError] = useState<string | null>(null);
  /* Заметки оптимизатора по загруженным файлам (webp/mp4) */
  const [upOpt, setUpOpt] = useState<string[]>([]);
  const [folder, setFolder] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GalleryPick[]>([]);
  const [filter, setFilter] = useState<"all" | "image" | "video">(accept);
  const [search, setSearch] = useState("");
  /* Режим «Видео»: плоский рекурсивный поиск по всем папкам /uploads
     (или по папке из настройки gallery_video_folder — задать можно прямо
     здесь, кнопка «Запомнить и искать» сохраняет её в настройках сайта). */
  const [videos, setVideos] = useState<Entry[] | null>(null);
  const [videoRoot, setVideoRoot] = useState("");   // текст в поле ввода
  const [videoFolder, setVideoFolder] = useState(""); // применённая папка
  const [savingFolder, setSavingFolder] = useState(false);

  const load = useCallback(
    async (p: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiUrl}/admin/files?path=${encodeURIComponent(p)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? `Ошибка ${res.status}`);
          return;
        }
        setFolder(json.data);
      } catch {
        setError("Ошибка сети");
      } finally {
        setLoading(false);
      }
    },
    [apiUrl],
  );

  /* Рекурсивный поиск всех видео. folder = null → сервер возьмёт
     сохранённую настройку gallery_video_folder (пусто = искать везде). */
  const loadVideos = useCallback(
    async (folder: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const qs = folder === null ? "" : `?folder=${encodeURIComponent(folder)}`;
        const res = await fetch(`${apiUrl}/admin/files/videos${qs}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? `Ошибка ${res.status}`);
          return;
        }
        setVideos(json.data.entries ?? []);
        setVideoFolder(json.data.folder ?? "");
        setVideoRoot(json.data.folder ?? "");
      } catch {
        setError("Ошибка сети");
      } finally {
        setLoading(false);
      }
    },
    [apiUrl],
  );

  /* Запомнить папку видео в настройках сайта и искать в ней */
  async function saveVideoFolder(folder: string) {
    setSavingFolder(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gallery_video_folder: folder.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      await loadVideos(folder.trim());
    } catch {
      setError("Ошибка сети");
    } finally {
      setSavingFolder(false);
    }
  }

  // при открытии: видео — рекурсивный поиск, остальное — с корня media
  useEffect(() => {
    if (open) {
      setPath("media");
      setSelected([]);
      setSearch("");
      setFilter(accept);
      setError(null);
      setVideos(null);
      if (accept === "video") {
        void loadVideos(null);
      } else {
        load("media");
      }
    }
  }, [open, accept, load, loadVideos]);

  const toggle = (pick: GalleryPick) => {
    setSelected((list) =>
      list.some((x) => x.url === pick.url) ? list.filter((x) => x.url !== pick.url) : [...list, pick],
    );
  };

  /* Загрузка своих файлов: в режиме видео — в папку видео (или корень media),
     в обычном — в открытую папку галереи */
  async function uploadFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    const inVideoMode = filter === "video";
    const target = inVideoMode ? (videoFolder ? `media/${videoFolder}` : "media") : path;
    setUpError(null);
    setUpOpt([]);
    setUpPct(0);
    const errors: string[] = [];
    const notes: string[] = [];
    for (const f of files) {
      try {
        const r = await uploadToStorage(f, target, (pct) => setUpPct(pct), apiUrl);
        if (r?.optimized) notes.push(r.optimized);
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : "ошибка"}`);
      }
    }
    setUpPct(null);
    if (errors.length) {
      setUpError(errors.join("; "));
    }
    if (notes.length) {
      setUpOpt(notes);
    }
    // обновить список (загруженное видно сразу)
    if (inVideoMode) {
      await loadVideos(videoFolder);
    } else {
      await load(path);
    }
  }

  const crumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    return [{ name: "Медиа", path: "media" }, ...parts.slice(1).map((p, i) => ({ name: p, path: parts.slice(0, i + 2).join("/") }))];
  }, [path]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    /* Режим «Видео»: плоский список всех найденных видео + поиск по имени/папке */
    if (filter === "video" && videos !== null) {
      return videos.filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          (e.folder ?? "").toLowerCase().includes(q),
      );
    }
    return (folder?.entries ?? []).filter((e) => {
      if (e.type === "dir") return !q || e.name.toLowerCase().includes(q);
      const kind = extKind(e.name);
      if (!kind) return false; // не медиа — не показываем
      if (filter !== "all" && kind !== filter) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [folder, filter, search, videos]);

  const dirs = filter === "video" ? [] : visible.filter((e) => e.type === "dir");
  const files = visible.filter((e) => e.type !== "dir" && (e.public_url ?? e.url));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
        {/* Шапка: заголовок, крошки, поиск, фильтр */}
        <div className="border-b border-[var(--color-border)] p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[var(--color-heading)]">
              Медиа-галерея
              <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                выберите картинки и видео
              </span>
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-heading)]"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filter === "video" ? (
              /* Режим «Видео»: рекурсивный поиск по всем папкам /uploads.
                 Поле «папка видео» сохраняется в настройках сайта — при
                 следующих открытиях галереи видео снова ищутся в ней. */
              <>
                <span className="text-sm text-[var(--color-muted)]">
                  Все видео сайта{videoFolder ? ` · папка «${videoFolder}»` : " · во всех папках"}
                  {!loading && videos !== null ? ` · найдено: ${videos.length}` : ""}
                </span>
                <input
                  value={videoRoot}
                  onChange={(e) => setVideoRoot(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveVideoFolder(videoRoot);
                  }}
                  placeholder="папка внутри /uploads (пусто = везде)"
                  className="w-56 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void saveVideoFolder(videoRoot)}
                  disabled={savingFolder}
                  title="Сохранить папку в настройках и показать видео из неё (пусто — искать везде)"
                  className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-body)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40"
                >
                  {savingFolder ? "Сохраняем…" : "Запомнить и искать"}
                </button>
              </>
            ) : (
              <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
                {crumbs.map((c, i) => (
                  <span key={c.path} className="flex items-center gap-1">
                    {i > 0 && <span className="text-[var(--color-muted)]">/</span>}
                    <button
                      type="button"
                      onClick={() => { setPath(c.path); load(c.path); }}
                      className={`max-w-[180px] truncate rounded px-1.5 py-0.5 hover:bg-[var(--color-bg-soft)] ${
                        i === crumbs.length - 1
                          ? "font-medium text-[var(--color-heading)]"
                          : "text-[var(--color-primary)] hover:underline"
                      }`}
                    >
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Загрузить свои файлы в открытую папку галереи */}
              <input
                ref={galleryInputRef}
                type="file"
                multiple
                accept={ACCEPT_MAP[accept]}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={upPct !== null}
                title={
                  filter === "video"
                    ? videoFolder
                      ? `Загрузить видео в «${videoFolder}»`
                      : "Загрузить файлы в раздел «media»"
                    : `Загрузить файлы в «${path}»`
                }
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-body)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-40"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 16V4M6.5 9.5 12 4l5.5 5.5" />
                  <path d="M4 20h16" />
                </svg>
                {upPct !== null ? `Загрузка… ${upPct}%` : "Загрузить"}
              </button>
              {accept === "all" && (
                <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)] text-xs">
                  {([["all", "Все"], ["image", "Картинки"], ["video", "Видео"]] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setFilter(k);
                        if (k === "video") void loadVideos(null); // сервер отдаст сохранённую папку
                      }}
                      className={`px-2.5 py-1.5 transition ${
                        filter === k
                          ? "bg-[var(--color-primary)] text-white"
                          : "bg-white text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={filter === "video" ? "Поиск по имени…" : "Поиск в папке…"}
                className="w-40 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm placeholder:text-xs focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Сетка файлов */}
        <div className="min-h-[240px] flex-1 overflow-y-auto p-4">
          {loading && <p className="py-10 text-center text-sm text-[var(--color-muted)]">Загружаем…</p>}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
              <button
                type="button"
                onClick={() => (filter === "video" ? void loadVideos(videoFolder) : void load(path))}
                className="ml-2 underline"
              >
                повторить
              </button>
            </div>
          )}
          {upOpt.length > 0 && (
            <div className="mb-3 flex items-start justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <span className="min-w-0 flex-1">✓ Сжато: {upOpt.join("; ")}</span>
              <button type="button" onClick={() => setUpOpt([])} className="ml-2 shrink-0 text-xs underline">закрыть</button>
            </div>
          )}
          {upError && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <span className="min-w-0 flex-1 truncate" title={upError}>{upError}</span>
              <button type="button" onClick={() => setUpError(null)} className="ml-2 shrink-0 text-xs underline">закрыть</button>
            </div>
          )}
          {!loading && !error && visible.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--color-muted)]">
              {filter === "video"
                ? videoFolder
                  ? `В папке «${videoFolder}» видео не найдено. Очистите поле папки, чтобы искать по всем папкам.`
                  : "Видео не найдены — загрузите их кнопкой «Загрузить» или переместите файлы в /uploads"
                : folder?.hint ?? "В этой папке нет картинок и видео"}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {dirs.map((d) => (
              <button
                key={d.name}
                type="button"
                onClick={() => { const next = `${path}/${d.name}`; setPath(next); load(next); }}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-2 text-center transition hover:border-[var(--color-primary)]"
              >
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-[var(--color-muted)]" fill="currentColor" aria-hidden>
                  <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                </svg>
                <span className="w-full truncate text-[11px] text-[var(--color-body)]">{d.name}</span>
              </button>
            ))}
            {files.map((f) => {
              const kind = extKind(f.name) ?? "image";
              const url = (f.public_url ?? f.url)!;
              const isSel = selected.some((x) => x.url === url);
              return (
                <button
                  key={f.path ?? f.name}
                  type="button"
                  onClick={() => toggle({ url, kind, name: f.name })}
                  title={`${f.name} — клик, чтобы ${isSel ? "снять выбор" : "выбрать"}`}
                  className={`group relative aspect-square overflow-hidden rounded-lg border-2 bg-[var(--color-bg-soft)] transition ${
                    isSel
                      ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                      : "border-transparent hover:border-[var(--color-border)]"
                  }`}
                >
                  {kind === "image" ? (
                    <Image
                      src={url}
                      alt={f.name}
                      fill
                      sizes="140px"
                      loading="lazy"
                      className="object-cover"
                    />
                  ) : (
                    <video
                      src={url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  )}
                  {kind === "video" && (
                    <span className="absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                      видео
                    </span>
                  )}
                  {isSel && (
                    <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-[11px] font-bold text-white">
                      ✓
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-[9px] text-white opacity-0 transition group-hover:opacity-100">
                    {filter === "video" && f.folder ? `${f.folder}/${f.name}` : f.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Подвал: выбор и кнопки */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] p-4">
          <p className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted)]">
            {selected.length > 0
              ? `Выбрано: ${selected.length} (${selected.map((s) => s.name).slice(0, 3).join(", ")}${selected.length > 3 ? "…" : ""})`
              : "Кликайте по плиткам, чтобы отметить файлы. Папки открываются кликом."}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => { onPick(selected); onClose(); }}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            Добавить выбранные{selected.length > 0 ? ` (${selected.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
