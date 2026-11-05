import Link from "next/link";
import type { Metadata } from "next";

import { getCategories, getProducts } from "@/lib/products";
import { getPublicSettings } from "@/lib/settings";
import { staticPageMetadata } from "@/lib/seo";
import { DELIVERY } from "@/lib/company";
import { formatPrice } from "@/lib/utils";
import { SITE } from "@/lib/site";
import { LandingHead } from "@/components/shop/LandingHead";
import { FaqList } from "@/components/shop/FaqList";
import { CtaPanel } from "@/components/shop/CtaPanel";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { FaqJsonLd, type FaqItem } from "@/components/seo/FaqJsonLd";
import { CatalogClient } from "../catalog/CatalogClient";

/* ============================================================
   Task 147: лендинг кластера 2 — «Детские подарки» (B2C).
   Запросы: «детские новогодние подарки Хабаровск», «сладкий
   подарок ребенку Хабаровск», «новогодние подарки детям
   купить», «подарок ребенку на новый год».

   Формат: SEO-текст + полный каталог с живыми фильтрами
   (упаковка, вес, цена, сортировка) — те же карточки, что и в
   /catalog. Товары запекаются при сборке и подтягиваются
   живьём (CatalogClient умеет сам).
   ============================================================ */

export const metadata: Metadata = staticPageMetadata({
  title: "Детские новогодние подарки в Хабаровске",
  description:
    "Детские новогодние подарки в Хабаровске: сладкие наборы конфет с игрушками в мешочках, тубах и коробках. Купить подарок ребёнку на Новый год — для утренников, сада и школы. Доставка по городу, бесплатно от 5 000 ₽.",
  path: "/detskie",
});

const FAQ: FaqItem[] = [
  {
    question: "Какой детский подарок выбрать?",
    answer:
      "Малышам обычно берут наборы в мешочках и мягкой упаковке, детям постарше — тубы и коробки с игрушкой внутри. Подскажите возраст ребёнка и бюджет — менеджер предложит подходящие наборы из каталога.",
  },
  {
    question: "Что внутри сладких подарков?",
    answer:
      "Конфеты известных фабрик, карамель, вафли и другие сладости — состав каждого набора указан в карточке товара. Во многие наборы добавлена игрушка или новогодняя мелочь.",
  },
  {
    question: "Можно купить подарки сразу на весь класс или группу?",
    answer:
      "Да, так заказывают чаще всего. Соберём одинаковые наборы на всех детей по единой цене, при объёме действует скидка. Подробности — на странице «Оптовые закупки».",
  },
  {
    question: "Как получить заказ?",
    answer: `Самовывоз с производства или доставка по Хабаровску — бесплатно от ${formatPrice(DELIVERY.freeThresholdKopecks)}. Детали — на странице «Доставка и оплата».`,
  },
];

export default async function DetskiePage() {
  const [products, categories, cfg] = await Promise.all([
    getProducts(),
    getCategories(),
    getPublicSettings(),
  ]);

  return (
    <>
      <BreadcrumbJsonLd
        crumbs={[
          { name: "Главная", path: "/" },
          { name: "Детские новогодние подарки", path: "/detskie" },
        ]}
      />
      <FaqJsonLd items={FAQ} />

      <LandingHead
        crumb="Детские подарки"
        h1="Детские новогодние подарки в Хабаровске"
        lead="Сладкие подарки детям на Новый год: наборы конфет с игрушками — для утренников в саду и школе, подарков детям сотрудников и родственникам. Собственное производство «Лакомки», свежие составы, цены без посредников."
      />

      {/* SEO-текст кластера 2 — естественные вхождения, без спама */}
      <section className="mx-auto mt-8 max-w-[1200px] px-4">
        <div className="max-w-[900px] space-y-3 text-sm leading-relaxed text-[var(--color-body)]">
          <p>
            В каталоге ниже — все детские наборы «Лакомки»: сладкие мешочки и
            тубы для малышей, коробки с игрушками для школьников, VIP-варианты
            для особого повода. Пользуйтесь фильтрами по упаковке, весу и цене
            — подбор на любой бюджет занимает пару минут.
          </p>
          <p>
            Каждый сладкий подарок ребёнку собирается на нашем производстве в
            Хабаровске из конфет известных фабрик — состав набора указан в
            карточке товара. Нужны подарки сразу на весь класс или группу? Мы
            соберём одинаковые наборы по единой цене и привезём{" "}
            <Link
              href="/delivery"
              className="text-[var(--color-primary)] underline-offset-4 hover:underline"
            >
              с доставкой по городу
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Каталог — те же живые карточки и фильтры, что в /catalog */}
      <section className="mx-auto mt-8 max-w-[1360px] px-4">
        <h2 className="sr-only">Каталог детских новогодних подарков</h2>
        <CatalogClient
          products={products}
          categories={categories}
          template={cfg.product_card_template}
          showVideos={cfg.card_video_enabled}
        />
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <h2 className="text-center text-[26px] font-medium text-[var(--color-heading)] sm:text-[30px]">
          Частые вопросы о детских подарках
        </h2>
        <FaqList items={FAQ} />
      </section>

      <CtaPanel
        title="Поможем выбрать подарок ребёнку"
        note={`Скажите возраст и бюджет — предложим наборы. Телефоны и мессенджеры выше, почта ${SITE.email}.`}
      />

      {/* Перелинковка */}
      <section className="mx-auto mt-10 max-w-[1200px] px-4 pb-12">
        <p className="text-sm text-[var(--color-muted)]">
          Смотрите также:{" "}
          <Link href="/wholesale" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            оптовые закупки для школ и садов
          </Link>
          {" · "}
          <Link href="/corporate" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            корпоративным клиентам
          </Link>
          {" · "}
          <Link href="/catalog" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            полный каталог
          </Link>
        </p>
      </section>
    </>
  );
}
