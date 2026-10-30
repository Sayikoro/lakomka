/* ============================================================
   Живые данные витрины.
   Витрина статическая (export), но после монтирования страницы
   подтягивают свежие товары/категории с PHP API — новые товары,
   цены, фото и видео появляются без пересборки пакета.
   Серверные (запечённые) данные используются как мгновенный
   первый рендер и для SEO.

   normalizeProduct — общий нормализатор ответа API: используется
   и серверной lib/products.ts (сборка), и клиентскими фетчерами.
   ============================================================ */

import type {
  Product,
  BundleItem,
  ProductImage,
  ProductMedia,
} from "./types";

export interface Category {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

interface ApiImage { url: string; alt: string | null; }
interface ApiMedia {
  id: number;
  type: "image" | "video";
  url: string;
  alt: string | null;
  sort_order: number;
}
interface ApiBundleItem {
  quantity: number;
  component_id: number;
  component_name: string;
  component_slug: string;
  component_manufacturer: string | null;
  component_description: string | null;
  component_image: string | null;
  sku: string | null;
}
export interface ApiProduct {
  id: number;
  legacy_wc_id: number | null;
  sku: string | null;
  slug: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  type: "simple" | "bundle";
  category_id?: number | null;
  price_kopecks: number;
  old_price_kopecks: number | null;
  packaging_material: string | null;
  weight_g?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  recipe_weight_g?: number | null;
  show_in_catalog: number;
  video_url?: string | null;
  component_ids?: number[];
  images?: ApiImage[];
  media?: ApiMedia[];
  bundle_items?: ApiBundleItem[];
}

export function normalizeProduct(p: ApiProduct): Product {
  let media: ProductMedia[] = [];
  if (p.media && Array.isArray(p.media)) {
    media = p.media.map((m) => ({
      id: m.id, type: m.type, url: m.url,
      alt: m.alt ?? p.name, sort_order: m.sort_order,
    }));
  } else {
    const imgs = p.images ?? [];
    media = imgs.map((img, i) => ({
      id: p.id * 1000 + i, type: "image" as const,
      url: img.url, alt: img.alt ?? p.name, sort_order: i,
    }));
    if (p.video_url) {
      media.push({
        id: p.id * 1000 + 999, type: "video",
        url: p.video_url, alt: p.name, sort_order: media.length,
      });
    }
  }

  const images: ProductImage[] = media
    .filter((m) => m.type === "image")
    .map((m) => ({ id: m.id, url: m.url, alt: m.alt, sort_order: m.sort_order }));

  const bundle_items: BundleItem[] = (p.bundle_items ?? []).map((b, i) => ({
    id: p.id * 1000 + i,
    product_id: p.id,
    component_id: b.component_id ?? 0,
    quantity: b.quantity,
    component: {
      id: b.component_id ?? 0,
      sku: b.sku,
      slug: b.component_slug,
      name: b.component_name,
      description: b.component_description,
      manufacturer: b.component_manufacturer,
      type: "simple" as const,
      category_id: null,
      price_kopecks: 0,
      old_price_kopecks: null,
      packaging_material: null,
      show_in_catalog: 0,
      media: b.component_image
        ? [{ id: 0, type: "image" as const, url: b.component_image, alt: b.component_name, sort_order: 0 }]
        : [],
      images: b.component_image
        ? [{ id: 0, url: b.component_image, alt: b.component_name, sort_order: 0 }]
        : [],
    },
  }));

  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    description: p.description,
    manufacturer: p.manufacturer,
    type: p.type,
    category_id: p.category_id ?? null,
    price_kopecks: p.price_kopecks,
    old_price_kopecks: p.old_price_kopecks,
    packaging_material: p.packaging_material,
    weight_g: p.weight_g ?? null,
    length_cm: p.length_cm ?? null,
    width_cm: p.width_cm ?? null,
    height_cm: p.height_cm ?? null,
    recipe_weight_g: p.recipe_weight_g ?? null,
    show_in_catalog: p.show_in_catalog,
    media,
    images,
    bundle_items: p.type === "bundle" ? bundle_items : undefined,
    component_ids: p.component_ids ?? [],
  };
}

/* ---------- Клиентские фетчеры (относительный /api — same-origin) ---------- */

/** Живой каталог: null = API недоступен (оставляем запечённые данные) */
export async function fetchLiveProducts(): Promise<Product[] | null> {
  try {
    const res = await fetch("/api/products", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: ApiProduct[] };
    return (json.data ?? []).map(normalizeProduct);
  } catch {
    return null;
  }
}

/** Живые категории: null = API недоступен */
export async function fetchLiveCategories(): Promise<Category[] | null> {
  try {
    const res = await fetch("/api/categories", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Category[] };
    return json.data ?? [];
  } catch {
    return null;
  }
}

/** Живой товар по slug: null = недоступен/не найден */
export async function fetchLiveProductBySlug(
  slug: string,
): Promise<Product | null> {
  try {
    const res = await fetch(
      `/api/products/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: ApiProduct };
    return json.data ? normalizeProduct(json.data) : null;
  } catch {
    return null;
  }
}

/** Изменились ли данные (быстрое сравнение по JSON — объёмы небольшие) */
export function productsDiffer(a: Product[] | null, b: Product[] | null): boolean {
  if (a === b) return false;
  if (!a || !b) return true;
  if (a.length !== b.length) return true;
  try {
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch {
    return true;
  }
}
