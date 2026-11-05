import Link from "next/link";
import type { Metadata } from "next";

import { staticPageMetadata } from "@/lib/seo";
import { DELIVERY, PAYMENT, COMPANY, DISCOUNTS } from "@/lib/company";
import { formatPrice } from "@/lib/utils";
import { LandingHead } from "@/components/shop/LandingHead";
import { FaqList } from "@/components/shop/FaqList";
import { CtaPanel } from "@/components/shop/CtaPanel";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { FaqJsonLd, type FaqItem } from "@/components/seo/FaqJsonLd";

/* ============================================================
   Task 147: лендинг кластера 6 — «Доставка и оплата».
   Запросы: «доставка новогодних подарков Хабаровск»,
   «новогодние подарки с доставкой», «заказать новогодний
   подарок».

   Только проверенные факты из lib/company и чекаута:
   способы доставки (самовывоз / по городу / за городом / ТК),
   бесплатный порог 5 000 ₽, «до подъезда», предоплата 20%,
   способы оплаты (наличные / безнал / СБП).
   ============================================================ */

export const metadata: Metadata = staticPageMetadata({
  title: "Доставка и оплата",
  description:
    "Доставка новогодних подарков по Хабаровску — бесплатно от 5 000 ₽, «до подъезда». Самовывоз с производства, отправка транспортными компаниями. Предоплата 20%, оплата наличными, по счёту или через СБП.",
  path: "/delivery",
});

const FAQ: FaqItem[] = [
  {
    question: "Сколько стоит доставка по Хабаровску?",
    answer: `При заказе от ${formatPrice(DELIVERY.freeThresholdKopecks)} доставка по городу бесплатная. При меньшей сумме доставка оплачивается отдельно либо включается в стоимость подарков — менеджер назовёт точную сумму при согласовании.`,
  },
  {
    question: "Как получить заказ?",
    answer: `Самовывоз со производства: ${COMPANY.address}. Или доставка курьером — по Хабаровску «до подъезда», выгрузка силами заказчика. За городом и в районы края — транспортной компанией.`,
  },
  {
    question: "Когда привезёте заказ?",
    answer:
      "День и время доставки согласовываем с вами при подтверждении заказа — заранее, по телефону или в мессенджере.",
  },
  {
    question: "Как можно оплатить заказ?",
    answer: `Предоплата ${PAYMENT.prepaymentPercent}% от суммы, остаток — при получении. Способы оплаты: ${PAYMENT.methods.join(", ")}. Юридическим лицам выставляем счёт. При полной предоплате — скидка 10%.`,
  },
  {
    question: "Отправляете в другие города?",
    answer:
      "Да, за пределами Хабаровска отправляем транспортными компаниями — по их тарифам. Упаковываем партии так, чтобы подарки доехали без повреждений.",
  },
];

export default function DeliveryPage() {
  return (
    <>
      <BreadcrumbJsonLd
        crumbs={[
          { name: "Главная", path: "/" },
          { name: "Доставка и оплата", path: "/delivery" },
        ]}
      />
      <FaqJsonLd items={FAQ} />

      <LandingHead
        crumb="Доставка и оплата"
        h1="Доставка и оплата"
        lead="Доставляем новогодние подарки по Хабаровску, отправляем за город и в районы края транспортными компаниями. Ниже — способы получения, условия и варианты оплаты. Заказать можно по телефону или прямо на сайте."
      />

      {/* Доставка */}
      <section className="mx-auto mt-10 max-w-[1200px] px-4">
        <h2 className="text-[26px] font-medium text-[var(--color-heading)] sm:text-[30px]">
          Доставка новогодних подарков
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--radius-card)] bg-[var(--color-bg)] p-6">
            <h3 className="text-[18px] font-semibold text-[var(--color-heading)]">
              По Хабаровску
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
              Бесплатно при заказе от{" "}
              <b>{formatPrice(DELIVERY.freeThresholdKopecks)}</b>. При меньшей
              сумме доставка оплачивается отдельно либо включается в стоимость
              подарков. Доставка «до подъезда», выгрузка — силами заказчика.
            </p>
          </div>
          <div className="rounded-[var(--radius-card)] bg-[var(--color-bg)] p-6">
            <h3 className="text-[18px] font-semibold text-[var(--color-heading)]">
              Самовывоз
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
              Заберите заказ самостоятельно: {COMPANY.address}. Согласуем время
              заранее — заказ будет собран и ждать вас.
            </p>
          </div>
          <div className="rounded-[var(--radius-card)] bg-[var(--color-bg)] p-6">
            <h3 className="text-[18px] font-semibold text-[var(--color-heading)]">
              За городом
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
              Доставляем и за пределы города. Условия и стоимость согласуйте с
              менеджером при оформлении заказа.
            </p>
          </div>
          <div className="rounded-[var(--radius-card)] bg-[var(--color-bg)] p-6">
            <h3 className="text-[18px] font-semibold text-[var(--color-heading)]">
              Транспортной компанией
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
              Отправляем заказы в районы края и другие города — по тарифам
              транспортной компании. Надёжно упаковываем партии к перевозке.
            </p>
          </div>
        </div>
      </section>

      {/* Оплата */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <h2 className="text-[26px] font-medium text-[var(--color-heading)] sm:text-[30px]">
          Оплата
        </h2>
        <div className="mt-5 rounded-[var(--radius-card)] bg-[var(--color-bg)] px-6 py-7 sm:px-10">
          <ul className="space-y-3 text-[15px] leading-relaxed text-[var(--color-body)]">
            <li>
              <b className="text-[var(--color-heading)]">
                Предоплата {PAYMENT.prepaymentPercent}%
              </b>{" "}
              — при заказе вы оплачиваете {PAYMENT.prepaymentPercent}% от суммы,
              остальные {100 - PAYMENT.prepaymentPercent}% — при получении
              заказа.
            </li>
            <li>
              <b className="text-[var(--color-heading)]">Способы оплаты:</b>{" "}
              {PAYMENT.methods.join(", ")}.
            </li>
            <li>
              <b className="text-[var(--color-heading)]">Юридическим лицам</b> —
              счёт и закрывающие документы, безналичный расчёт.
            </li>
            <li>
              <b className="text-[var(--color-heading)]">Полная предоплата</b> —
              скидка 10% на заказ.
            </li>
          </ul>
        </div>
      </section>

      {/* Скидки */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4">
        <div className="rounded-[var(--radius-card)] bg-[var(--color-bg)] px-6 py-7 sm:px-10">
          <h2 className="text-[22px] font-medium text-[var(--color-heading)] sm:text-[26px]">
            Скидки при крупном заказе
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
          Частые вопросы о доставке и оплате
        </h2>
        <FaqList items={FAQ} />
      </section>

      <CtaPanel
        title="Оформить заказ с доставкой"
        note="Соберём, согласуем дату и привезём по Хабаровску — или подготовим к самовывозу и отправке в ваш город."
      />

      {/* Перелинковка */}
      <section className="mx-auto mt-10 max-w-[1200px] px-4 pb-12">
        <p className="text-sm text-[var(--color-muted)]">
          Смотрите также:{" "}
          <Link href="/catalog" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            каталог подарков
          </Link>
          {" · "}
          <Link href="/corporate" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            корпоративным клиентам
          </Link>
          {" · "}
          <Link href="/wholesale" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            оптовые закупки
          </Link>
        </p>
      </section>
    </>
  );
}
