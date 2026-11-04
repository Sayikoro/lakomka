"use client";

/* ============================================================
   Task 142: счётчик «До Нового года» — праздничный хрониометр
   сразу под Hero-блоком на главной. Четыре стеклянные карточки
   (дни / часы / минуты / секунды) с живым тиканьем каждую
   секунду на фоне зимней ночи: градиент неба, гирлянда огоньков
   по верхнему краю, падающие снежинки, мягкое свечение.

   База Task 141 сохранена: включается/выключается галочкой в
   админке (Настройки → Витрина, «Счётчик до Нового года»). Как и
   Hero: стартуем с запечённых при сборке значений, после
   монтирования сверяемся с живым /api/settings/public —
   выключение в админке убирает блок по F5 без пересборки сайта.

   Числа: сервер рендерит значения на момент сборки (статика!),
   после монтирования пересчитываем от часов посетителя раз в
   секунду — расхождения гидратации нет (первый клиентский рендер
   совпадает с HTML), дальше отсчёт живёт сам.

   Для скрин-ридеров: видимая надпись декоративная (aria-hidden),
   цельная фраза «Осталось N дней до Нового года» — sr-only,
   карточки читаются следом обычным текстом.
   ============================================================ */

import { useEffect, useState } from "react";
import { useT } from "@/components/texts/TextsProvider";
import {
  pluralDays,
  pluralPick,
  timeUntilNewYearParts,
  type NyParts,
} from "@/lib/newyear";

interface Props {
  /** Запечённое при сборке значение галочки (стартовое) */
  enabled: boolean;
  /** Запечённые при сборке дни/часы/минуты/секунды — стартовые
   *  значения рендера (без рассинхрона гидратации); после
   *  монтирования пересчитываются от часов посетителя */
  initialParts: NyParts;
}

/* Подписи карточек — правильные формы «1 день / 2 дня / 5 дней»,
   «1 минута / 2 минуты / 5 минут» и т.д. */
const UNITS: Array<{ key: keyof NyParts; forms: [string, string, string] }> = [
  { key: "d", forms: ["день", "дня", "дней"] },
  { key: "h", forms: ["час", "часа", "часов"] },
  { key: "m", forms: ["минута", "минуты", "минут"] },
  { key: "s", forms: ["секунда", "секунды", "секунд"] },
];

/* Огоньки гирлянды — классическая новогодняя пятёрка цветов */
const BULB_COLORS = ["#ff5964", "#ffd166", "#06d6a0", "#4cc9f0", "#f77fbe"];
const BULBS = 12;

/* Снежинки: позиция / размер / длительность / задержка падения */
const FLAKES = [
  { left: "5%", size: 13, dur: 11, delay: 0 },
  { left: "16%", size: 9, dur: 15, delay: 3.5 },
  { left: "27%", size: 15, dur: 9.5, delay: 6 },
  { left: "41%", size: 10, dur: 13, delay: 1.8 },
  { left: "55%", size: 14, dur: 10.5, delay: 8.2 },
  { left: "68%", size: 9, dur: 14.5, delay: 4.6 },
  { left: "79%", size: 15, dur: 12, delay: 2.4 },
  { left: "91%", size: 11, dur: 10, delay: 7 },
];

function SnowflakeIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M12 2v20M4 6l16 12M20 6L4 18M12 2l-2.5 3M12 2l2.5 3M12 22l-2.5-3M12 22l2.5-3M4 6l3.5.6M4 6l.6 3.5M20 18l-3.5-.6M20 18l-.6-3.5M20 6l-3.5.6M20 6l-.6 3.5M4 18l3.5-.6M4 18l.6-3.5" />
    </svg>
  );
}

export function NewYearCounter({ enabled, initialParts }: Props) {
  const t = useT();

  /* Живая галочка: после монтирования сверяемся с API — владелец
     может выключить счётчик без пересборки статики. */
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null);
  /* Части отсчёта: стартуем с запечённых при сборке (совпадают с HTML),
     после монтирования пересчитываем от часов посетителя раз в секунду */
  const [parts, setParts] = useState<NyParts>(initialParts);

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

  /* Живой отсчёт: микротаск после монтирования (синхронный setState
     в эффекте запрещён react-hooks v6), далее раз в секунду —
     блок «живёт», даже если страницу оставили открытой до полночи */
  useEffect(() => {
    const update = () => setParts(timeUntilNewYearParts());
    void Promise.resolve().then(update);
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const shown = liveEnabled ?? enabled;
  if (!shown) return null;

  const days = parts.d;
  /* Надпись из реестра текстов: {days} и {days_word} по-прежнему
     поддерживаются, если владелец впишет их в админке */
  const label = t("home_newyear_label", { days, days_word: pluralDays(days) });

  return (
    <section
      data-testid="newyear-counter"
      className="relative overflow-hidden bg-[linear-gradient(180deg,#071229_0%,#0d2450_52%,#0a1c3e_100%)] text-white"
    >
      {/* Мягкое свечение за карточками */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[min(760px,94%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(96,165,250,0.20),transparent_65%)]"
      />

      {/* Гирлянда огоньков по верхнему краю */}
      <div aria-hidden className="ny-garland">
        {Array.from({ length: BULBS }, (_, i) => (
          <span
            key={i}
            className="ny-bulb"
            style={{
              color: BULB_COLORS[i % BULB_COLORS.length],
              animationDelay: `${(i % 5) * 0.42}s`,
            }}
          />
        ))}
      </div>

      {/* Падающие снежинки (на телефоне — половина, чтобы не шумело) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {FLAKES.map((f, i) => (
          <span
            key={i}
            className={`ny-flake${i % 2 ? " hidden sm:inline" : ""}`}
            style={{
              left: f.left,
              fontSize: f.size,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
            }}
          >
            ❄
          </span>
        ))}
      </div>

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-col items-center px-4 pb-7 pt-9 text-center sm:pb-9 sm:pt-11">
        {/* Цельная фраза для скрин-ридеров (карточки ниже раздроблены) */}
        <span className="sr-only">
          Осталось {days} {pluralDays(days)} до Нового года.
        </span>

        {/* Надпись (редактируется в админке) — декоративная обёртка,
            смысл для скрин-ридеров несёт sr-only выше */}
        <p
          aria-hidden
          className="flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.28em] text-white/85 sm:gap-3.5 sm:text-[15px]"
        >
          <SnowflakeIcon className="shrink-0 text-white/50" />
          <span>{label}</span>
          <SnowflakeIcon className="shrink-0 scale-x-[-1] text-white/50" />
        </p>

        {/* Хрониометр: дни / часы / минуты / секунды */}
        <div className="mt-5 grid w-full max-w-[640px] grid-cols-4 gap-2 sm:mt-6 sm:gap-4">
          {UNITS.map((u) => {
            const v = parts[u.key];
            return (
              <div
                key={u.key}
                className={`ny-card${u.key === "s" ? " ny-card-sec" : ""}`}
              >
                <span className="ny-num">
                  {u.key === "d" ? v : String(v).padStart(2, "0")}
                </span>
                <span className="ny-cap">{pluralPick(v, u.forms)}</span>
              </div>
            );
          })}
        </div>

        {/* Подпись из реестра текстов */}
        <p className="mt-4 text-xs text-white/65 sm:mt-5 sm:text-sm">
          {t("home_newyear_hint")}
        </p>
      </div>
    </section>
  );
}
