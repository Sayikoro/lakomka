"use client";

/* Смешная страница 404: при каждой загрузке — случайная отговорка
 * «Почему страницы нет» в новогоднем стиле (30 фраз, см. not-found-phrases).
 * Рандом — в useEffect, чтобы гидратация не расходилась с разметкой.
 *
 * «Спасение» новых товаров: витрина статическая — страницы товаров,
 * созданных ПОСЛЕ сборки, физически отсутствуют в пакете, и Apache
 * отдаёт 404. Здесь при открытии /product/<slug> запрашиваем API:
 * если товар существует — рендерим полноценную карточку прямо на
 * 404-странице (шапка/подвал уже вокруг). Новый товар доступен по
 * ссылке сразу, без пересборки.
 *
 * Task 150: раньше между прелоадером и карточкой спасённого товара
 * посетитель успевал увидеть вспышку 404 (бут-сплэш гасился по
 * DOMContentLoaded, а гидратация и запрос к API приезжали позже —
 * репорт владельца: «резко моргает 404 и открывается нужная»).
 * Теперь 404-страница помечена data-boot-hold: BootSplash на адресах
 * /product/<slug>/ держит заставку до сигнала __bootRelease, а блок
 * 404 на время проверки подменяется лоадером в его стиле — вспышки
 * нет ни при жёсткой загрузке, ни при клиентской навигации. */

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { NOT_FOUND_PHRASES } from "@/lib/not-found-phrases";
import { FUNNY_PHRASES } from "@/lib/funny-phrases";
import { fetchLiveProductBySlug } from "@/lib/product-api";
import { ProductView } from "@/components/product/ProductView";
import type { Product } from "@/lib/types";

export function NotFoundView() {
  /* До гидратации — фиксированная фраза (без mismatch), после — случайная */
  const [phrase, setPhrase] = useState(NOT_FOUND_PHRASES[0]);
  /* Фраза лоадера проверки товара — в стиле бут-сплэша (нейтральные) */
  const [loadPhrase, setLoadPhrase] = useState(FUNNY_PHRASES[0]);
  /* Товар, «спасённый» с несуществующей статической страницы */
  const [rescued, setRescued] = useState<Product | null>(null);
  /* Task 150: идёт проверка товара в API — 404-контент не показываем */
  const [checking, setChecking] = useState(false);

  /* useLayoutEffect — срабатывает до первой отрисовки после гидратации:
   * при клиентской навигации на несуществующий товар первым кадром
   * рисуется лоадер, а не мигнувшая страница 404. Логика — в асинхронной
   * run() (микрозадача, react-hooks/set-state-in-effect). */
  useLayoutEffect(() => {
    let cancelled = false;

    const run = async () => {
      /* Потушить удержание бут-сплэша (Task 150): контент готов. Если
       * заставка ещё не успела вооружиться (гидратация раньше
       * DOMContentLoaded) — ставим ранний сигнал, BootSplash прочитает
       * его при DOMContentLoaded и погасит заставку по своей паузе. */
      const releaseBoot = () => {
        try {
          const w = window as unknown as {
            __bootRelease?: () => void;
            __bootEarlyRelease?: boolean;
          };
          if (typeof w.__bootRelease === "function") w.__bootRelease();
          else w.__bootEarlyRelease = true;
        } catch {
          /* DOM недоступен — сплэш погасится своим 4-с потолком */
        }
      };

      /* Спасение товара: /product/<slug> → живой запрос к API */
      const m = window.location.pathname.match(/^\/product\/([^/]+)\/?$/);
      if (!m) {
        releaseBoot(); // не товар — обычная 404, ничего не ждём
        return;
      }
      const slug = decodeURIComponent(m[1]);
      setChecking(true);
      try {
        const p = await fetchLiveProductBySlug(slug);
        if (cancelled) return;
        if (p) {
          setRescued(p);
          /* Title: первые рендеры после спасения Next/React восстанавливает
           * <title> страницы 404 — повторяем присвоение после коммита
           * (кадр + 120 мс + 600 мс), пока не закрепится (зонд Task 150). */
          const title = `${p.name} — Лакомка`;
          document.title = title;
          requestAnimationFrame(() => {
            document.title = title;
          });
          setTimeout(() => {
            if (document.title !== title) document.title = title;
          }, 120);
          setTimeout(() => {
            if (document.title !== title) document.title = title;
          }, 600);
        }
        setChecking(false);
        releaseBoot();
      } catch {
        if (cancelled) return;
        setChecking(false);
        releaseBoot();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Случайные фразы — косметика после отрисовки (микрозадача,
   * react-hooks/set-state-in-effect) */
  useEffect(() => {
    const pick = () => {
      setPhrase(
        NOT_FOUND_PHRASES[Math.floor(Math.random() * NOT_FOUND_PHRASES.length)],
      );
      setLoadPhrase(
        FUNNY_PHRASES[Math.floor(Math.random() * FUNNY_PHRASES.length)],
      );
    };
    const t = setTimeout(pick, 0);
    return () => clearTimeout(t);
  }, []);

  /* Товар найден в API — показываем полноценную карточку */
  if (rescued) {
    return <ProductView product={rescued} />;
  }

  /* Проверяем товар в API — лоадер в стиле бут-сплэша вместо 404
     (Task 150: без вспышки «страница не найдена» перед карточкой) */
  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center">
        <div className="relative mb-8 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-[#0274BE]/20 border-t-[#0274BE]" />
          <div className="text-4xl">🎁</div>
        </div>
        <p className="max-w-md px-6 text-lg font-medium text-[#3A3A3A]">
          {loadPhrase}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Task 150: маркер для бут-сплэша — на адресах /product/<slug>/
          заставка держится до завершения «спасения» (см. BootSplash) */}
      <span data-boot-hold="product" hidden aria-hidden="true" />
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
    </>
  );
}
