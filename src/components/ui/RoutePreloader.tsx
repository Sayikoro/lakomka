"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FUNNY_PHRASES } from "@/lib/funny-phrases";

export function RoutePreloader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [phraseIdx, setPhraseIdx] = useState(0);

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Если шоу-таймер не успел сработать — отменяем его
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    // Плавно скрываем через 100мс после смены страницы
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), 100);

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [pathname]);

  /* ---- Safety: если прелоадер висит >10 сек, скрываем ---- */
  useEffect(() => {
    if (!visible) return;
    const safety = setTimeout(() => setVisible(false), 10000);
    return () => clearTimeout(safety);
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
    };

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, [pathname]);

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