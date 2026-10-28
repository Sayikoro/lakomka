"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DISCOUNTS, DELIVERY, PAYMENT } from "@/lib/company";
import { mockIcons } from "@/lib/mock-data";
import { formatPrice } from "@/lib/utils";
import { useT } from "@/components/texts/TextsProvider";
import { SmartImg } from "@/components/ui/SmartImg";

type Key = "discount" | "delivery" | "payment" | null;

export function InfoCards() {
  const [open, setOpen] = useState<Key>(null);
  const t = useT();

  const cards = [
    { key: "discount" as const, icon: mockIcons.discount, title: t("home_info1_title"), subtitle: t("home_info1_sub") },
    { key: "delivery" as const, icon: mockIcons.delivery, title: t("home_info2_title"), subtitle: t("home_info2_sub") },
    { key: "payment" as const, icon: mockIcons.payment, title: t("home_info3_title"), subtitle: t("home_info3_sub") },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => setOpen(c.key)}
            className="group flex items-center gap-5 rounded-[var(--radius-card)] bg-white p-[10px] text-left transition hover:shadow-md"
          >
            <SmartImg
              src={c.icon}
              alt=""
              width={60}
              height={60}
              loading="lazy"
              wrapperClassName="h-[60px] w-[60px] shrink-0"
              className="h-[60px] w-[60px]"
            />
            <div>
              <div className="text-[20px] font-semibold leading-tight text-black">
                {c.title}
              </div>
              <div className="mt-1 text-[16px] text-[var(--color-heading)]">
                {c.subtitle}
              </div>
            </div>
          </button>
        ))}
      </div>

      <Modal open={open === "discount"} onClose={() => setOpen(null)} title="Система скидок">
        <p className="mb-3">Мы ценим крупные заказы и предлагаем прозрачную систему экономии:</p>
        <ul className="mb-3 space-y-1.5">
          {DISCOUNTS.map((d) => (
            <li key={d.percent}>
              <b>{d.percent}%</b>{" — "}
              {d.to === null
                ? d.from === 0
                  ? (("note" in d) ? d.note : null)
                  : `при заказе свыше ${formatPrice(d.from)}`
                : `при заказе от ${formatPrice(d.from)} до ${formatPrice(d.to)}`}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--color-muted)]">
          Скидки не суммируются и действуют на указанные условия.
        </p>
      </Modal>

      <Modal open={open === "delivery"} onClose={() => setOpen(null)} title="Доставка">
        <p>Бесплатная доставка по Хабаровску при заказе от <b>{formatPrice(DELIVERY.freeThresholdKopecks)}</b>.</p>
        <p className="mt-2">При меньшей сумме — доставка оплачивается отдельно либо включается в стоимость подарков.</p>
        <p className="mt-2">За пределами города или края — по тарифам транспортной компании.</p>
        <p className="mt-2">Доставка «до подъезда». Выгрузка — силами заказчика.</p>
      </Modal>

      <Modal open={open === "payment"} onClose={() => setOpen(null)} title="Оплата">
        <p>При заказе клиент оплачивает <b>{PAYMENT.prepaymentPercent}%</b> от суммы.</p>
        <p className="mt-2">Оставшиеся <b>{100 - PAYMENT.prepaymentPercent}%</b> — при получении заказа.</p>
        <p className="mt-2">Способы оплаты: <b>{PAYMENT.methods.join(", ")}</b>.</p>
      </Modal>
    </>
  );
}