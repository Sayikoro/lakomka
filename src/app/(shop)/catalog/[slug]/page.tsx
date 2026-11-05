import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCategories, getProducts } from "@/lib/products";
import { getPublicSettings } from "@/lib/settings";
import { categorySeo } from "@/lib/seo";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { CategorySeoLive } from "@/components/texts/CategorySeoLive";
import { CatalogClient } from "../CatalogClient";

/* ============================================================
   Task 141: SEO-лендинг категории — /catalog/<slug>.

   Раньше категории жили только в параметре /catalog?category=…,
   который поисковики почти не индексируют. Теперь у каждой
   категории своя статическая страница: мета-теги берутся из
   SEO-полей категории (админка → Товары → «SEO категорий»),
   пустые поля автогенерируются из названия.

   Страницы запекаются при сборке (generateStaticParams); товары
   внутри — те же живые карточки, что и в обычном каталоге.
   ============================================================ */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const categories = await getCategories().catch(() => []);
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getCategories().catch(() => []);
  const cat = categories.find((c) => c.slug === slug);

  if (!cat) {
    return {
      title: "Категория не найдена",
      robots: { index: false, follow: false },
    };
  }

  /* Task 147: автогенерация через карту CATEGORY_SEO — продуктовые
     фразы с гео («Подарочные наборы конфет — купить в Хабаровске»);
     заполненные в админке поля по-прежнему приоритетны. */
  const seo = categorySeo(cat);

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: `/catalog/${cat.slug}`,
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: `/catalog/${cat.slug}`,
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const [products, categories, cfg] = await Promise.all([
    getProducts(),
    getCategories(),
    getPublicSettings(),
  ]);

  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  /* H1: продуктовая фраза из карты (или название категории); поля
     админки (meta_title) влияют на <title>, H1 — кодовый MAP. */
  const seo = categorySeo(category);

  /* SEO-текст: заполнен в админке — рисуем над сеткой товаров */
  const seoText = category.seo_text?.trim() || "";

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-10">
      {/* Хлебные крошки */}
      <nav className="mb-4 text-xs text-[var(--color-muted)] sm:text-sm">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Главная
        </Link>
        <span className="mx-2">/</span>
        <Link href="/catalog" className="hover:text-[var(--color-primary)]">
          Каталог
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-heading)]">{category.name}</span>
      </nav>

      <BreadcrumbJsonLd
        crumbs={[
          { name: "Главная", path: "/" },
          { name: "Каталог", path: "/catalog" },
          { name: seo.h1, path: `/catalog/${category.slug}` },
        ]}
      />

      <h1 className="mb-6 text-[40px] font-medium text-[var(--color-heading)]">
        {seo.h1}
      </h1>

      {/* Task 146: seo_text понимает шорткод [gallery слаг] (RichText) и
          обновляется с живого API — поправили текст (или вставили шорткод)
          в админке → F5 → на странице уже новый, пересборка не нужна.
          Рендерим всегда: текст живой, при пустом блок сам исчезает. */}
      <CategorySeoLive
        slug={category.slug}
        initialText={seoText}
        className="mb-8 max-w-[900px] text-sm leading-relaxed text-[var(--color-body)]"
      />

      <CatalogClient
        products={products}
        categories={categories}
        template={cfg.product_card_template}
        showVideos={cfg.card_video_enabled}
        initialCategory={category.slug}
      />
    </div>
  );
}
