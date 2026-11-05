/* ============================================================
   Галереи картинок (Task 146) — клиент витринных данных.

   Галерея = папка public/uploads/galleries/<слаг> на бэкенде,
   управляется из админки (Файлы → Галерея) и ставится в блоки
   шорткодом [gallery слаг]. Витрина получает содержимое через
   публичный /api/galleries/{слаг}.

   Паттерн тот же, что у hero/снегопада: сервер при сборке запекает
   снимок (getGallery), после монтирования клиент подтягивает свежий
   (fetchGalleryLive) — владелец меняет картинки в админке, на сайте
   они появляются после F5 без пересборки.
   ============================================================ */

import { FETCH_CACHE } from "./fetch-cache";

const API_URL = process.env.PHP_API_URL ?? "http://localhost:8000/api";

export interface GalleryItem {
  /** Публичный URL картинки (/uploads/galleries/…, уже закодирован) */
  url: string;
  /** alt из имени файла (дефисы/подчёркивания → пробелы) */
  alt: string;
}

export interface Gallery {
  slug: string;
  title: string;
  items: GalleryItem[];
}

/** Серверный fetch для запекания при сборке (cache()-дружественный) */
export async function getGallery(slug: string): Promise<Gallery | null> {
  if (!/^[a-z0-9-]{1,64}$/i.test(slug)) return null;
  try {
    const res = await fetch(`${API_URL}/galleries/${encodeURIComponent(slug)}`, {
      cache: FETCH_CACHE,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Partial<Gallery> };
    const d = json.data;
    if (!d || !Array.isArray(d.items)) return null;
    return {
      slug: typeof d.slug === "string" ? d.slug : slug,
      title: typeof d.title === "string" ? d.title : slug,
      items: d.items
        .filter((it): it is GalleryItem => Boolean(it && typeof it.url === "string"))
        .map((it) => ({ url: it.url, alt: typeof it.alt === "string" ? it.alt : "" })),
    };
  } catch {
    return null;
  }
}

/** Живой fetch после монтирования (клиентский, no-store) */
export async function fetchGalleryLive(
  slug: string,
  apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api"
): Promise<Gallery | null> {
  if (!/^[a-z0-9-]{1,64}$/i.test(slug)) return null;
  try {
    const res = await fetch(`${apiUrl}/galleries/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Partial<Gallery> };
    const d = json.data;
    if (!d || !Array.isArray(d.items)) return null;
    return {
      slug: typeof d.slug === "string" ? d.slug : slug,
      title: typeof d.title === "string" ? d.title : slug,
      items: d.items
        .filter((it): it is GalleryItem => Boolean(it && typeof it.url === "string"))
        .map((it) => ({ url: it.url, alt: typeof it.alt === "string" ? it.alt : "" })),
    };
  } catch {
    return null;
  }
}
