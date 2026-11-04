import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCategories, getProducts } from "@/lib/products";
import { getPublicSettings } from "@/lib/settings";
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

  const title = cat.meta_title?.trim() || `${cat.name} — каталог подарков`;
  const description =
    cat.meta_description?.trim() ||
    `Подарки категории «${cat.name}» с доставкой по Хабаровску. Собственное производство, новогодние наборы и конфеты от ведущих фабрик.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/catalog/${cat.slug}`,
    },
    openGraph: {
      title,
      description,
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

      <h1 className="mb-6 text-[40px] font-medium text-[var(--color-heading)]">
        {category.name}
      </h1>

      {seoText && (
        <div
          data-testid="category-seo-text"
          className="mb-8 max-w-[900px] whitespace-pre-line text-sm leading-relaxed text-[var(--color-body)]"
        >
          {seoText}
        </div>
      )}

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
