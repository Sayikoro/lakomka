"use client";

/* Переключатель темы админки (Task 121): светлая / тёмная.
 *
 * Тёмная тема работает через атрибут data-admin-theme="dark" на <html>:
 * в globals.css под ним переопределяются CSS-переменные (--color-*),
 * поэтому весь интерфейс админки перекрашивается сразу. Витрина НЕ
 * переключается — атрибут ставится только на /admin-маршрутах:
 *  - до первой отрисовки — инлайн-скриптом в корневом layout (no-flash);
 *  - этой кнопкой — с сохранением выбора в localStorage «admin_theme».
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "admin_theme";

function applyTheme(theme: "light" | "dark") {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-admin-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-admin-theme");
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  /* Начальное значение — из localStorage (инлайн-скрипт уже мог применить
   * атрибут; здесь только синхронизируем состояние кнопки). set — в
   * микротаске: react-hooks/set-state-in-effect запрещает синхронный. */
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "dark") setTheme("dark");
        else if (saved === "light") setTheme("light");
        else setTheme(document.documentElement.hasAttribute("data-admin-theme") ? "dark" : "light");
      } catch {
        /* приватный режим без localStorage — остаёмся в светлой */
      }
    });
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* не критично — тема просто не сохранится до перезагрузки */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-heading)]"
    >
      <span aria-hidden>{theme === "dark" ? "🌙" : "☀️"}</span>
      {theme === "dark" ? "Тёмная" : "Светлая"}
    </button>
  );
}

/* Инлайн-скрипт для корневого layout: применяется ДО первой отрисовки,
 * чтобы тёмная тема не мигала светлой. Ошибки молча глотаются. */
export const THEME_NOFLASH_SCRIPT = `try{if(location.pathname.indexOf('/admin')===0&&localStorage.getItem('${STORAGE_KEY}')==='dark'){document.documentElement.setAttribute('data-admin-theme','dark')}}catch(e){}`;

/**
 * Синхронизатор темы по маршруту (в корневом layout).
 * Инлайн-скрипта мало: админка и витрина — одно SPA-дерево, и при
 * КЛИЕНТСКОЙ навигации (например, ссылка «Витрина» в тулбаре админа,
 * кнопка «назад» браузера) <html> не перезагружается — атрибут тёмной
 * темы уехал бы на витрину. Этот компонент на каждой смене pathname
 * наводит порядок: /admin/* — тема из localStorage, всё остальное — светлая.
 */
export function AdminThemeSync() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "dark") {
          document.documentElement.setAttribute("data-admin-theme", "dark");
          return;
        }
      } catch {
        /* нет localStorage — светлая */
      }
      document.documentElement.removeAttribute("data-admin-theme");
    } else if (document.documentElement.hasAttribute("data-admin-theme")) {
      document.documentElement.removeAttribute("data-admin-theme");
    }
  }, [pathname]);
  return null;
}
