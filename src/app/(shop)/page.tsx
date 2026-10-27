import Link from "next/link";
import { InfoCards } from "@/components/home/InfoCards";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { ProcessSteps } from "@/components/home/ProcessSteps";
import { BrandLogos } from "@/components/home/BrandLogos";
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
export default function HomePage() {
  return (
    <>
      {/* Hero — во всю высоту экрана, текст справа, затемнение, кнопка */}
      <section
        className="relative flex min-h-[100svh] items-center overflow-hidden text-white"
        style={{
          borderRadius: "0 0 var(--radius-hero) var(--radius-hero)",
          backgroundImage: "url('/hero-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#0a0a0a",
        }}
      >
        {/* затемнение поверх фото: сильнее справа, где текст */}
        <div
          className="absolute inset-0 bg-gradient-to-l from-black/60 via-black/35 to-black/10"
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-[1200px] px-4 py-20">
          <div className="flex flex-col items-end text-right">
            <p className="font-hero text-[42px] uppercase leading-[1.05] tracking-[4.6px] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[64px] sm:tracking-[6px]">
              новогодняя
            </p>
            <p className="font-hero text-[42px] uppercase leading-[1.05] tracking-[4.6px] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[64px] sm:tracking-[6px]">
              коллекция
            </p>
            <p className="font-display mt-3 text-[52px] leading-none text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[84px]">
              2027
            </p>
            <Link
              href="/catalog"
              className="mt-10 inline-flex items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-8 py-[20px] text-[14px] font-semibold uppercase leading-[13px] text-white transition hover:bg-[var(--color-primary-hover)]"
              style={{ border: "2px solid transparent" }}
            >
              Каталог
            </Link>
          </div>
        </div>
      </section>

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
    </>
  );
}