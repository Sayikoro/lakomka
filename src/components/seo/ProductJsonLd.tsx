import type { Product } from "@/lib/types";
import { SITE } from "@/lib/site";

interface Props {
  product: Product;
}

export function ProductJsonLd({ product }: Props) {
  const price = (product.price_kopecks / 100).toFixed(0);
  /* Наличие — по реальному остатку (Task 109): товар может быть виден в
     каталоге, но с нулевым остатком — поисковикам честно отдаём OutOfStock.
     stock_qty может отсутствовать (старые кэши) — тогда старое поведение. */
  const inStock =
    product.stock_qty == null ? product.show_in_catalog === 1 : product.stock_qty > 0;
  const availability =
    product.show_in_catalog === 1 && inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku ?? undefined,
    image: product.images.map((i) => i.url),
    /* Реальное описание товара; короткая подстановка — только когда админ
       описание не заполнил */
    description:
      product.description?.slice(0, 500) ||
      `${product.name} — новогодний подарок от Лакомки с доставкой по Хабаровску.`,
    itemCondition: "https://schema.org/NewCondition",
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
      dangerouslySetInnerHTML={{
        // Экранируем «<» — иначе «</script>» внутри названия товара вырвется
        // из тега script (stored XSS). Только админы вводят данные, но защита
        // должна быть и от скомпрометированной админки.
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}