"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCart } from "@/store/cart";
import { formatPrice } from "@/lib/utils";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

/* Современная корзина-шторка: выезжает справа, позиции сверху вниз,
   внизу — «Оформить заказ». Пустая корзина — «Пусто».
   Портал в body: иначе fixed-шторка остаётся в stacking-контексте шапки. */
export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const total = useCart((s) => s.totalKopecks());

  // Esc — закрыть; блокировка прокрутки фона на время шторки
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[80] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      {/* Затемнение */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 invisible"
        }`}
      />

      {/* Панель справа */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Корзина"
        className={`absolute right-0 top-0 flex h-full w-[420px] max-w-[92vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full invisible"
        }`}
      >
        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
          <h3 className="text-[18px] font-semibold text-[var(--color-heading)]">
            Корзина
            {lines.length > 0 && (
              <span className="ml-2 text-[13px] font-normal text-[var(--color-muted)]">
                {lines.reduce((sum, l) => sum + l.qty, 0)} шт.
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--color-bg-soft)] text-[var(--color-heading)] transition hover:bg-[var(--color-border)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {lines.length === 0 ? (
          /* Пустая корзина */
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[24px] font-semibold text-[var(--color-muted)]">Пусто</p>
          </div>
        ) : (
          <>
            {/* Позиции: сверху вниз */}
            <ul className="flex-1 divide-y divide-[var(--color-border)] overflow-y-auto px-4">
              {lines.map((l) => {
                const img =
                  l.product.media?.find((m) => m.type === "image")?.url ?? null;
                return (
                  <li key={l.product.id} className="flex gap-3 py-4">
                    {/* Миниатюра */}
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt=""
                          className="h-full w-full select-none object-contain p-1"
                          loading="lazy"
                        />
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--color-border)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
                          <circle cx="17.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
                          <path d="M2.5 3.5h2.2l2.5 12h11.2l2.1-8.6H6.1" />
                        </svg>
                      )}
                    </div>

                    {/* Название, цена, количество */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/product/${l.product.slug}`}
                          onClick={onClose}
                          className="line-clamp-2 break-words text-[13px] font-medium leading-snug text-[var(--color-heading)] underline-offset-2 hover:underline"
                        >
                          {l.product.name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(l.product.id)}
                          aria-label={`Убрать «${l.product.name}» из корзины`}
                          title="Убрать"
                          className="shrink-0 cursor-pointer rounded-full p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-heading)]"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        {/* Степпер количества */}
                        <div className="inline-flex items-center rounded-full border border-[var(--color-border)]">
                          <button
                            type="button"
                            onClick={() => setQty(l.product.id, l.qty - 1)}
                            aria-label="Уменьшить количество"
                            className="grid h-8 w-8 cursor-pointer place-items-center rounded-l-full text-[var(--color-primary)] transition hover:bg-[var(--color-bg-soft)]"
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-[13px] font-semibold text-[var(--color-heading)]">
                            {l.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty(l.product.id, l.qty + 1)}
                            aria-label="Увеличить количество"
                            className="grid h-8 w-8 cursor-pointer place-items-center rounded-r-full text-[var(--color-primary)] transition hover:bg-[var(--color-bg-soft)]"
                          >
                            +
                          </button>
                        </div>
                        {/* Сумма позиции */}
                        <span className="text-[14px] font-semibold text-[var(--color-heading)]">
                          {formatPrice(l.product.price_kopecks * l.qty)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Низ: итого + оформить заказ */}
            <div className="border-t border-[var(--color-border)] px-6 py-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[14px] text-[var(--color-muted)]">Итого</span>
                <span className="text-[20px] font-semibold text-[var(--color-heading)]">
                  {formatPrice(total)}
                </span>
              </div>
              <Link
                href="/checkout"
                onClick={onClose}
                className="block w-full cursor-pointer rounded-full bg-[var(--color-primary)] py-[15px] text-center text-[13px] font-bold uppercase tracking-[0.06em] text-white shadow-[0_14px_30px_-10px_rgba(0,0,0,0.75)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
              >
                Оформить заказ
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body
  );
}
