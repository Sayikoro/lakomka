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

      {/* Контент, заезжающий на hero: выше слой, тень. Вырез «наружу»:
          вогнутые сопряжения уходят к краям экрана вверх, картинка
          по бокам не торчит, а плавно срезается вырезом */}
      <div className="relative z-10 bg-[var(--color-bg-page)] shadow-[0_-18px_40px_-24px_rgba(0,0,0,0.5)]">
        <svg
          aria-hidden
          width="80"
          height="80"
          viewBox="0 0 80 80"
          className="pointer-events-none absolute bottom-full left-0 block"
        >
          <path d="M0 0 A80 80 0 0 0 80 80 L0 80 Z" style={{ fill: "var(--color-bg-page)" }} />
        </svg>
        <svg
          aria-hidden
          width="80"
          height="80"
          viewBox="0 0 80 80"
          className="pointer-events-none absolute bottom-full right-0 block"
        >
          <path d="M80 0 A80 80 0 0 1 0 80 L80 80 Z" style={{ fill: "var(--color-bg-page)" }} />
        </svg>
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
