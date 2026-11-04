import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { getCategories, getProducts } from "@/lib/products";

export const dynamic = "force-static"; // для output: export; данные фиксируются на этапе сборки

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE.url}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE.url}/catalog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  /* Task 141: SEO-лендинги категорий /catalog/<slug> */
  let categoryRoutes: MetadataRoute.Sitemap = [];
  try {
    const categories = await getCategories();
    categoryRoutes = categories.map((c) => ({
      url: `${SITE.url}/catalog/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    // если API недоступен — sitemap будет без категорий, но не упадёт
  }

  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const products = await getProducts();
    productRoutes = products.map((p) => ({
      url: `${SITE.url}/product/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // если API недоступен — sitemap будет без товаров, но не упадёт
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}