import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { getProducts } from "@/lib/products";

export const revalidate = 3600; // пересобирать раз в час

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

  return [...staticRoutes, ...productRoutes];
}