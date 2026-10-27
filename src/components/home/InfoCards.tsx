"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DISCOUNTS, DELIVERY, PAYMENT } from "@/lib/company";
import { mockIcons } from "@/lib/mock-data";
import { formatPrice } from "@/lib/utils";

type Key = "discount" | "delivery" | "payment" | null;

const CARDS = [
  { key: "discount", icon: mockIcons.discount, title: "СКИДКА",   subtitle: "Условия скидки"   },
  { key: "delivery", icon: mockIcons.delivery, title: "ДОСТАВКА", subtitle: "Условия доставки" },
  { key: "payment",  icon: mockIcons.payment,  title: "ОПЛАТА",   subtitle: "Условия оплаты"   },
] as const;

export function InfoCards() {
  const [open, setOpen] = useState<Key>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <button
            key={c.key}
            onClick={() => setOpen(c.key)}
            className="group flex items-center gap-5 rounded-[var(--radius-card)] bg-white p-[10px] text-left transition hover:shadow-md"
          >
            <img
              src={c.icon}
              alt=""
              width={60}
              height={60}
              loading="lazy"
              className="h-[60px] w-[60px] shrink-0"
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