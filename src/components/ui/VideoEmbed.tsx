interface Props {
  url: string;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractVkVideo(url: string): { oid: string; id: string } | null {
  // https://vk.com/video-12345678_456789012
  // https://vkvideo.ru/video-12345678_456789012
  const m = url.match(/video(-?\d+)_(\d+)/);
  if (m) return { oid: m[1], id: m[2] };
  return null;
}

export function VideoEmbed({ url }: Props) {
  // YouTube
  const ytId = extractYouTubeId(url);
  if (ytId) {
    return (
      <div className="relative aspect-video">
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          title="Видео-презентация"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  // VK Video
  const vk = extractVkVideo(url);
  if (vk) {
    return (
      <div className="relative aspect-video">
        <iframe
          src={`https://vk.com/video_ext.php?oid=${vk.oid}&id=${vk.id}&hd=2`}
          title="Видео-презентация"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  // Прямой URL на .mp4
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return (
      <video
        src={url}
        controls
        className="aspect-video w-full bg-black"
        preload="metadata"
      />
    );
  }

  // Не распознали — просто ссылка
  return (
    <div className="p-4 text-sm">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-primary)] hover:underline"
      >
        Смотреть видео-презентацию →
      </a>
    </div>
  );
}