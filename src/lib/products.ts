import type { Product } from "./types";
import { FETCH_CACHE } from "./fetch-cache";
import {
  normalizeProduct,
  type ApiProduct,
  type Category,
} from "./product-api";

export type { Category };

const API_URL = process.env.PHP_API_URL ?? "http://localhost:8000/api";

export async function getProducts(): Promise<Product[]> {
  try {
    const res = await fetch(`${API_URL}/products`, { cache: FETCH_CACHE });
    if (!res.ok) { console.error(`[products] API ${res.status}`); return []; }
    const json = (await res.json()) as { data: ApiProduct[] };
    return (json.data ?? []).map(normalizeProduct);
  } catch (err) {
    console.error("[products] fetch failed:", err);
    return [];
  }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API_URL}/products/${slug}`, { cache: FETCH_CACHE });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`[products] by-slug ${slug}: API ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { data: ApiProduct };
    return normalizeProduct(json.data);
  } catch (err) {
    console.error(`[products] by-slug ${slug}: fetch failed`, err);
    return null;
  }
}

export async function lookupLegacySlug(legacySlug: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_URL}/products/by-legacy/${encodeURIComponent(legacySlug)}`,
      { cache: FETCH_CACHE }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data: { slug: string } };
    return json.data.slug;
  } catch { return null; }
}

/* Task 139: похожие подарки — запекаются при сборке (мгновенный рендер
   и SEO), после монтирования ProductLive обновляет их с живого API. */
export async function getSimilarProducts(slug: string): Promise<Product[]> {
  try {
    const res = await fetch(
      `${API_URL}/products/${encodeURIComponent(slug)}/similar`,
      { cache: FETCH_CACHE }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data: ApiProduct[] };
    return (json.data ?? []).map(normalizeProduct);
  } catch {
    return [];
  }
}

export async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_URL}/categories`, { cache: FETCH_CACHE });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Category[] };
    return json.data ?? [];
  } catch { return []; }
}