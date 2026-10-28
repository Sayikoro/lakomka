"use client";

import { createContext, useContext, useMemo } from "react";
import { tFrom } from "@/lib/page-texts";

/**
 * Контекст текстов страниц: заполняется на сервере (layout группы
 * shop из getPublicSettings) и доступен всем клиентским
 * компонентам без лишних запросов.
 *
 *   const t = useT();
 *   t("cart_h1")                 → «Корзина»
 *   t("catalog_pages", { page: 3, pages: 19 })
 */

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const Ctx = createContext<Record<string, string>>({});

export function TextsProvider({
  texts,
  children,
}: {
  texts: Record<string, string>;
  children: React.ReactNode;
}) {
  const t = useMemo<TFn>(() => (key, vars) => tFrom(texts, key, vars), [texts]);
  return <Ctx.Provider value={texts}>{children}</Ctx.Provider>;
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
