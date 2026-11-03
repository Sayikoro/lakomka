"use client";

/* Task 133: клиентский компонент трекера аналитики витрины.
 * Монтируется один раз в (shop)/layout — рядом с Яндекс.Метрикой.
 * Слушает смену маршрута (usePathname) и передаёт её в visit-tracker:
 * pageview при входе на страницу, доскролл и время — при уходе. */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initTracker, onRouteChange } from "@/lib/visit-tracker";

export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    initTracker();
  }, []);

  useEffect(() => {
    onRouteChange(pathname);
  }, [pathname]);

  return null;
}
