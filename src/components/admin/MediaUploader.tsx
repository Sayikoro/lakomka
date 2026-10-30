"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { MediaGallery, type GalleryPick } from "@/components/admin/MediaGallery";

export interface MediaItem {
  id: number;
  type: "image" | "video";
  url: string;
  alt: string | null;
  sort_order: number;
}

interface Props {
  productId: number;
  initial: MediaItem[];
}

function classifyVideo(url: string): "local" | "youtube" | "vk" | "rutube" | "unknown" {
  if (url.startsWith("/uploads/")) return "local";
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return "local";
  if (/youtu\.be|youtube\.com/i.test(url)) return "youtube";
  if (/vk\.com\/video|vkvideo\.ru/i.test(url)) return "vk";
  if (/rutube\.ru/i.test(url)) return "rutube";
  return "unknown";
}

export function MediaUploader({ productId, initial }: Props) {
  const [items, setItems] = useState<MediaItem[]>(
    [...initial].sort((a, b) => a.sort_order - b.sort_order)
  );
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingVid, setUploadingVid] = useState(false);
  const [vidPct, setVidPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function reindex(list: MediaItem[]): MediaItem[] {
    return list.map((it, i) => ({ ...it, sort_order: i }));
  }

  async function persistOrder(list: MediaItem[]) {
    try {
      await fetch(`${apiUrl}/admin/products/${productId}/media/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: list.map((i) => i.id) }),
      });
    } catch {
      setError("Не удалось сохранить порядок");
    }
  }

  /* ============ ЗАГРУЗКА КАРТИНОК ============ */
  async function handleImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploadingImg(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${apiUrl}/admin/products/${productId}/media/image`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Не удалось загрузить картинку");
          continue;
        }
        setItems((list) => reindex([...list, json.data]));
      }
    } finally {
      setUploadingImg(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  }

  /* ============ ЗАГРУЗКА ВИДЕО-ФАЙЛА ============ */
  async function uploadVideoFile(file: File) {
    setError(null);
    setUploadingVid(true);
    setVidPct(0);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await new Promise<{ ok: boolean; status: number; body: any }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${apiUrl}/admin/products/${productId}/media/video-upload`);
          xhr.withCredentials = true;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setVidPct(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            let body: any = null;
            try { body = JSON.parse(xhr.responseText); } catch {}
            resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
          };
          xhr.onerror = () => reject(new Error("network"));
          xhr.send(fd);
        }
      );

      if (!res.ok) {
        setError(res.body?.error ?? `Ошибка загрузки (${res.status})`);
        return;
      }
      setItems((list) => reindex([...list, res.body.data]));
    } catch {
      setError("Ошибка сети при загрузке видео");
    } finally {
      setUploadingVid(false);
      if (vidInputRef.current) vidInputRef.current.value = "";
    }
  }

  /* ============ ВИДЕО ПО URL ============ */
  async function addVideoUrl() {
    setError(null);
    setSavingUrl(true);
    try {
      const res = await fetch(`${apiUrl}/admin/products/${productId}/media/video-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: urlDraft.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось добавить видео");
        return;
      }
      setItems((list) => reindex([...list, json.data]));
      setUrlDraft("");
      setUrlModalOpen(false);
    } catch {
      setError("Ошибка сети");
    } finally {
      setSavingUrl(false);
    }
  }

  /* ============ ДОБАВЛЕНИЕ ИЗ МЕДИА-ГАЛЕРЕИ ============
     Файлы, уже лежащие в public/uploads (раздел «media» файлового
     менеджера), привязываются к товару без повторной загрузки. */
  async function attachFromGallery(picked: GalleryPick[]) {
    if (picked.length === 0) return;
    setError(null);
    setAttaching(true);
    const failed: string[] = [];
    try {
      for (const p of picked) {
        try {
          const res = await fetch(`${apiUrl}/admin/products/${productId}/media/attach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ url: p.url }),
          });
          const json = await res.json();
          if (!res.ok) {
            failed.push(`${p.name}: ${json.error ?? "не удалось добавить"}`);
            continue;
          }
          setItems((list) => reindex([...list, json.data]));
        } catch {
          failed.push(`${p.name}: ошибка сети`);
        }
      }
    } finally {
      setAttaching(false);
      if (failed.length > 0) setError(failed.join("; "));
    }
  }

  /* ============ УДАЛЕНИЕ ============ */
  async function removeItem(id: number) {
    if (!confirm("Удалить этот медиа-файл?")) return;
    const res = await fetch(`${apiUrl}/admin/products/${productId}/media/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setItems((list) => reindex(list.filter((i) => i.id !== id)));
    }
  }

  /* ============ DRAG-N-DROP ============ */
  function onDragStart(idx: number) {
    setDraggedIdx(idx);
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }

  function onDragLeave() {
    setDragOverIdx(null);
  }

  async function onDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(draggedIdx, 1);
    next.splice(targetIdx, 0, moved);
    const withOrder = reindex(next);
    setItems(withOrder);
    setDraggedIdx(null);
    setDragOverIdx(null);
    await persistOrder(withOrder);
    flashSaved();
  }

  async function moveByOne(idx: number, dir: -1 | 1) {
    const t = idx + dir;
    if (t < 0 || t >= items.length) return;
    const next = [...items];
    [next[idx], next[t]] = [next[t], next[idx]];
    const withOrder = reindex(next);
    setItems(withOrder);
    await persistOrder(withOrder);
    flashSaved();
  }

  /* ============ РЕНДЕР ============ */
  const firstId = items[0]?.id;

  return (
    <section className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          Медиа-файлы{" "}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            ({items.length})
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => imgInputRef.current?.click()}
            disabled={uploadingImg}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {uploadingImg ? "…" : "+ Картинка"}
          </button>
          <button
            type="button"
            onClick={() => vidInputRef.current?.click()}
            disabled={uploadingVid}
            className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-60"
          >
            {uploadingVid ? `${vidPct}%` : "+ Видео"}
          </button>
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            disabled={attaching}
            title="Выбрать готовые файлы из медиа-галереи сайта (папка /uploads) — без повторной загрузки"
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-1.5 text-xs font-medium text-[var(--color-body)] hover:border-[var(--color-primary)] disabled:opacity-60"
          >
            {attaching ? "Добавляем…" : "🖼 Из галереи"}
          </button>
          <button
            type="button"
            onClick={() => setUrlModalOpen(true)}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-1.5 text-xs font-medium text-[var(--color-body)] hover:border-[var(--color-primary)]"
          >
            + URL видео
          </button>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => handleImages(e.target.files)}
            className="hidden"
          />
          <input
            ref={vidInputRef}
            type="file"
            accept="video/mp4,video/webm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadVideoFile(f);
            }}
            className="hidden"
          />
        </div>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Перетаскивайте элементы, чтобы менять порядок. Первый элемент — обложка товара.
        Кнопка «Из галереи» позволяет выбрать уже загруженные на сайт файлы.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">закрыть</button>
        </div>
      )}
      {saved && <p className="text-sm text-green-700">✓ Сохранено</p>}

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          Пока нет медиа. Загрузите хотя бы одну картинку — она станет обложкой.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {items.map((item, i) => {
            const isFirst = item.id === firstId;
            const isDragged = draggedIdx === i;
            const isOver = dragOverIdx === i && draggedIdx !== i;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, i)}
                onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                className={`group relative aspect-square cursor-move overflow-hidden rounded-lg border-2 bg-[var(--color-bg-soft)] transition ${
                  isOver
                    ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                    : isFirst
                    ? "border-[var(--color-primary)]"
                    : "border-[var(--color-border)]"
                } ${isDragged ? "opacity-40" : ""}`}
              >
                {item.type === "image" ? (
                  <Image
                    src={item.url}
                    alt={item.alt || ""}
                    fill
                    sizes="150px"
                    className="object-contain p-2"
                  />
                ) : (
                  <VideoPreview url={item.url} />
                )}

                {isFirst && (
                  <span className="absolute left-1 top-1 z-10 rounded bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                    обложка
                  </span>
                )}

                {item.type === "video" && (
                  <span className="absolute right-1 top-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    видео
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/60 p-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => moveByOne(i, -1)}
                    disabled={i === 0}
                    className="rounded bg-white/20 px-1.5 py-0.5 text-xs text-white disabled:opacity-30"
                    title="Влево"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded bg-red-500/80 px-1.5 py-0.5 text-xs text-white"
                    title="Удалить"
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    onClick={() => moveByOne(i, 1)}
                    disabled={i === items.length - 1}
                    className="rounded bg-white/20 px-1.5 py-0.5 text-xs text-white disabled:opacity-30"
                    title="Вправо"
                  >
                    →
                  </button>
                </div>

                <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100">
                  #{i + 1}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Медиа-галерея (выбор из /uploads) */}
      <MediaGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onPick={attachFromGallery}
        accept="all"
        apiUrl={apiUrl}
      />

      {/* Модалка URL видео */}
      {urlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setUrlModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              Добавить видео по ссылке
            </h3>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              YouTube, VK Video, RuTube или прямой URL .mp4
            </p>
            <input
              type="url"
              autoFocus
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://youtu.be/..."
              className="mb-3 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
            {urlDraft && (
              <p className="mb-3 text-xs text-green-700">
                ✓ {classifyVideo(urlDraft)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUrlModalOpen(false)}
                className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!urlDraft || savingUrl}
                onClick={addVideoUrl}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {savingUrl ? "…" : "Добавить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Превью видео в сетке ---------- */
function VideoPreview({ url }: { url: string }) {
  const kind = classifyVideo(url);

  if (kind === "local") {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-contain p-2"
      />
    );
  }

  const label =
    kind === "youtube" ? "YouTube" :
    kind === "vk" ? "VK" :
    kind === "rutube" ? "RuTube" :
    "Видео";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--color-muted)]">
        <path d="M8 5v14l11-7z" />
      </svg>
      <span className="text-[10px] text-[var(--color-muted)]">{label}</span>
    </div>
  );
}