"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useCart } from "@/store/cart";
import { ContactDrawer } from "@/components/home/ContactDrawer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { SmartImg } from "@/components/ui/SmartImg";
import { useT } from "@/components/texts/TextsProvider";

export function Header() {
  const lines = useCart((s) => s.lines);
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);
  const t = useT();

  /* mounted-паттерн без setState в effect (useSyncExternalStore: на сервере false, после гидратации true) */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Шапка прилипает к верху; лёгкая тень появляется, когда страница прокручена
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Esc — закрыть бургер; на время шторки блокируем прокрутку фона
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  const navLinkCls =
    "text-[var(--color-body)] transition-colors hover:text-[var(--color-primary)]";

  /* Корзина с бейджем — кнопка открывает выезжающую шторку (одна и та же в ПК-навигации и в мобильной панели) */
  const cartButton = (
    <button
      type="button"
      onClick={() => setCartOpen(true)}
      aria-label="Корзина"
      title="Корзина"
      className={`relative flex cursor-pointer items-center ${navLinkCls}`}
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
    </button>
  );

  return (
    <header
      className={`sticky top-0 z-40 border-b border-[var(--color-border)] bg-white transition-shadow duration-300 ${
        stuck ? "shadow-[0_14px_30px_-22px_rgba(0,0,0,0.55)]" : ""
      }`}
    >
      <div className="mx-auto flex h-[70px] max-w-[1200px] items-center justify-between px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center"
          aria-label="Лакомка — на главную"
        >
          {/* Логотип вместо текстового названия (загружается из админки-независимого файла).
              object-contain + w-auto на всех брейкпоинтах — пропорции не искажаются ни при
              каких условиях (кеш, зум, нестандартный вьюпорт планшета). 56px держится
              от планшета (md) до ноутбуков (xl) — ландшафтные планшеты не «теряют» размер. */}
          <SmartImg
            src="/uploads/brand/logo-lakomka.webp"
            alt="Лакомка — новогодние подарки"
            width={445}
            height={160}
            className="h-9 w-auto object-contain sm:h-11 md:h-[56px] xl:h-11"
          />
        </Link>

        {/* ПК — инлайн-навигация */}
        <nav className="hidden items-center gap-6 lg:flex">
          <Link href="/catalog" className={navLinkCls}>
            {t("global_nav_gifts")}
          </Link>
          <Link href="/catalogs" className={navLinkCls}>
            {t("global_nav_catalogs")}
          </Link>
          {cartButton}
        </nav>

        {/* Телефон/планшет — корзина и бургер */}
        <div className="flex items-center gap-2 lg:hidden">
          {cartButton}
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

      {/* Шторка бургер-меню: выезжает справа на пол-экрана (телефон/планшет).
          Всегда в DOM — так работает анимация выезда/заезда (visibility + transform). */}
      <div
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 lg:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-label="Меню"
        aria-hidden={!menuOpen}
        className={`fixed inset-y-0 right-0 z-50 flex w-1/2 min-w-[212px] flex-col bg-white shadow-[-20px_0_44px_-24px_rgba(0,0,0,0.5)] transition-[translate,visibility] duration-300 ease-out lg:hidden ${
          menuOpen ? "visible translate-x-0" : "invisible translate-x-full"
        }`}
      >
        {/* Верх шторки — в высоту шапки, крестик справа */}
        <div className="flex h-[70px] shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
          <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--color-heading)]">
            {t("global_menu_title")}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Закрыть меню"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[var(--color-heading)] transition hover:bg-[var(--color-bg-soft)]"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-col px-4">
          <Link
            href="/catalog"
            onClick={() => setMenuOpen(false)}
            className="border-b border-[var(--color-border)] py-4 text-[16px] text-[var(--color-body)]"
          >
            {t("global_nav_gifts")}
          </Link>
          <Link
            href="/catalogs"
            onClick={() => setMenuOpen(false)}
            className="border-b border-[var(--color-border)] py-4 text-[16px] text-[var(--color-body)]"
          >
            {t("global_nav_catalogs")}
          </Link>
        </nav>

        {/* Кнопка «Связаться с нами» — как в таймлайне: круглая, синяя, uppercase */}
        <div className="px-4 pt-5">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setContactOpen(true);
            }}
            className="w-full cursor-pointer rounded-full bg-[var(--color-primary)] px-4 py-[14px] text-[12px] font-bold uppercase tracking-[0.06em] text-white shadow-[0_14px_30px_-10px_rgba(0,0,0,0.75)] transition hover:bg-[var(--color-primary-hover)] active:scale-95 sm:text-[13px]"
          >
            {t("global_contact_button")}
          </button>
        </div>
      </aside>

      <ContactDrawer open={contactOpen} onClose={() => setContactOpen(false)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </header>
  );
}
