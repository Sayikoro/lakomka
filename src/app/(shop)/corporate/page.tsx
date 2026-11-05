import Link from "next/link";
import type { Metadata } from "next";

import { staticPageMetadata } from "@/lib/seo";
import { DISCOUNTS } from "@/lib/company";
import { formatPrice } from "@/lib/utils";
import { SITE } from "@/lib/site";
import { LandingHead } from "@/components/shop/LandingHead";
import { FaqList } from "@/components/shop/FaqList";
import { CtaPanel } from "@/components/shop/CtaPanel";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { FaqJsonLd, type FaqItem } from "@/components/seo/FaqJsonLd";

/* ============================================================
   Task 147: лендинг кластера 3 — «Корпоративные подарки» (B2B).
   Запросы: «корпоративные подарки Хабаровск новогодние»,
   «новогодние подарки для сотрудников Хабаровск», «подарки
   клиентам на новый год», «новогодние подарки с логотипом».

   Только проверенные факты: собственное производство, скидки
   за объём из lib/company, документы (ООО, сертификат
   соответствия в футере), предоплата 20%. Условия нанесения
   логотипа и тиражей — через менеджера, без выдуманных цифр.
   ============================================================ */

export const metadata: Metadata = staticPageMetadata({
  title: "Корпоративные новогодние подарки в Хабаровске",
  description:
    "Корпоративные новогодние подарки в Хабаровске для сотрудников, клиентов и партнёров: сладкие наборы от собственного производства, скидки за объём до 10%, документы для юрлиц, доставка по городу. Обсудите заказ по телефону.",
  path: "/corporate",
});

const FAQ: FaqItem[] = [
  {
    question: "Можно ли заказать подарки с логотипом компании?",
    answer:
      "Да, обсудите с менеджером формат: открытки-вкладыши с фирменной символикой, наклейки на упаковку или другое оформление под ваш бренд. Тираж и стоимость нанесения менеджер рассчитает по вашему заданию.",
  },
  {
    question: "Какой минимальный тираж корпоративного заказа?",
    answer:
      "Собираем как небольшие партии для офиса, так и крупные заказы для предприятий. Точные условия по объёму и скидке зависят от состава наборов — позвоните, рассчитаем за несколько минут.",
  },
  {
    question: "Какие документы вы предоставляете юридическим лицам?",
    answer:
      "Работаем официально от ООО «Компания «Лакомка»: договор, счёт, закрывающие документы. На продукцию есть сертификат соответствия — копию предоставим по запросу.",
  },
  {
    question: "Как проходит оплата?",
    answer:
      "Стандартно — предоплата 20% от суммы заказа, остаток при получении. Возможен безналичный расчёт по счёту. При полной предоплате действует скидка 10%.",
  },
];

const UPS = [
  {
    title: "Собственное производство",
    text: "Свежие наборы собираем сами в Хабаровске — без посредников и пересортицы. Состав каждой позиции виден в каталоге.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-8 w-8">
        <path d="M12 21c4.4-1.8 8-5.4 8-10V5.5L12 3 4 5.5V11c0 4.6 3.6 8.2 8 10z" />
        <path d="M9 11.5l2 2 4-4.5" />
      </svg>
    ),
  },
  {
    title: "Оформление под вашу компанию",
    text: "Открытки-вкладыши с фирменной символикой и подписью, наклейки на упаковку, подарки в фирменных цветах — формат подскажет менеджер.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-8 w-8">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    title: "Скидки за объём — до 10%",
    text: "Чем больше заказ, тем ниже цена набора: 5% от 50 000 ₽, 7% от 100 000 ₽, 8% от 300 000 ₽, 10% при полной оплате.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-8 w-8">
        <path d="M20.6 13.4L11 3.8H4v7l9.6 9.6a2 2 0 002.8 0l4.2-4.2a2 2 0 000-2.8z" />
        <circle cx="7.5" cy="7.5" r="1.2" />
      </svg>
    ),
  },
  {
    title: "Документы и доставка",
    text: "Договор, счёт и закрывающие документы для бухгалтерии. Доставим по Хабаровску — бесплатно от 5 000 ₽, до подъезда офиса.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-8 w-8">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </svg>
    ),
  },
];

