"use client";

import { useEffect, useMemo, useState } from "react";
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

  const defaultActive = useMemo(() => {
    const idx = sorted.findIndex((m) => m.type === "image");
    return idx >= 0 ? idx : 0;
  }, [sorted]);

  const [active, setActive] = useState(defaultActive);

  useEffect(() => {
    setActive(defaultActive);
  }, [defaultActive]);

  const current = sorted[active];

  if (!current) {
    return (
      <div className="aspect-square overflow-hidden rounded-[var(--radius-card)] bg-white" />
    );
  }

  const posterUrl = useMemo(() => {
    const img = sorted.find((m) => m.type === "image");
    return img?.url ?? null;
  }, [sorted]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-white">
        {current.type === "video" ? (
          <MainVideo url={current.url} poster={posterUrl} />
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

function MainVideo({ url, poster }: { url: string; poster: string | null }) {
  const kind = classifyVideo(url);

  if (kind === "local") {
    return (
      <video
        src={url}
        poster={poster ?? undefined}
        autoPlay
        loop
        muted
        playsInline
        controls={false}
        preload="metadata"
        className="h-full w-full object-contain p-6"
      />
    );
  }

  if (kind === "youtube") {
    const id = extractYouTubeId(url);
    if (!id) return <FallbackLink url={url} />;
    return (
      <iframe
        src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&playsinline=1&rel=0`}
        title="Видео-презентация"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    );
  }

  if (kind === "vk") {
    const m = url.match(/video(-?\d+)_(\d+)/);
    if (!m) return <FallbackLink url={url} />;
    return (
      <iframe
        src={`https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&autoplay=1&hd=2`}
        title="Видео-презентация"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
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