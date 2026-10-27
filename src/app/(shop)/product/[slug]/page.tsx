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

/** Вес в человекочитаемом виде: 520 → «520 г», 1500 → «1,5 кг» */
function formatWeightLine(g: number | null | undefined): string | null {
  if (!g || g <= 0) return null;
  if (g >= 1000) {
    const kg = g / 1000;
    const s = kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `${s} кг`;
  }
  return `${g} г`;
}

/** Габариты: «20 × 15 × 10 см»; null если все размеры пустые */
function formatDimsLine(
  l: number | null | undefined,
  w: number | null | undefined,
  h: number | null | undefined,
): string | null {
  if (!l && !w && !h) return null;
  const fmt = (n: number | null | undefined) =>
    n ? (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".0", "").replace(".", ",")) : "—";
  return `${fmt(l)} × ${fmt(w)} × ${fmt(h)} см`;
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

      <div className="mx-auto max-w-[1200px] px-4 py-5 sm:py-8">
        {/* Хлебные крошки */}
        <nav className="mb-4 text-xs text-[var(--color-muted)] sm:mb-6 sm:text-sm">
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
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
          <ProductGallery media={product.media} productName={product.name} />

          <div className="space-y-4 sm:space-y-5">
            <h1 className="text-2xl font-medium leading-tight text-[var(--color-heading)] sm:text-[32px]">
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
              <span className="text-[26px] font-semibold text-[var(--color-heading)] sm:text-[32px]">
                {formatPrice(product.price_kopecks)}
              </span>
              {hasDiscount && (
                <span className="text-lg text-[var(--color-muted)] line-through">
                  {formatPrice(product.old_price_kopecks!)}
                </span>
              )}
            </div>

            <AddToCart product={product} />

            {(formatWeightLine(product.weight_g) || formatDimsLine(product.length_cm, product.width_cm, product.height_cm)) && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm text-[var(--color-body)]">
                {formatWeightLine(product.weight_g) && (
                  <span className="inline-flex items-center gap-2">
                    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]">
                      <path d="M8.5 8.5a3.5 3.5 0 0 1 7 0" />
                      <rect x="4.5" y="8.5" width="15" height="11.5" rx="2.5" />
                    </svg>
                    <span>
                      Вес:{" "}
                      <span className="font-medium text-[var(--color-heading)]">
                        {formatWeightLine(product.weight_g)}
                      </span>
                    </span>
                  </span>
                )}
                {formatDimsLine(product.length_cm, product.width_cm, product.height_cm) && (
                  <span className="inline-flex items-center gap-2">
                    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]">
                      <rect x="2.5" y="9" width="19" height="6" rx="1.5" />
                      <path d="M7 9v3M12 9v2.5M17 9v3" />
                    </svg>
                    <span>
                      Габариты:{" "}
                      <span className="font-medium text-[var(--color-heading)]">
                        {formatDimsLine(product.length_cm, product.width_cm, product.height_cm)}
                      </span>
                    </span>
                  </span>
                )}
              </div>
            )}

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
        <div className="mt-6 sm:mt-10">
          <ProductTabs product={product} />
        </div>
      </div>
    </>
  );
}