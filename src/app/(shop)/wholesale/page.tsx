import Link from "next/link";
import type { Metadata } from "next";

import { staticPageMetadata } from "@/lib/seo";
import { DELIVERY, PAYMENT } from "@/lib/company";
import { formatPrice } from "@/lib/utils";
import { SITE } from "@/lib/site";
import { LandingHead } from "@/components/shop/LandingHead";
import { FaqList } from "@/components/shop/FaqList";
import { CtaPanel } from "@/components/shop/CtaPanel";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { FaqJsonLd, type FaqItem } from "@/components/seo/FaqJsonLd";

/* ============================================================
   Task 147: лендинг кластера 4 — «Оптовые закупки» (B2B,
   школы, детские сады, родительские комитеты).
   Запросы: «новогодние подарки оптом Хабаровск», «детские
   подарки оптом», «подарки для детского сада оптом»,
   «подарки для школы оптом».

   Только проверенные факты: производство в Хабаровске,
   скидки (см. /corporate), бесплатная доставка от
   DELIVERY.freeThresholdKopecks, предоплата 20%, способы
   оплаты PAYMENT.methods. Минимальная партия — через
   менеджера, без выдуманных цифр.
   ============================================================ */

export const metadata: Metadata = staticPageMetadata({
  title: "Новогодние подарки оптом в Хабаровске",
  description:
    "Новогодние сладкие подарки оптом в Хабаровске для школ, детских садов, родительских комитетов и организаций. Собственное производство, скидки за объём, корректировка заказа до отправки, доставка по городу бесплатно от 5 000 ₽.",
  path: "/wholesale",
});

const FAQ: FaqItem[] = [
  {
    question: "Какой минимальный объём оптовой закупки?",
    answer:
      "Мы работаем и с небольшими партиями, и с крупными тиражами. Условия и скидку по вашему объёму менеджер рассчитает сразу после заявки — позвоните или напишите в мессенджер.",
  },
  {
    question: "Можно ли смешать разные наборы в одной закупке?",
    answer:
      "Да. В заказ можно включить наборы из разных категорий каталога — например, мешочки для младших классов и коробки для старших. Состав согласуем до запуска в производство.",
  },
  {
    question: "Можно ли изменить заказ после согласования?",
    answer:
      "Состав и количество можно скорректировать до отправки заказа — сообщите менеджеру заранее, и мы внесём изменения.",
  },
  {
    question: "Как оплатить оптовый заказ?",
    answer: `Предоплата ${PAYMENT.prepaymentPercent}% от суммы, остаток — при получении. Способы оплаты: ${PAYMENT.methods.join(", ")}. Юридическим лицам выставим счёт.`,
  },
  {
    question: "Вы доставляете большие партии?",
    answer: `Да, доставим по Хабаровску — бесплатно от ${formatPrice(DELIVERY.freeThresholdKopecks)}. Доставка «до подъезда», выгрузка силами заказчика. За город и в районы края — транспортной компанией.`,
  },
];

const STEPS = [
  {
    t: "Собираем заявку",
    d: "Родительский комитет или организация выбирает ориентировочное количество подарков и бюджет на человека.",
  },
  {
    t: "Согласуем состав",
    d: "Менеджер подбирает наборы из каталога под бюджет, показывает образцы и фиксирует итоговый список.",
  },
  {
    t: "Предоплата 20%",
    d: `После согласования выставляем счёт: предоплата ${PAYMENT.prepaymentPercent}%, остаток — при получении. Скидка за объём — сразу в расчёте.`,
  },
  {
    t: "Получение",
    d: "Собираем подарки к согласованной дате. Забирайте самовывозом или закажите доставку по городу.",
  },
];

