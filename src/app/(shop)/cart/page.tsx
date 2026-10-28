"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { useT } from "@/components/texts/TextsProvider";
import { SmartImage } from "@/components/ui/SmartImg";

export default function CartPage() {
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const t = useT();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const totalKopecks = useMemo(
    () => lines.reduce((sum, l) => sum + l.product.price_kopecks * l.qty, 0),
    [lines]
  );
  const totalQty = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty, 0),
    [lines]
  );

  if (!mounted) {
    return <div className="mx-auto max-w-[1200px] px-4 py-10" />;
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-20 text-center">
        <h1 className="mb-4 text-[32px] font-medium text-[var(--color-heading)]">
          {t("cart_empty_h1")}
        </h1>
        <p className="mb-8 text-[var(--color-muted)]">
          {t("cart_empty_text")}
        </p>
        <Link
          href="/catalog"
          className="inline-flex items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-8 py-3 font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
        >
          {t("cart_empty_btn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <h1 className="mb-8 text-[32px] font-medium text-[var(--color-heading)]">
        {t("cart_h1")}
      </h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {lines.map((line) => {
            const cover = line.product.images[0];
            const sumKopecks = line.product.price_kopecks * line.qty;
            return (
              <div
                key={line.product.id}
                className="flex gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-4"
              >
                <Link
                  href={`/product/${line.product.slug}`}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-soft)]"
                >
                  {cover ? (
                    <SmartImage
                      src={cover.url}
                      alt={cover.alt || line.product.name}
                      fill
                      sizes="96px"
                      className="object-contain p-2"
                    />
                  ) : null}
                </Link>

                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <Link
                      href={`/product/${line.product.slug}`}
                      className="font-medium text-[var(--color-heading)] hover:text-[var(--color-primary)]"
                    >
                      {line.product.name}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {formatPrice(line.product.price_kopecks)} {t("cart_per_item")}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center rounded-[var(--radius-btn)] border border-[var(--color-border)]">
                      <button
                        type="button"
                        onClick={() => setQty(line.product.id, line.qty - 1)}
                        className="h-9 w-9 rounded-l-[var(--radius-btn)] text-lg text-[var(--color-primary)] hover:bg-[var(--color-bg-soft)]"
                        aria-label="Уменьшить"
                      >
                        −
                      </button>
                      <span className="w-10 text-center font-medium">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(line.product.id, line.qty + 1)}
                        className="h-9 w-9 rounded-r-[var(--radius-btn)] text-lg text-[var(--color-primary)] hover:bg-[var(--color-bg-soft)]"
                        aria-label="Увеличить"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="font-semibold text-[var(--color-heading)]">
                        {formatPrice(sumKopecks)}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(line.product.id)}
                        className="text-sm text-[var(--color-muted)] hover:text-red-500"
                        aria-label="Удалить"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={clear}
            className="text-sm text-[var(--color-muted)] hover:text-red-500"
          >
            {t("cart_clear")}
          </button>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--color-heading)]">
              {t("cart_total_label")}
            </h2>
            <div className="mb-2 flex justify-between text-sm text-[var(--color-body)]">
              <span>Товаров</span>
              <span>{totalQty} шт.</span>
            </div>
            <div className="mb-4 flex justify-between text-lg font-semibold text-[var(--color-heading)]">
              <span>Сумма</span>
              <span>{formatPrice(totalKopecks)}</span>
            </div>
            <p className="mb-4 text-xs text-[var(--color-muted)]">
              Доставка рассчитывается менеджером после оформления.
              Бесплатно по Хабаровску от 5 000 ₽.
            </p>
            <Link
              href="/checkout"
              className="block rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-3 text-center font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              {t("cart_checkout_btn")}
            </Link>
            <Link
              href="/catalog"
              className="mt-3 block text-center text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
            >
              Продолжить покупки
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}