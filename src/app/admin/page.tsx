"use client";

/* «Обзор» — новая главная админки (Task 137, редизайн состава).
 *
 * Раньше /admin просто перекидывал на заказы. Теперь это дашборд:
 * самое важное за один взгляд — заказы, каталог, посетители, защита.
 * Данные берутся ИСКЛЮЧИТЕЛЬНО из существующих read-only API
 * (fail-soft: недоступен один блок — остальные живут):
 *   - /api/admin/orders/unread      → новые/все заказы + последний;
 *   - /api/admin/analytics/summary  → посетители, боты, корзины, блок-лист;
 *   - /api/admin/products?per_page=1 → всего товаров (поле total).
 * Быстрые действия ведут в существующие разделы — новой логики нет.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { ComponentType, SVGProps } from "react";
import {
  IconAnalytics,
  IconBox,
  IconFolder,
  IconOrders,
  IconPdf,
  IconPlus,
} from "@/components/admin/icons";

interface UnreadData {
  count_since: number;
  count_new: number;
  latest: { order_number: string; customer_name: string; total_kopecks: number } | null;
}

interface SummaryData {
  period: {
    humans: number;
    bots: number;
    suspected: number;
    cart_adds: number;
  };
  today: { sessions: number; views: number };
  blocked_ips: number;
}

/* Поверхность плитки: карточка + появление; ховер-тень только у кликабельных */
const TILES_BASE = "admin-card adm-rise flex flex-col gap-1 p-4 sm:p-5";
const TILES_LINK = `${TILES_BASE} transition-shadow hover:shadow-md`;
const ACTION_TILE = "admin-card adm-rise transition-shadow hover:shadow-md";

function ActionTileContent({
  icon: Icon,
  label,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
}) {
  return (
    <span className="flex h-full flex-col items-start justify-center gap-2 p-4 sm:p-5">
      <Icon className="h-5 w-5 text-[var(--color-primary)]" />
      <span className="text-sm font-medium text-[var(--color-heading)]">{label}</span>
    </span>
  );
}

