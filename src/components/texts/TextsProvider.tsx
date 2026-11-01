"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { tFrom } from "@/lib/page-texts";

/**
 * Контекст текстов страниц: стартовое значение запекается на сервере
 * (layout берёт его из getPublicSettings) и доступен всем компонентам:
 *
 *   const t = useT();
 *   t("cart_h1")                 → «Корзина»
 *   t("catalog_pages", { page: 3, pages: 19 })
 *
 * Сайт — статический экспорт: HTML собирается один раз, поэтому правки
 * из «Текст на страницах» попадают в БД сервера, но НЕ в запечённый HTML.
 * Раньше футер так и не обновлялся («поменял адрес — не применился»).
 * Лечение (Task 112): после монтирования и при каждой смене страницы
 * добираем свежие тексты с /api/settings/public (no-store) — тот же
 * паттерн, что у Hero и каталога. Пока API не ответил или недоступен,
 * рендерятся запечённые значения, рассинхрона гидратации нет.
 */

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const Ctx = createContext<Record<string, string>>({});
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function TextsProvider({
  texts,
  children,
}: {
  texts: Record<string, string>;
  children: React.ReactNode;
}) {
  const [live, setLive] = useState<Record<string, string>>(texts);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/settings/public`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const t = json?.data?.texts;
        if (cancelled || !t || typeof t !== "object") return;
        setLive((prev) => ({ ...prev, ...(t as Record<string, string>) }));
      })
      .catch(() => {
        /* сеть/API недоступны — остаются запечённые тексты */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return <Ctx.Provider value={live}>{children}</Ctx.Provider>;
}

/** Карта сохранённых текстов (без подстановки дефолтов) */
export function useTexts(): Record<string, string> {
  return useContext(Ctx);
}

/** t(key) → текст с дефолтом и подстановками */
export function useT(): TFn {
  const texts = useContext(Ctx);
  return useMemo<TFn>(() => (key, vars) => tFrom(texts, key, vars), [texts]);
}
