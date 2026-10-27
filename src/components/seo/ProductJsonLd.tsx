import type { Product } from "@/lib/types";
import { SITE } from "@/lib/site";

interface Props {
  product: Product;
}

export function ProductJsonLd({ product }: Props) {
  const price = (product.price_kopecks / 100).toFixed(0);
  const availability =
    product.show_in_catalog === 1
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku ?? undefined,
    image: product.images.map((i) => i.url),
    description: `${product.name} — новогодний подарок от Лакомки с доставкой по Хабаровску.`,
    brand: {
      "@type": "Brand",
      name: SITE.name,
    },
    offers: {
      "@type": "Offer",
      url: `${SITE.url}/product/${product.slug}`,
      priceCurrency: "RUB",
      price,
      availability,
      seller: {
        "@type": "Organization",
        name: SITE.legalName,
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}