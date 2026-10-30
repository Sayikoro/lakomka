import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getProductBySlug, getProducts, lookupLegacySlug } from "@/lib/products";
import { ProductLive } from "@/components/product/ProductView";
import { ProductJsonLd } from "@/components/seo/ProductJsonLd";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/* Для статического экспорта (деплой на обычный сервер): список всех
 * товаров собирается на этапе билда, страницы товаров становятся
 * готовыми HTML-файлами. В dev-режиме не мешает (нужные slug'и
 * отрисовываются по требованию). */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const products = await getProducts().catch(() => []);
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    const legacySlug = await lookupLegacySlug(slug);
    if (legacySlug) {
      return { robots: { index: false, follow: true } };
    }
    return {
      title: "Товар не найден",
      robots: { index: false, follow: false },
    };
  }

  const priceRub = Math.round(product.price_kopecks / 100);
  const priceFormatted = priceRub.toLocaleString("ru-RU");
  const cover = product.images[0]?.url;

  return {
    title: product.name,
    description:
      product.description?.slice(0, 160) ||
      `${product.name} — купить с доставкой по Хабаровску за ${priceFormatted} ₽.`,
    alternates: {
      canonical: `/product/${product.slug}`,
    },
    openGraph: {
      type: "website",
      title: `${product.name} — ${priceFormatted} ₽`,
      description: product.description?.slice(0, 200) || undefined,
      url: `/product/${product.slug}`,
      images: cover
        ? [{ url: cover, width: 1000, height: 1000, alt: product.name }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — ${priceFormatted} ₽`,
      images: cover ? [cover] : undefined,
    },
    other: {
      "product:price:amount": String(priceRub),
      "product:price:currency": "RUB",
      "product:availability":
        product.show_in_catalog === 1 ? "in stock" : "out of stock",
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    const legacySlug = await lookupLegacySlug(slug);
    if (legacySlug) {
      permanentRedirect(`/product/${legacySlug}`);
    }
    notFound();
  }

  /* Тело страницы — клиентский ProductLive: стартует с запечённых данных
     (SEO/мгновенный рендер), затем подтягивает свежий товар с API —
     цены/фото/видео на развёрнутом сайте обновляются без пересборки.
     Новые товары (созданные после сборки) открывает «спасение» на 404
     (NotFoundView → ProductView). JSON-LD остаётся запечённым. */
  return (
    <>
      <ProductJsonLd product={product} />
      <ProductLive slug={product.slug} initial={product} />
    </>
  );
}