export default function AdminDashboardPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [unread, setUnread] = useState<UnreadData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [totalProducts, setTotalProducts] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      /* Заказы */
      try {
        const res = await fetch(`${apiUrl}/admin/orders/unread?since_id=0`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (alive && res.ok) setUnread(json.data ?? null);
      } catch {
        /* блок останется с «—» */
      }

      /* Аналитика */
      try {
        const res = await fetch(`${apiUrl}/admin/analytics/summary?days=7`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (alive && res.ok) setSummary(json.data ?? null);
      } catch {
        /* fail-soft */
      }

      /* Всего товаров (per_page=1 — ответ лёгкий, нужен только total) */
      try {
        const res = await fetch(`${apiUrl}/admin/products?page=1&per_page=1`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (alive && res.ok) {
          const total = Number((json as { total?: number }).total);
          setTotalProducts(Number.isFinite(total) ? total : null);
        }
      } catch {
        /* fail-soft */
      }
    })();

    return () => {
      alive = false;
    };
  }, [apiUrl]);

  const dash = "—";

  return (
    <div>
      {/* Шапка дашборда */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight text-[var(--color-heading)]">
            Обзор
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Главное по магазину — на одном экране
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--color-primary-hover)]"
        >
          <IconPlus className="h-4 w-4" />
          Добавить товар
        </Link>
      </div>

      {/* Ключевые показатели */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Link href="/admin/orders" className={TILES_LINK}>
          <span className="text-[13px] text-[var(--color-muted)]">
            Новые заказы
          </span>
          <span className="text-[28px] font-semibold leading-tight text-rose-600">
            {unread ? unread.count_new : "…"}
          </span>
          {unread?.latest && (
            <span className="truncate text-xs text-[var(--color-muted)]">
              Последний: {unread.latest.order_number}
            </span>
          )}
        </Link>

        <Link href="/admin/orders" className={TILES_LINK}>
          <span className="text-[13px] text-[var(--color-muted)]">
            Всего заказов
          </span>
          <span className="text-[28px] font-semibold leading-tight text-[var(--color-heading)]">
            {unread ? unread.count_since : "…"}
          </span>
          <span className="text-xs text-[var(--color-muted)]">
            за всё время
          </span>
        </Link>

        <Link href="/admin/products" className={TILES_LINK}>
          <span className="text-[13px] text-[var(--color-muted)]">
            Товаров
          </span>
          <span className="text-[28px] font-semibold leading-tight text-[var(--color-heading)]">
            {totalProducts ?? "…"}
          </span>
          <span className="text-xs text-[var(--color-muted)]">
            в каталоге
          </span>
        </Link>

        <Link href="/admin/analytics" className={TILES_LINK}>
          <span className="text-[13px] text-[var(--color-muted)]">
            Визитов сегодня
          </span>
          <span className="text-[28px] font-semibold leading-tight text-[var(--color-heading)]">
            {summary ? summary.today.sessions : "…"}
          </span>
          <span className="text-xs text-[var(--color-muted)]">
            просмотров: {summary ? summary.today.views : dash}
          </span>
        </Link>
      </div>

      {/* Последний заказ */}
      {unread?.latest && (
        <div className="admin-card adm-rise mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5">
          <span className="font-medium text-[var(--color-heading)]">
            {unread.latest.order_number}
          </span>
          <span className="text-[var(--color-body)]">
            {unread.latest.customer_name}
          </span>
          <span className="font-medium text-[var(--color-primary)]">
            {formatPrice(unread.latest.total_kopecks)}
          </span>
          <Link
            href="/admin/orders"
            className="ml-auto text-sm text-[var(--color-primary)] hover:underline"
          >
            Открыть заказы →
          </Link>
        </div>
      )}

      {/* Посетители и защита */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Посетители за 7 дней
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className={TILES_BASE}>
          <span className="text-[13px] text-[var(--color-muted)]">Люди</span>
          <span className="text-[22px] font-semibold text-emerald-600">
            {summary ? summary.period.humans : "…"}
          </span>
        </div>
        <div className={TILES_BASE}>
          <span className="text-[13px] text-[var(--color-muted)]">Боты</span>
          <span className="text-[22px] font-semibold text-rose-600">
            {summary ? summary.period.bots : "…"}
          </span>
          {summary && summary.period.suspected > 0 && (
            <span className="text-xs text-amber-600">
              Подозрительных: {summary.period.suspected}
            </span>
          )}
        </div>
        <div className={TILES_BASE}>
          <span className="text-[13px] text-[var(--color-muted)]">
            «В корзину»
          </span>
          <span className="text-[22px] font-semibold text-[var(--color-heading)]">
            {summary ? summary.period.cart_adds : "…"}
          </span>
        </div>
        <div className={TILES_BASE}>
          <span className="text-[13px] text-[var(--color-muted)]">
            Заблокировано IP
          </span>
          <span className="text-[22px] font-semibold text-[var(--color-heading)]">
            {summary ? summary.blocked_ips : "…"}
          </span>
        </div>
      </div>

      {/* Быстрые действия */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Быстрые действия
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <Link href="/admin/products/new" className={ACTION_TILE}>
          <ActionTileContent icon={IconPlus} label="Новый товар" />
        </Link>
        <Link href="/admin/pdf" className={ACTION_TILE}>
          <ActionTileContent icon={IconPdf} label="PDF по подаркам" />
        </Link>
        <Link href="/admin/files" className={ACTION_TILE}>
          <ActionTileContent icon={IconFolder} label="Файлы и медиа" />
        </Link>
        <Link href="/admin/products" className={ACTION_TILE}>
          <ActionTileContent icon={IconBox} label="Каталог" />
        </Link>
        <Link href="/admin/analytics" className={ACTION_TILE}>
          <ActionTileContent icon={IconAnalytics} label="Аналитика" />
        </Link>
        <Link href="/admin/orders" className={ACTION_TILE}>
          <ActionTileContent icon={IconOrders} label="Все заказы" />
        </Link>
      </div>
    </div>
  );
}
