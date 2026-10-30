"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { ProductMedia } from "@/lib/types";

interface Props {
  media: ProductMedia[];
  productName: string;
}

function classifyVideo(url: string): "local" | "youtube" | "vk" | "rutube" | "unknown" {
  if (url.startsWith("/uploads/")) return "local";
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return "local";
  if (/youtu\.be|youtube\.com/i.test(url)) return "youtube";
  if (/vk\.com\/video|vkvideo\.ru/i.test(url)) return "vk";
  if (/rutube\.ru/i.test(url)) return "rutube";
  return "unknown";
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

export function ProductGallery({ media, productName }: Props) {
  const sorted = useMemo(
    () => [...media].sort((a, b) => a.sort_order - b.sort_order),
    [media]
  );

  // Главное медиа — первое по sort_order: если в админке видео поставлено первым,
  // при заходе на товар открывается именно оно, а не первая картинка.
  // Сброс слайда при смене товара — adjust state during render (без useEffect)
  const [active, setActive] = useState(0);
  const [prevMedia, setPrevMedia] = useState(media);
  if (prevMedia !== media) {
    setPrevMedia(media);
    setActive(0);
  }

  // Постер для видео — первая картинка (если есть).
  // Хуки объявлены до early return — нельзя вызывать их после условия
  const posterUrl = useMemo(() => {
    const img = sorted.find((m) => m.type === "image");
    return img?.url ?? null;
  }, [sorted]);

  const current = sorted[active];

  if (!current) {
    return (
      <div className="aspect-square overflow-hidden rounded-[var(--radius-card)] bg-white" />
    );
  }

  return (
    <div className="space-y-3">
      {/* Клик по главному фото — следующий слайд (как в карточках каталога);
          точечно слайды переключаются миниатюрами ниже */}
      <div
        className={
          "relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-white " +
          (sorted.length > 1 ? "cursor-pointer" : "")
        }
        onClick={() => {
          if (sorted.length > 1) setActive((a) => (a + 1) % sorted.length);
        }}
      >
        {current.type === "video" ? (
          <MainVideo key={current.url} url={current.url} poster={posterUrl} />
        ) : (
          <Image
            src={current.url}
            alt={current.alt || productName}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-6"
            priority
          />
        )}
      </div>

      {sorted.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sorted.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Медиа ${i + 1}`}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-card)] border-2 bg-white transition ${
                active === i
                  ? "border-[var(--color-primary)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
              }`}
            >
              {item.type === "image" ? (
                <Image
                  src={item.url}
                  alt={item.alt || ""}
                  fill
                  sizes="64px"
                  className="object-contain p-1"
                />
              ) : (
                <div className="relative h-full w-full">
                  {posterUrl ? (
                    <Image
                      src={posterUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-contain p-1 opacity-50"
                    />
                  ) : (
                    <div className="h-full w-full bg-white" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Прелоадер поверх видео: спиннер, пока кадры не готовы к показу */
function VideoSpinner() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/55"
    >
      <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--color-border)] border-t-[var(--color-primary)]" />
    </div>
  );
}

function MainVideo({ url, poster }: { url: string; poster: string | null }) {
  const kind = classifyVideo(url);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /* Видео из кеша может быть готово ещё до монтирования — события canplay уже не будет.
     Проверяем readyState в ref-колбэке (setState в теле effect запрещён линтером) */
  const attachVideo = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && el.readyState >= 3) setReady(true);
  };

  /* Страховка: если загрузка зависла (внешний iframe заблокирован и т.п.),
     прелоадер не должен висеть вечно */
  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setReady(true), 8000);
    return () => window.clearTimeout(t);
  }, [ready, url]);

  if (kind === "local") {
    return (
      <div className="relative h-full w-full">
        <video
          ref={attachVideo}
          src={url}
          poster={poster ?? undefined}
          autoPlay
          loop
          muted
          playsInline
          controls={false}
          preload="auto"
          onCanPlay={() => setReady(true)}
          onLoadedData={() => setReady(true)}
          onError={() => setReady(true)}
          className="h-full w-full object-contain p-6"
        />
        {!ready && <VideoSpinner />}
      </div>
    );
  }

  if (kind === "youtube") {
    const id = extractYouTubeId(url);
    if (!id) return <FallbackLink url={url} />;
    return (
      <div className="relative h-full w-full">
        <iframe
          src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&playsinline=1&rel=0`}
          title="Видео-презентация"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          onLoad={() => setReady(true)}
          className="absolute inset-0 h-full w-full"
        />
        {!ready && <VideoSpinner />}
      </div>
    );
  }

  if (kind === "vk") {
    const m = url.match(/video(-?\d+)_(\d+)/);
    if (!m) return <FallbackLink url={url} />;
    return (
      <div className="relative h-full w-full">
        <iframe
          src={`https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&autoplay=1&hd=2`}
          title="Видео-презентация"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          onLoad={() => setReady(true)}
          className="absolute inset-0 h-full w-full"
        />
        {!ready && <VideoSpinner />}
      </div>
    );
  }

  return <FallbackLink url={url} />;
}

function FallbackLink({ url }: { url: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-primary)] hover:underline"
      >
        Смотреть видео →
      </a>
    </div>
  );
}