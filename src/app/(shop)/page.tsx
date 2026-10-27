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
      {/* Hero — скруглённый снизу, фоновая картинка, кастомные шрифты */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          borderRadius: "0 0 var(--radius-hero) var(--radius-hero)",
          backgroundImage: "url('/hero-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#0a0a0a",
        }}
      >
        {/* затемнение поверх фото, чтобы белый текст читался */}
        <div className="absolute inset-0 bg-black/40" aria-hidden />
        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-4 pb-16 pt-14 text-center">
          <p className="font-hero text-[42px] uppercase leading-[1.05] tracking-[4.6px] text-white sm:text-[52px]">
            новогодняя
          </p>
          <p className="font-hero text-[42px] uppercase leading-[1.05] tracking-[4.6px] text-white sm:text-[52px]">
            коллекция
          </p>
          <p className="font-display mt-2 text-[52px] leading-none text-white">
            2027
          </p>
          <Link
            href="/catalog"
            className="mt-10 inline-flex items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-[20px] text-[14px] font-semibold uppercase leading-[13px] text-white transition hover:bg-[var(--color-primary-hover)]"
            style={{ border: "2px solid transparent" }}
          >
            Каталог
          </Link>
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