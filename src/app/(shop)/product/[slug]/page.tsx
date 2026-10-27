import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";

import { getProductBySlug, lookupLegacySlug } from "@/lib/products";
import { AddToCart } from "@/components/ui/AddToCart";
import { ProductGallery } from "@/components/ui/ProductGallery";
import { ProductTabs } from "@/components/ui/ProductTabs";
import { ProductJsonLd } from "@/components/seo/ProductJsonLd";
import { formatPrice } from "@/lib/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
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

  const hasDiscount =
    product.old_price_kopecks && product.old_price_kopecks > product.price_kopecks;

  return (
    <>
      <ProductJsonLd product={product} />

      <div className="mx-auto max-w-[1200px] px-4 py-8">
        {/* Хлебные крошки */}
        <nav className="mb-6 text-sm text-[var(--color-muted)]">
          <Link href="/" className="hover:text-[var(--color-primary)]">
            Главная
          </Link>
          <span className="mx-2">/</span>
          <Link href="/catalog" className="hover:text-[var(--color-primary)]">
            Каталог
          </Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--color-heading)]">{product.name}</span>
        </nav>

        {/* Верх: галерея + инфо */}
        <div className="grid gap-10 lg:grid-cols-2">
          <ProductGallery media={product.media} productName={product.name} />

          <div className="space-y-5">
            <h1 className="text-[32px] font-medium leading-tight text-[var(--color-heading)]">
              {product.name}
            </h1>

            {product.manufacturer && (
              <p className="text-sm text-[var(--color-body)]">
                Производитель:{" "}
                <span className="font-medium text-[var(--color-heading)]">
                  {product.manufacturer}
                </span>
              </p>
            )}

            <div className="flex items-end gap-3">
              <span className="text-[32px] font-semibold text-[var(--color-heading)]">
                {formatPrice(product.price_kopecks)}
              </span>
              {hasDiscount && (
                <span className="text-lg text-[var(--color-muted)] line-through">
                  {formatPrice(product.old_price_kopecks!)}
                </span>
              )}
            </div>

            <AddToCart product={product} />

            <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5 text-sm text-[var(--color-body)]">
              <h2 className="mb-2 font-semibold text-[var(--color-heading)]">
                Доставка
              </h2>
              <p>
                Бесплатно по Хабаровску от 5 000 ₽. За городом — по тарифам ТК.
                Точную стоимость подтвердим после оформления.
              </p>
            </div>
          </div>
        </div>

        {/* Низ: табы */}
        <div className="mt-10">
          <ProductTabs product={product} />
        </div>
      </div>
    </>
  );
}