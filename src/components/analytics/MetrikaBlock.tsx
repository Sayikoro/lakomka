"use client";

/* ============================================================
   Task 114: ВСТРАИВАЕМЫЙ БЛОК ЯНДЕКС.МЕТРИКИ.
   Владелец вставляет в админке (Настройки → Основные) блок
   целиком — ровно то, что даёт Метрика («<script>…<noscript>…»).

   Как работает:
   • Блок, известный на момент сборки, рендерится сервером в HTML
     (dangerouslySetInnerHTML): в статическом экспорте сырые <script>
     исполняются браузером при разборе документа — счётчик стартует
     сразу, до гидратации.
   • После монтирования компонент один раз добирает /settings/public
     и сравнивает с запечённым кодом: если блок добавили/поменяли —
     он переносится в DOM по-настоящему (скрипты пересоздаются, иначе
     браузер их не исполняет). Пересборка сайта не нужна.
   • Номер счётчика извлекается из блока и пишется в
     window.__ymCounterId — цели ymReachGoal (lib/metrika) продолжают
     работать и с сырым блоком.
   • При смене маршрута шлём ym(id,"hit",url) — SPA-навигация Next
     иначе выглядит в Метрике как один длинный визит.
   ============================================================ */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
    __ymCounterId?: string;
  }
}

function extractCounterId(code: string): string | null {
  const m = /ym\(\s*['"]?(\d{4,})['"]?\s*,\s*['"]init['"]/.exec(code);
  return m ? m[1] : null;
}

/** Вставить HTML-блок с исполнением <script> (пересоздание узлов). */
function injectCode(container: HTMLDivElement, code: string): void {
  container.innerHTML = "";
  const tpl = document.createElement("div");
  tpl.innerHTML = code;
  tpl.querySelectorAll("script").forEach((old) => {
    const s = document.createElement("script");
    for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value);
    s.text = old.textContent ?? "";
    old.replaceWith(s);
  });
  while (tpl.firstChild) container.appendChild(tpl.firstChild);
  const id = extractCounterId(code);
  if (id) window.__ymCounterId = id;
}

interface Props {
  /** Код, запечённый при сборке (пустая строка = на сборке блока не было). */
  bakedCode: string;
}

export function MetrikaBlock({ bakedCode }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  /* Живая доборка блока — один раз при монтировании страницы */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/settings/public`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive || !json?.data) return;
        const live = typeof json.data.metrika_code === "string" ? json.data.metrika_code : "";
        if (live === bakedCode) return; // исполнять нечего — блок уже в HTML
        if (live === "") return;        // блок убрали — старый оставляем до пересборки (не дёргаем счётчик)
        injectCode(el, live);
      } catch { /* аналитика не должна ломать витрину */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* SPA-переходы: честный hit в Метрику */
  const firstPath = useRef<string | null>(null);
  useEffect(() => {
    if (firstPath.current === null) {
      firstPath.current = pathname;
      return;
    }
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    const id = window.__ymCounterId;
    if (id && typeof window.ym === "function") {
      try {
        window.ym(id, "hit", window.location.href);
      } catch { /* тихо */ }
    }
  }, [pathname]);

  return (
    <div
      ref={ref}
      data-metrika="1"
      style={{ display: "none" }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: bakedCode }}
    />
  );
}
