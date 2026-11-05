"use client";

/* ============================================================
   Task 142/143/144: счётчик «До Нового года» — праздничный хрониометр
   на главной: четыре карточки (дни / часы / минуты / секунды) с живым
   тиканьем каждую секунду, гирлянда огоньков над карточками, падающие
   снежинки.

   Task 143: блок стоит под плитками СКИДКА/ДОСТАВКА/ОПЛАТА (выше
   категорий); появление при скролле — гирлянда «прорастает» проводом,
   огоньки загораются по очереди, карточки плавно поднимаются
   (IntersectionObserver, один раз; при prefers-reduced-motion и без
   JS блок просто виден).

   Task 144: блок в цвете окружающих секций — прозрачный фон (виден
   фон страницы), карточки белые в дизайне плиток условий (InfoCards:
   bg-white, radius-card, мягкий hover), цифры — фирменный синий,
   гирлянда висит над карточками во всю их ширину.

   База Task 141 сохранена: включается/выключается галочкой в
   админке (Настройки → Витрина). Сервер запекает значения при
   сборке, после монтирования клиент считает сам — расхождения
   гидратации нет.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
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

/* Task 149: огоньки гирлянды — БЕЛЫЕ (просьба владельца: блок должен быть
   в цвете сайта, без радуги; ранее — «пятёрка цветов» из Task 142).
   Видимость на светлом фоне обеспечивает .ny-bulb в globals.css
   (обводка + мягкая тень, не currentColor). */
const BULB_COLOR = "#ffffff";
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
  const sectionRef = useRef<HTMLElement>(null);

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

  /* Task 143: плавное появление при скролле — один раз, когда блок
     показался на ~20%. Без JS/при reduced-motion блок просто виден:
     классы ny-anim/ny-in добавляются только тут, в HTML их нет. */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("ny-anim");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add("ny-in");
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shown = liveEnabled ?? enabled;
  if (!shown) return null;

  const days = parts.d;
  /* Надпись из реестра текстов: {days} и {days_word} по-прежнему
     поддерживаются, если владелец впишет их в админке */
  const label = t("home_newyear_label", { days, days_word: pluralDays(days) });

  return (
    <section
      ref={sectionRef}
      data-testid="newyear-counter"
      className="ny-section relative mt-8 overflow-hidden text-[var(--color-body)] sm:mt-10"
    >
      {/* Мягкое синее свечение за карточками */}
      <div
        aria-hidden
        className="ny-glow pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[min(760px,94%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(2,116,190,0.10),transparent_65%)]"
      />

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

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-col items-center px-4 pb-7 pt-7 text-center sm:pb-9 sm:pt-8">
        {/* Цельная фраза для скрин-ридеров (карточки ниже раздроблены) */}
        <span className="sr-only">
          Осталось {days} {pluralDays(days)} до Нового года.
        </span>

        {/* Надпись (редактируется в админке) — декоративная обёртка,
            смысл для скрин-ридеров несёт sr-only выше */}
        <p
          aria-hidden
          className="ny-head flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.28em] text-[var(--color-heading)] sm:gap-3.5 sm:text-[15px]"
        >
          <SnowflakeIcon className="shrink-0 text-[var(--color-primary)] opacity-60" />
          <span>{label}</span>
          <SnowflakeIcon className="shrink-0 scale-x-[-1] text-[var(--color-primary)] opacity-60" />
        </p>

        {/* Гирлянда висит над карточками во всю их ширину */}
        <div aria-hidden className="ny-garland mt-5 w-full max-w-[640px] sm:mt-6">
          {Array.from({ length: BULBS }, (_, i) => (
            <span
              key={i}
              className="ny-bulb"
              style={{
                color: BULB_COLOR,
                ["--b" as string]: i,
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* Хрониометр: дни / часы / минуты / секунды */}
        <div className="mt-2 grid w-full max-w-[640px] grid-cols-4 gap-2 sm:gap-4">
          {UNITS.map((u, i) => {
            const v = parts[u.key];
            return (
              <div
                key={u.key}
                className={`ny-card${u.key === "s" ? " ny-card-sec" : ""}`}
                style={{ ["--i" as string]: i } as React.CSSProperties}
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
        <p className="ny-hint mt-4 text-xs text-[var(--color-muted)] sm:mt-5 sm:text-sm">
          {t("home_newyear_hint")}
        </p>
      </div>
    </section>
  );
}
