import { SITE } from "@/lib/site";

interface Crumb {
  name: string;
  /** Путь от корня ("/") или полный URL */
  path: string;
}

/**
 * Task 147: разметка BreadcrumbList (schema.org) — «хлебные крошки»
 * для поисковиков. Ставится на страницах, где крошки есть визуально
 * (категории, товары) или логически подразумеваются (SEO-лендинги).
 */
export function BreadcrumbJsonLd({ crumbs }: { crumbs: Crumb[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.path.startsWith("http") ? c.path : `${SITE.url}${c.path}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        // Экранируем «<» — защита от вырыва из тега script
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
