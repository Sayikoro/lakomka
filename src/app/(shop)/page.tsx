import { InfoCards } from "@/components/home/InfoCards";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { ProcessSteps } from "@/components/home/ProcessSteps";
import { BrandLogos } from "@/components/home/BrandLogos";
import { Hero } from "@/components/home/Hero";
import { NewYearCounter } from "@/components/home/NewYearCounter";
import { timeUntilNewYearParts } from "@/lib/newyear";
import { getPublicSettings, DEFAULT_FRONT_SETTINGS } from "@/lib/settings";
import { getCategories, getProducts } from "@/lib/products";
import { parseGalleryShortcode, DEFAULT_BRANDS_GALLERY } from "@/lib/shortcode";
import { getGallery } from "@/lib/galleries";
import type { Metadata } from "next";

/* Task 147: главная оптимизирована под кластер 1 ядра —
   «новогодние подарки Хабаровск» + «сладкие подарки Хабаровск купить».
   Н1 главной — первая строка Hero (см. Hero.tsx). */
export const metadata: Metadata = {
  title: "Новогодние подарки в Хабаровске — купить сладкие подарки",
  description:
    "Купить новогодние сладкие подарки в Хабаровске: детские наборы конфет, VIP-подарки, корпоративные и оптовые закупки. Собственное производство, доставка по городу — бесплатно от 5 000 ₽.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Лакомка — новогодние подарки 2027 в Хабаровске",
    description:
      "Сладкие подарки и наборы конфет с доставкой по Хабаровску. Скидки при крупных заказах.",
    url: "/",
  },
};

export default async function HomePage() {
  const [cfg, products, categories] = await Promise.all([
    getPublicSettings(),
    getProducts(),
    getCategories(),
  ]);
  const heroImage = cfg.hero_image || DEFAULT_FRONT_SETTINGS.hero_image;

  /* Task 146: блок фабрик из галереи. Слаг — из настройки brands_gallery
     (шорткод [gallery слаг]); настройка пуста — дефолтная галерея fabriki.
     Снимок галереи запекается при сборке; BrandLogos после монтирования
     обновит его с живого API. Галереи нет — mock-логотипы внутри блока. */
  const brandsSlug =
    parseGalleryShortcode(cfg.brands_gallery) ?? DEFAULT_BRANDS_GALLERY;
  const brandsGallery = await getGallery(brandsSlug);

  return (
    <>
      {/* Hero — 90vh, прибит к верху; нижняя часть страницы «заезжает» поверх него.
          Снегопад (если включён) — только внутри этого блока. */}
      <Hero
        image={heroImage}
        slides={cfg.hero_slides.map((s) => s.url)}
        slider={cfg.hero_slider_enabled}
        snow={cfg.snow}
      />

      {/* Task 141: заезжающий контент поверх hero (скруглённые угла сверху). */}
      <div className="relative z-10 bg-[var(--color-bg-page)] shadow-[0_-18px_40px_-24px_rgba(0,0,0,0.5)]">
        <svg
          aria-hidden
          viewBox="0 0 80 80"
          className="pointer-events-none absolute bottom-full left-0 block h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 lg:h-20 lg:w-20"
        >
          <path d="M0 0 A80 80 0 0 0 80 80 L0 80 Z" style={{ fill: "var(--color-bg-page)" }} />
        </svg>
        <svg
          aria-hidden
          viewBox="0 0 80 80"
          className="pointer-events-none absolute bottom-full right-0 block h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 lg:h-20 lg:w-20"
        >
          <path d="M80 0 A80 80 0 0 1 0 80 L80 80 Z" style={{ fill: "var(--color-bg-page)" }} />
        </svg>
        {/* Task 141/143: плитки СКИДКА / ДОСТАВКА / ОПЛАТА — сразу под hero */}
        <section data-testid="home-info" className="mx-auto max-w-[1200px] px-4 pt-10">
          <InfoCards />
        </section>

        {/* Task 143: счётчик «До Нового года» — под плитками, выше категорий.
            Выключается галочкой в Настройках (запечённое значение + живая
            сверка после монтирования, как у hero/снегопада). */}
        <NewYearCounter
          enabled={cfg.newyear_counter_enabled}
          initialParts={timeUntilNewYearParts()}
        />

        {/* Categories — картинки рандомятся из товаров категории на каждый запрос */}
        <section data-testid="home-cats" className="mx-auto max-w-[1200px] px-4 py-12">
          <CategoryGrid categories={categories} products={products} />
        </section>

        {/* Process — full-bleed: фон-картинка от края до края, таймлайн внутри */}
        <ProcessSteps />

        {/* Brands — full-bleed. Task 146: логотипы из галереи (Файлы →
            Галерея, шорткод в Настройках), фолбэк — встроенный набор */}
        <BrandLogos
          gallerySlug={brandsSlug}
          initialItems={brandsGallery?.items ?? []}
        />
      </div>
    </>
  );
}
