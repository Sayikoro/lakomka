import type { Product, BundleItem, ProductImage, ProductMedia } from "./types";

const API_URL = process.env.PHP_API_URL ?? "http://localhost:8000/api";

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
interface ApiProduct {
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
  images?: ApiImage[];
  media?: ApiMedia[];
  bundle_items?: ApiBundleItem[];
}

function normalize(p: ApiProduct): Product {
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
  };
}

export async function getProducts(): Promise<Product[]> {
  try {
    const res = await fetch(`${API_URL}/products`, { cache: "no-store" });
    if (!res.ok) { console.error(`[products] API ${res.status}`); return []; }
    const json = (await res.json()) as { data: ApiProduct[] };
    return (json.data ?? []).map(normalize);
  } catch (err) {
    console.error("[products] fetch failed:", err);
    return [];
  }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API_URL}/products/${slug}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = (await res.json()) as { data: ApiProduct };
    return normalize(json.data);
  } catch {
    return null;
  }
}

export async function lookupLegacySlug(legacySlug: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_URL}/products/by-legacy/${encodeURIComponent(legacySlug)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data: { slug: string } };
    return json.data.slug;
  } catch { return null; }
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
}

export async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_URL}/categories`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Category[] };
    return json.data ?? [];
  } catch { return []; }
}