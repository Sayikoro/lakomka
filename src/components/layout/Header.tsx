"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/store/cart";
import { ContactDrawer } from "@/components/home/ContactDrawer";

export function Header() {
  const lines = useCart((s) => s.lines);
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  // Esc — закрыть бургер
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const navLinkCls =
    "text-[var(--color-body)] transition-colors hover:text-[var(--color-primary)]";

  /* Корзина с бейджем — одна и та же в ПК-навигации и в мобильной панели */
  const cartLink = (
    <Link
      href="/cart"
      aria-label="Корзина"
      title="Корзина"
      className={`relative flex items-center ${navLinkCls}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="20" r="1.4" fill="currentColor" stroke="none" />
        <path d="M2.5 3.5h2.2l2.5 12h11.2l2.1-8.6H6.1" />
      </svg>
      {mounted && totalQty > 0 && (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-1 text-xs font-bold text-white">
          {totalQty}
        </span>
      )}
    </Link>
  );

  return (
    <header className="relative z-40 border-b border-[var(--color-border)] bg-white">
      <div className="mx-auto flex h-[70px] max-w-[1200px] items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold text-[var(--color-heading)]">
          Лакомка
        </Link>

        {/* ПК — инлайн-навигация */}
        <nav className="hidden items-center gap-6 lg:flex">
          <Link href="/catalog" className={navLinkCls}>
            Подарки
          </Link>
          <Link href="/catalogs" className={navLinkCls}>
            Скачать каталоги
          </Link>
          {cartLink}
        </nav>

        {/* Телефон/планшет — корзина и бургер */}
        <div className="flex items-center gap-2 lg:hidden">
          {cartLink}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[var(--color-heading)] transition hover:bg-[var(--color-bg-soft)]"
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Выпадающая панель бургер-меню (телефон/планшет) */}
      {menuOpen && (
        <>
          {/* Подложка ниже шапки: клик вне меню закрывает его */}
          <div
            aria-hidden
            onClick={() => setMenuOpen(false)}
            className="fixed inset-x-0 bottom-0 top-[70px] z-30 bg-black/25 lg:hidden"
          />
          <div className="absolute inset-x-0 top-full z-40 border-b border-[var(--color-border)] bg-white shadow-[0_20px_34px_-20px_rgba(0,0,0,0.4)] lg:hidden">
            <nav className="mx-auto flex max-w-[1200px] flex-col px-4 pb-5 pt-1">
              <Link
                href="/catalog"
                onClick={() => setMenuOpen(false)}
                className="border-b border-[var(--color-border)] py-3.5 text-[16px] text-[var(--color-body)]"
              >
                Подарки
              </Link>
              <Link
                href="/catalogs"
                onClick={() => setMenuOpen(false)}
                className="border-b border-[var(--color-border)] py-3.5 text-[16px] text-[var(--color-body)]"
              >
                Скачать каталоги
              </Link>
              {/* Кнопка «Связаться с нами» — как в таймлайне: круглая, синяя, uppercase */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setContactOpen(true);
                }}
                className="mt-5 cursor-pointer self-start rounded-full bg-[var(--color-primary)] px-8 py-[15px] text-[13px] font-bold uppercase tracking-[0.06em] text-white shadow-[0_14px_30px_-10px_rgba(0,0,0,0.75)] transition hover:bg-[var(--color-primary-hover)] active:scale-95"
              >
                Связаться с нами
              </button>
            </nav>
          </div>
        </>
      )}

      <ContactDrawer open={contactOpen} onClose={() => setContactOpen(false)} />
    </header>
  );
}
