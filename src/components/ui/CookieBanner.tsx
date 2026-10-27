"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "lakomka-cookie-consent";

type Consent = "all" | "essential";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        const t = setTimeout(() => {
          setVisible(true);
          setTimeout(() => setAnimate(true), 20);
        }, 800);
        return () => clearTimeout(t);
      }
    } catch {
      setVisible(true);
      setTimeout(() => setAnimate(true), 20);
    }
  }, []);

  function accept(consent: Consent) {
    try {
      localStorage.setItem(STORAGE_KEY, consent);
    } catch {}
    setAnimate(false);
    setTimeout(() => setVisible(false), 250);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Согласие на использование cookies"
      className={`fixed inset-x-0 bottom-0 z-[90] px-3 pb-3 transition-transform duration-300 ${
        animate ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-[1200px] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-5 shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex-1 text-sm text-[var(--color-body)]">
            <p className="font-medium text-[var(--color-heading)]">
              Мы используем cookies
            </p>
            <p className="mt-1">
              Только необходимые — чтобы корзина не терялась и сайт работал.
              Никакой аналитики и рекламы. Подробнее — в{" "}
              <Link
                href="/privacy"
                className="text-[var(--color-primary)] underline hover:no-underline"
              >
                политике конфиденциальности
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
            <button
              type="button"
              onClick={() => accept("all")}
              className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              Принять все
            </button>
            <button
              type="button"
              onClick={() => accept("essential")}
              className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-body)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              Только необходимые
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}