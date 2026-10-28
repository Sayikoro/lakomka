import Link from "next/link";
import type { Product } from "@/lib/types";
import type { Category } from "@/lib/products";
import { mockCategories } from "@/lib/mock-data";
import { SmartImage } from "@/components/ui/SmartImg";

interface CategoryGridProps {
  categories: Category[];
  products: Product[];
}

export function CategoryGrid({ categories, products }: CategoryGridProps) {
  /* Пул картинок на категорию: первая (главная) картинка каждого товара.
     Пересобирается на каждый запрос → выбор random даёт новую картинку
     при каждой загрузке страницы. */
  const poolByCategory = new Map<number, string[]>();
  for (const p of products) {
    if (p.category_id == null) continue;
    const img = p.images[0]?.url;
    if (!img) continue;
    const pool = poolByCategory.get(p.category_id);
    if (pool) pool.push(img);
    else poolByCategory.set(p.category_id, [img]);
  }

  /* Фолбэк для категорий без товаров (например «Тубы») — прежние мок-картинки */
  const mockBySlug = new Map(mockCategories.map((c) => [c.slug, c.imageUrl]));
  const pickRandom = (arr: string[]): string =>
    arr[Math.floor(Math.random() * arr.length)];

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {categories.map((cat) => {
        const pool = poolByCategory.get(cat.id);
        const imageUrl =
          pool && pool.length > 0
            ? pickRandom(pool)
            : mockBySlug.get(cat.slug) ?? mockCategories[0].imageUrl;
        return (
          <Link
            key={cat.slug}
            href={`/catalog?category=${cat.slug}`}
            className="group relative mx-auto flex w-full max-w-[240px] flex-col transition hover:-translate-y-0.5"
          >
            <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-soft)]">
              <SmartImage
                src={imageUrl}
                alt={cat.name}
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 240px"
                className="object-contain p-5 transition group-hover:scale-105"
              />
              <span
                aria-hidden
                className="absolute bottom-0 right-0 z-20 flex h-[71px] w-[71px] items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] text-white transition group-hover:bg-[var(--color-primary-hover)]"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </span>
            </div>
            <h3 className="mt-3 text-center text-[24px] font-medium uppercase leading-tight text-[var(--color-heading)]">
              {cat.name}
            </h3>
          </Link>
        );
      })}
    </div>
  );
}