export default function CorporatePage() {
  return (
    <>
      <BreadcrumbJsonLd
        crumbs={[
          { name: "Главная", path: "/" },
          { name: "Корпоративные новогодние подарки", path: "/corporate" },
        ]}
      />
      <FaqJsonLd items={FAQ} />

      <LandingHead
        crumb="Корпоративным клиентам"
        h1="Корпоративные новогодние подарки в Хабаровске"
        lead="Сладкие подарки сотрудникам, клиентам и партнёрам от хабаровского производства «Лакомка». Подберём состав и упаковку под бюджет, оформим вкладыши с символикой компании, подготовим документы для бухгалтерии и доставим по городу."
      />

      {/* УТП */}
      <section className="mx-auto mt-10 max-w-[1200px] px-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {UPS.map((u) => (
            <div
              key={u.title}
              className="rounded-[var(--radius-card)] bg-[var(--color-bg)] p-6 transition-shadow hover:shadow-[0_12px_26px_-12px_rgba(0,0,0,0.18)]"
            >
              <div className="text-[var(--color-primary)]">{u.icon}</div>
              <h2 className="mt-3 text-[18px] font-semibold text-[var(--color-heading)]">
                {u.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
                {u.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Как заказываем — шаги */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <h2 className="text-[26px] font-medium text-[var(--color-heading)] sm:text-[30px]">
          Как заказать корпоративные подарки
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              t: "Заявка",
              d: "Позвоните или напишите в WhatsApp/МАКС: количество подарков, бюджет, пожелания по составу.",
            },
            {
              t: "Подбор состава",
              d: "Менеджер предложит наборы из каталога — от мешочков со сладостями до VIP-упаковки, покажет образцы.",
            },
            {
              t: "Согласование",
              d: "Зафиксируем состав, тираж и сроки, подготовим счёт. Предоплата — 20%, остаток при получении.",
            },
            {
              t: "Производство и доставка",
              d: "Собираем наборы и доставляем по Хабаровску до подъезда — бесплатно от 5 000 ₽.",
            },
          ].map((s, i) => (
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

      {/* Скидки за объём */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <div className="rounded-[var(--radius-card)] bg-[var(--color-bg)] px-6 py-7 sm:px-10">
          <h2 className="text-[22px] font-medium text-[var(--color-heading)] sm:text-[26px]">
            Скидки на корпоративные заказы
          </h2>
          <ul className="mt-4 space-y-2 text-[15px] text-[var(--color-body)]">
            {DISCOUNTS.map((d) => (
              <li key={d.percent} className="flex flex-wrap items-baseline gap-x-2">
                <b className="text-[var(--color-heading)]">{d.percent}%</b>
                <span>
                  {d.to === null
                    ? "note" in d && d.note
                      ? `— ${d.note}`
                      : `— при заказе свыше ${formatPrice(d.from)}`
                    : `— при заказе от ${formatPrice(d.from)} до ${formatPrice(d.to)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Скидки не суммируются и действуют на указанные условия.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <h2 className="text-center text-[26px] font-medium text-[var(--color-heading)] sm:text-[30px]">
          Частые вопросы о корпоративных подарках
        </h2>
        <FaqList items={FAQ} />
      </section>

      <CtaPanel
        title="Рассчитаем ваш заказ"
        note={`Назовите количество получателей и бюджет — предложим состав и посчитаем скидку. Телефоны и мессенджеры выше, почта ${SITE.email}.`}
      />

      {/* Перелинковка */}
      <section className="mx-auto mt-10 max-w-[1200px] px-4 pb-12">
        <p className="text-sm text-[var(--color-muted)]">
          Смотрите также:{" "}
          <Link href="/wholesale" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            оптовые закупки
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
