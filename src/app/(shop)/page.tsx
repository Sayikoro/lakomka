import { InfoCards } from "@/components/home/InfoCards";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { ProcessSteps } from "@/components/home/ProcessSteps";
import { BrandLogos } from "@/components/home/BrandLogos";
import { Hero } from "@/components/home/Hero";
import { getPublicSettings, DEFAULT_FRONT_SETTINGS } from "@/lib/settings";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Новогодние подарки и наборы конфет в Хабаровске",
  description:
    "Подарочные наборы, VIP-подарки, конфеты от ведущих фабрик. Собственное производство. Доставка по Хабаровску от 5 000 ₽ бесплатно.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Лакомка — новогодние подарки 2027",
    description:
      "Подарочные наборы и конфеты с доставкой по Хабаровску. Скидки при крупных заказах.",
    url: "/",
  },
};

export default async function HomePage() {
  const cfg = await getPublicSettings();
  const heroImage = cfg.hero_image || DEFAULT_FRONT_SETTINGS.hero_image;

  return (
    <>
      {/* Hero — 90vh, прибит к верху; нижняя часть страницы «заезжает» поверх него */}
      <Hero
        image={heroImage}
        slides={cfg.hero_slides.map((s) => s.url)}
        slider={cfg.hero_slider_enabled}
      />

      {/* Контент, заезжающий на hero: выше слой, скругление сверху, тень */}
      <div className="relative z-10 rounded-t-[var(--radius-hero)] bg-[var(--color-bg-page)] shadow-[0_-18px_40px_-24px_rgba(0,0,0,0.5)]">
        {/* Info cards — СКИДКА / ДОСТАВКА / ОПЛАТА */}
        <section className="mx-auto max-w-[1200px] px-4 pt-10">
          <InfoCards />
        </section>

        {/* Categories */}
        <section className="mx-auto max-w-[1200px] px-4 py-12">
          <CategoryGrid />
        </section>

        {/* Process */}
        <section className="mx-auto max-w-[1200px] px-4 py-6">
          <ProcessSteps />
        </section>

        {/* Brands — full-bleed */}
        <BrandLogos />
      </div>
    </>
  );
}
