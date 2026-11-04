"use client";

/* ============================================================
   Task 141: счётчик «До Нового года: N дней» — узкая праздничная
   полоска сразу под Hero-блоком на главной.

   Включается/выключается галочкой в админке (Настройки → Витрина,
   «Счётчик до Нового года»). Как и Hero: стартуем с запечённого
   при сборке значения, после монтирования сверяемся с живым
   /api/settings/public — выключение в админке убирает полоску
   по F5 без пересборки сайта.

   Число дней: сервер рендерит значение на момент сборки (статика!),
   после монтирования пересчитываем от часов посетителя — расхождение
   гидратации нет (первый клиентский рендер совпадает с HTML),
   а через мгновение показывается актуальное число.
   ============================================================ */

import { useEffect, useState } from "react";
import { useT } from "@/components/texts/TextsProvider";
import { daysUntilNewYear, pluralDays } from "@/lib/newyear";

interface Props {
  /** Запечённое при сборке значение галочки (стартовое) */
  enabled: boolean;
  /** Дней до НГ на момент сборки — стартовое значение рендера (без
   *  рассинхрона гидратации); после монтирования пересчитывается */
  initialDays: number;
}

export function NewYearCounter({ enabled, initialDays }: Props) {
  const t = useT();

  /* Живая галочка: после монтирования сверяемся с API — владелец
     может выключить счётчик без пересборки статики. */
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null);
  /* Дни: стартуем с числа, запечённого при сборке (совпадает с HTML),
     после монтирования пересчитываем от часов посетителя */
  const [days, setDays] = useState(initialDays);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/public", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const v = json?.data?.newyear_counter_enabled;
        if (typeof v === "boolean") setLiveEnabled(v);
      })
      .catch(() => {
        /* сеть недоступна — остаётся запечённое значение */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Пересчёт после монтирования (и далее раз в минуту — на случай
     открытой на полночь страницы). Синхронный setState в эффекте
     запрещён react-hooks v6 — микротаск. */
  useEffect(() => {
    const update = () => setDays(daysUntilNewYear());
    void Promise.resolve().then(update);
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const shown = liveEnabled ?? enabled;
  if (!shown) return null;

  /* {days} — число, {days_word} — «день/дня/дней» (подставляется всегда);
     если в сохранённом тексте нет числа — рисуем его рядом отдельным спаном */
  const label = t("home_newyear_label", { days, days_word: pluralDays(days) });

  return (
    <section
      data-testid="newyear-counter"
      aria-label={label}
      className="border-b border-[var(--color-border)] bg-[var(--color-primary)] text-white"
    >
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center">
        <span className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-wide sm:text-[15px]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2v20M4 6l16 12M20 6L4 18M12 2l-2.5 3M12 2l2.5 3M12 22l-2.5-3M12 22l2.5-3M4 6l3.5.6M4 6l.6 3.5M20 18l-3.5-.6M20 18l-.6-3.5M20 6l-3.5.6M20 6l-.6 3.5M4 18l3.5-.6M4 18l.6-3.5" />
          </svg>
          {label}
          {/\d/.test(label) ? null : (
            /* В сохранённом тексте нет числа (владелец убрал {days}) —
               рисуем число рядом, чтобы счётчик не «потерял» главное */
            <span className="font-semibold">
              {days}&nbsp;{pluralDays(days)}
            </span>
          )}
        </span>
        <span className="text-xs text-white/85 sm:text-sm">
          {t("home_newyear_hint")}
        </span>
      </div>
    </section>
  );
}