export default function WholesalePage() {
  return (
    <>
      <BreadcrumbJsonLd
        crumbs={[
          { name: "Главная", path: "/" },
          { name: "Оптовые закупки", path: "/wholesale" },
        ]}
      />
      <FaqJsonLd items={FAQ} />

      <LandingHead
        crumb="Оптовые закупки"
        h1="Новогодние подарки оптом в Хабаровске"
        lead="Оптовые поставки сладких подарков для школ, детских садов, родительских комитетов и организаций. Собственное производство в Хабаровске: без посредников, свежие наборы и цены ниже розничных при заказе объёма."
      />

      {/* Преимущества опта */}
      <section className="mx-auto mt-10 max-w-[1200px] px-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              t: "Цены от производителя",
              d: "Наборы собираем сами — оптовая цена без наценок перекупщиков, скидки за объём до 10%.",
            },
            {
              t: "Школам и детским садам",
              d: "Подберём подарки по возрастам: мешочки и тубы для малышей, наборы с игрушками — для постарше.",
            },
            {
              t: "Резерв и корректировка",
              d: "Зафиксируем состав и объём, а количество уточним ближе к дате — заказ можно скорректировать до отправки.",
            },
          ].map((u) => (
            <div
              key={u.t}
              className="rounded-[var(--radius-card)] bg-[var(--color-bg)] p-6 transition-shadow hover:shadow-[0_12px_26px_-12px_rgba(0,0,0,0.18)]"
            >
              <h2 className="text-[18px] font-semibold text-[var(--color-heading)]">
                {u.t}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
                {u.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Как проходит оптовая закупка */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <h2 className="text-[26px] font-medium text-[var(--color-heading)] sm:text-[30px]">
          Как проходит оптовая закупка
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.t}
              className="rounded-[var(--radius-card)] bg-[var(--color-bg)] p-5"
            >
              <div className="text-[28px] font-semibold leading-none text-[var(--color-primary)]">
                {i + 1}
              </div>
              <h3 className="mt-2 text-[16px] font-semibold text-[var(--color-heading)]">
                {s.t}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-body)]">
                {s.d}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Родительским комитетам — акцентный блок */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <div className="rounded-[var(--radius-card)] bg-[var(--color-bg)] px-6 py-7 sm:px-10">
          <h2 className="text-[22px] font-medium text-[var(--color-heading)] sm:text-[26px]">
            Родительским комитетам — подарки в класс и группу
          </h2>
          <p className="mt-3 max-w-[900px] text-[15px] leading-relaxed text-[var(--color-body)]">
            Помогаем собрать новогодние подарки сразу на весь класс или группу:
            предложим несколько вариантов наборов под разный бюджет, чтобы
            родители выбрали один. В каталоге есть упаковки, которые любят
            дети, — мешочки, тубы и наборы с игрушками, — и «взрослые»
            варианты для учителей и воспитателей. Сладости — конфеты
            известных фабрик, состав наборов согласовываем заранее.
          </p>
          <p className="mt-3 max-w-[900px] text-[15px] leading-relaxed text-[var(--color-body)]">
            Документы для организации: договор, счёт, закрывающие документы,
            сертификат соответствия на продукцию. Доставка партии по
            Хабаровску — бесплатно от {formatPrice(DELIVERY.freeThresholdKopecks)}.
          </p>
          <p className="mt-4">
            <Link
              href="/catalog"
              className="inline-block rounded-full bg-[var(--color-primary)] px-6 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              Выбрать наборы в каталоге
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <h2 className="text-center text-[26px] font-medium text-[var(--color-heading)] sm:text-[30px]">
          Частые вопросы об оптовых закупках
        </h2>
        <FaqList items={FAQ} />
      </section>

      <CtaPanel
        title="Запросить расчёт оптом"
        note={`Напишите количество подарков и бюджет на один набор — пришлём подборку и посчитаем скидку. Почта ${SITE.email}, телефоны выше.`}
      />

      {/* Перелинковка */}
      <section className="mx-auto mt-10 max-w-[1200px] px-4 pb-12">
        <p className="text-sm text-[var(--color-muted)]">
          Смотрите также:{" "}
          <Link href="/corporate" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            корпоративным клиентам
          </Link>
          {" · "}
          <Link href="/detskie" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            детские новогодние подарки
          </Link>
          {" · "}
          <Link href="/delivery" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            доставка и оплата
          </Link>
        </p>
      </section>
    </>
  );
}
