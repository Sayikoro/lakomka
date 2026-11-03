"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FUNNY_PHRASES } from "@/lib/funny-phrases";

/** Через сколько секунд после клика, если адрес так и не сменился,
 * выполняется жёсткий (полный) переход по ссылке. */
const NAV_WATCHDOG_MS = 8000;
/** Через сколько после смены адреса проверяем, что страница реально
 * отрисовалась; если нет — чистим сегмент-кэш и перезагружаем. */
const BLANK_REPAIR_MS = 2500;
/** Флаг «уже перезагружались на этом адресе» — защита от циклов. */
const REPAIR_FLAG = "lakomka-blank-repair";

export function RoutePreloader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [phraseIdx, setPhraseIdx] = useState(0);

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Сторож навигации: { href, timer } — если SPA-переход не сменил
   * адрес за NAV_WATCHDOG_MS, выполняем location.assign(href).
   * Статические HTML-страницы отдаёт сам Apache, поэтому полный
   * переход срабатывает всегда — пользователь не остаётся один на один
   * с висящим прелоадером («кликнул, крутилось — и ничего»). */
  const navWatchRef = useRef<{ href: string; from: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const cancelNavWatch = useCallback(() => {
    if (navWatchRef.current) {
      clearTimeout(navWatchRef.current.timer);
      navWatchRef.current = null;
    }
  }, []);

  /* ---- Бут-сплэш: React гидратился — статическую заставку можно гасить ----
   * Штатно её прячет инлайн-скрипт BootSplash (по DOMContentLoaded, минимум
   * 900 мс показа). Этот эффект — страховка: гидратация означает, что JS
   * дошёл и контент страницы уже в DOM, так что заставка не нужна, даже если
   * скрипт не выполнился (старый браузер, агрессивное расширение). */
  useEffect(() => {
    try {
      /* Инлайн-скрипт BootSplash жив и сам ведёт жизненный цикл заставки
       * (включая минимальные 900 мс показа) — не вмешиваемся, иначе на
       * быстрой сети двойной цикл hidden→done гасил заставку раньше
       * брендовой паузы (поймано на e2e). */
      if ((window as unknown as { __bootArmed?: boolean }).__bootArmed) return;
      const h = document.documentElement;
      const st = h.getAttribute("data-boot");
      if (st === "hidden" || st === "done") return;
      h.setAttribute("data-boot", "hidden");
      const t = setTimeout(() => h.setAttribute("data-boot", "done"), 350);
      return () => clearTimeout(t);
    } catch {
      /* DOM недоступен — заставка погасится своей CSS-страховкой */
    }
  }, []);

  /* ---- Ротация фраз пока виден ---- */
  useEffect(() => {
    if (!visible) return;
    setPhraseIdx(Math.floor(Math.random() * FUNNY_PHRASES.length));
    const timer = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % FUNNY_PHRASES.length);
    }, 1500);
    return () => clearInterval(timer);
  }, [visible]);

  /* ---- Смена pathname → скрываем ---- */
  useEffect(() => {
    // Навигация состоялась — сторож больше не нужен
    cancelNavWatch();
    // Если шоу-таймер не успел сработать — отменяем его
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    // Плавно скрываем через 100мс после смены страницы
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), 100);

    /* Второй контур: адрес сменился, а страница ТАК И НЕ ОТРИСОВАЛАСЬ
     * (сегмент-кэш Next отравлен мусорным/битым ответом или рендер упал —
     * на витрине это выглядит как «прелоадер покрутился, а страничка не
     * загрузилась», и так на каждом клике, пока кэш вкладки не очищен).
     * Проверка двухступенчатая (2.5с + ещё 2с), чтобы не мешать медленным
     * устройствам дорендерить. Лечение: чистим sessionStorage сегмент-кэша
     * и делаем жёсткую перезагрузку — серверный HTML всегда валиден.
     * Один раз на адрес (защита от цикла). */
    const path = pathname;
    const isBlank = () => {
      try {
        // <main> отсутствует или пуст = страница не отрисовалась.
        // Шапка/подвал на витрине постоянны, поэтому тело целиком
        // неинформативно — смотрим только на контент main.
        // <main> есть на всех страницах (витрина, 404, админка).
        const mainText = (document.querySelector("main")?.textContent ?? "").trim();
        return mainText.length < 20;
      } catch {
        return false; // DOM недоступен — страницу считаем живой
      }
    };
    let repair2: ReturnType<typeof setTimeout> | null = null;
    const repair = setTimeout(() => {
      if (!isBlank()) return; // страница отрисовалась — лечить нечего
      // ещё 2с терпения: медленное устройство может дорендерить
      repair2 = setTimeout(() => {
        if (!isBlank()) return;
        let already = "";
        try {
          already = sessionStorage.getItem(REPAIR_FLAG) ?? "";
        } catch {
          already = path; // storage недоступен — не рискуем циклом
        }
        if (already === path) return; // уже перезагружались на этом адресе
        try {
          sessionStorage.clear(); // отравленный сегмент-кэш — вон
          sessionStorage.setItem(REPAIR_FLAG, path);
        } catch {
          /* ignore */
        }
        setVisible(true); // оверлей остаётся до выгрузки
        window.location.reload();
      }, 2000);
    }, BLANK_REPAIR_MS);

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      clearTimeout(repair);
      if (repair2) clearTimeout(repair2);
    };
  }, [pathname, cancelNavWatch]);

  /* ---- Safety: если прелоадер висит >10 сек, скрываем ---- */
  useEffect(() => {
    if (!visible) return;
    const safety = setTimeout(() => setVisible(false), 10000);
    safetyTimerRef.current = safety;
    return () => {
      clearTimeout(safety);
      if (safetyTimerRef.current === safety) safetyTimerRef.current = null;
    };
  }, [visible]);

  /* ---- Перехват кликов на внутренние ссылки ---- */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href) return;

      // внешние / служебные ссылки — пропускаем
      if (href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (link.target === "_blank") return;
      if (link.hasAttribute("download")) return;

      // внешние домены — пропускаем
      if (href.startsWith("http")) {
        try {
          const u = new URL(href);
          if (u.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }

      // тот же URL — пропускаем
      try {
        const u = new URL(href, window.location.origin);
        if (u.pathname === pathname && !u.search) return;
      } catch {
        // ignore
      }

      // Показываем через 150мс — если успело навигировать раньше, не мигнёт
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      showTimerRef.current = setTimeout(() => {
        setVisible(true);
      }, 150);

      // Сторож: адрес не сменился за NAV_WATCHDOG_MS → полный переход.
      // (Повторные клики перезаряжают сторож на новую ссылку.)
      cancelNavWatch();
      const from = window.location.href;
      const watch = setTimeout(() => {
        navWatchRef.current = null;
        // Пока таймер тикал, адрес мог смениться программно (router.push,
        // смена query) — тогда жёсткий переход не нужен
        if (window.location.href === from) {
          // Оверлей остаётся до выгрузки документа: не даём safety-таймеру
          // спрятать прелоадер посреди жёсткого перехода
          if (safetyTimerRef.current) {
            clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
          }
          setVisible(true);
          window.location.assign(link.href);
        }
      }, NAV_WATCHDOG_MS);
      navWatchRef.current = { href: link.href, from, timer: watch };
    };

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      cancelNavWatch();
    };
  }, [pathname, cancelNavWatch]);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="relative mb-8 flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)]" />
        <div className="text-4xl">🎁</div>
      </div>
      <p className="max-w-md px-6 text-center text-lg font-medium text-[var(--color-heading)]">
        {FUNNY_PHRASES[phraseIdx]}
      </p>
    </div>
  );
}