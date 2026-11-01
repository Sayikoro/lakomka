"use client";

/* ============================================================
   Яндекс.Метрика — цели витрины (Task 107).

   Счётчик вшивается в витрину компонентом YandexMetrika, когда
   в настройках задан ym_id. Этот модуль — тонкая обёртка над
   reachGoal: безопасна при отсутствии счётчика (нет скрипта,
   нет id, SSR) — просто ничего не делает.

   Цели:
     add_to_cart   — товар добавлен в корзину (стор корзины)
     order_created — заказ успешно оформлен (чекаут)

   __ymLastGoal пишется для отладки и E2E-проверок: в браузере
   можно проверить window.__ymLastGoal после клика.
   ============================================================ */

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
    __ymCounterId?: string;
    __ymLastGoal?: string;
  }
}

export function ymReachGoal(goal: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const id = window.__ymCounterId;
  const ym = window.ym;
  window.__ymLastGoal = goal;
  if (!id || typeof ym !== "function") return;
  try {
    ym(id, "reachGoal", goal, params);
  } catch {
    /* метрика не должна ломать витрину */
  }
}
