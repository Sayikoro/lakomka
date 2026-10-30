"use client";

/* Смешная страница 404: при каждой загрузке — случайная отговорка
 * «Почему страницы нет» в новогоднем стиле (30 фраз, см. not-found-phrases).
 * Рандом — в useEffect, чтобы гидратация не расходилась с разметкой. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { NOT_FOUND_PHRASES } from "@/lib/not-found-phrases";

export function NotFoundView() {
  /* До гидратации — фиксированная фраза (без mismatch), после — случайная */
  const [phrase, setPhrase] = useState(NOT_FOUND_PHRASES[0]);

  useEffect(() => {
    setPhrase(
      NOT_FOUND_PHRASES[Math.floor(Math.random() * NOT_FOUND_PHRASES.length)],
    );
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#eaf4ff] to-[#fdfdfd] px-4 py-16 text-center">
      {/* падающие снежинки (чистая анимация, без JS) */}
      <span aria-hidden className="nf-flake left-[6%] text-3xl">❄</span>
      <span aria-hidden className="nf-flake left-[18%] text-xl" style={{ animationDelay: "1.2s" }}>❄</span>
      <span aria-hidden className="nf-flake left-[35%] text-2xl" style={{ animationDelay: "2.4s" }}>❄</span>
      <span aria-hidden className="nf-flake left-[55%] text-lg" style={{ animationDelay: "0.6s" }}>❄</span>
      <span aria-hidden className="nf-flake left-[72%] text-3xl" style={{ animationDelay: "1.8s" }}>❄</span>
      <span aria-hidden className="nf-flake left-[88%] text-xl" style={{ animationDelay: "3s" }}>❄</span>

      {/* подпрыгивающий подарок */}
      <div aria-hidden className="nf-gift mb-6 text-[90px] leading-none select-none">
        🎁
      </div>

      <p className="text-[13px] font-semibold uppercase tracking-[0.3em] text-[#9aa7b8]">
        страница не найдена
      </p>
      <h1 className="mt-2 text-[110px] font-black leading-none text-[var(--color-heading,#1f2937)] sm:text-[150px]">
        404
      </h1>

      {/* случайная отговорка */}
      <p className="mt-5 max-w-xl rounded-2xl border border-[var(--color-border,#e5e7eb)] bg-white/80 px-6 py-4 text-lg text-[var(--color-body,#4b5563)] shadow-sm backdrop-blur">
        {phrase}
      </p>

      <p className="mt-3 text-sm text-[#9aa7b8]">
        Обнови страницу — Дед Мороз придумает другую отговорку 🎅
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-[var(--color-primary,#c8102e)] px-7 py-3 text-sm font-semibold text-white shadow transition hover:opacity-90"
        >
          На главную
        </Link>
        <Link
          href="/catalog/"
          className="rounded-full border border-[var(--color-border,#e5e7eb)] bg-white px-7 py-3 text-sm font-semibold text-[var(--color-heading,#1f2937)] transition hover:border-[var(--color-primary,#c8102e)] hover:text-[var(--color-primary,#c8102e)]"
        >
          В каталог подарков
        </Link>
      </div>

      <p className="mt-10 text-xs text-[#b6c0cd]">
        Лакомка · новогодние подарки с конфетами ручной работы
      </p>
    </div>
  );
}
