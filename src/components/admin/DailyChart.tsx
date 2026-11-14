"use client";

/* Task 152: мини-график динамики по дням на чистом SVG — без chart-библиотек
 * (их в проекте нет, а тянуть recharts ради одной плитки не нужно).
 *
 * Подача: столбики = заказы, линия = визиты (сессии). Шкалы независимые —
 * у заказов и визитов разные порядки величин. Пропущенные дни бэкенд
 * уже заполнил нулями (AdminDashboardController::daily).
 *
 * Используется на «Обзоре» и в «Аналитике». */

import { useMemo } from "react";

export interface DayRow {
  date: string;
  orders: number;
  orders_sum_kopecks: number;
  sessions: number;
  humans: number;
  bots: number;
  views: number;
}

const W = 720;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 26, left: 8 };
const BAR_W = 10;

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export function DailyChart({ days }: { days: DayRow[] }) {
  const { bars, line, maxOrders, maxSessions } = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = Math.max(days.length, 1);
    const step = innerW / n;
    const maxOrders = Math.max(1, ...days.map((d) => d.orders));
    const maxSessions = Math.max(1, ...days.map((d) => d.sessions));

    const bars = days.map((d, i) => {
      const h = (d.orders / maxOrders) * (innerH - 4);
      return {
        x: PAD.left + i * step + (step - BAR_W) / 2,
        y: PAD.top + innerH - h,
        w: BAR_W,
        h: Math.max(h, d.orders > 0 ? 2 : 0),
        day: d,
        cx: PAD.left + i * step + step / 2,
      };
    });

    const line = days.map((d, i) => {
      const x = PAD.left + i * step + step / 2;
      const y = PAD.top + innerH - (d.sessions / maxSessions) * (innerH - 4);
      return `${x},${y}`;
    });

    return { bars, line, maxOrders, maxSessions };
  }, [days]);

  if (days.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-[var(--color-muted)]">
        Нет данных за период
      </div>
    );
  }

  /* Подписи дней: через одну-две, чтобы не слипались */
  const labelEvery = days.length > 16 ? 3 : days.length > 8 ? 2 : 1;

  return (
    <div data-testid="daily-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="График заказов и визитов по дням"
      >
        {/* Линия визитов */}
        <polyline
          points={line.join(" ")}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* Столбики заказов */}
        {bars.map((b) => (
          <g key={b.day.date}>
            {b.h > 0 && (
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx="2"
                fill="var(--color-primary)"
                opacity="0.85"
              />
            )}
            <title>
              {b.day.date}: заказов {b.day.orders} ({Math.round(b.day.orders_sum_kopecks / 100)} ₽),
              визитов {b.day.sessions}{" "}
              {b.day.bots > 0 ? `(ботов ${b.day.bots})` : ""}
            </title>
            {/* Невидимая зона ховера на весь столбец */}
            <rect
              x={b.cx - 14}
              y={PAD.top}
              width="28"
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
            />
          </g>
        ))}
        {/* Подписи дней */}
        {bars.map((b, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`l-${b.day.date}`}
              x={b.cx}
              y={H - 8}
              textAnchor="middle"
              className="fill-[var(--color-muted)]"
              fontSize="10"
            >
              {shortDate(b.day.date)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-primary)]"
          />
          Заказы (макс. {maxOrders})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded bg-[var(--color-muted)]"
          />
          Визиты (макс. {maxSessions})
        </span>
      </div>
    </div>
  );
}
