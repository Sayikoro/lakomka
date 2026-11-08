"use client";

/* Список заказов — клиентская версия (данные через /api/admin/orders).
 * Клиентская, чтобы страница работала в статическом деплое: браузер сам
 * отправляет httpOnly-куку admin_token, PHP-API отдаёт данные только с ней.
 *
 * Task 137 (редизайн): на экранах ≥lg — таблица, на телефоне/планшете —
 * карточки заказов (таблица на 390px не читается). Данные одни и те же,
 * разница только в подаче.
 *
 * Task 152: фильтры (статус, номер, точный телефон, письма, период дат),
 * пагинация, денежная сводка по фильтру и выгрузка CSV. Поиск по телефону —
 * ТОЛЬКО точное совпадение: номер хранится зашифрованным, в БД есть лишь
 * blind-index хеш полного номера. */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
} from "@/lib/order-status";

interface OrderRow {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  total_kopecks: number;
  status: string;
  delivery_method: string;
  created_at: string;
  email_sent: number | null;
  email_error: string | null;
  items_preview: { product_name: string; qty: number }[];
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        ORDER_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Красный конверт — письмо клиенту не ушло (orders.email_sent = 0) */
function MailFailedIcon({ error }: { error: string | null }) {
  return (
    <span
      title={`Письмо клиенту не отправлено: ${error ?? "ошибка SMTP"}`}
      aria-label="Письмо клиенту не отправлено"
      className="ml-2 inline-flex cursor-help align-[-2px]"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-red-600"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 7 10 6 10-6" />
      </svg>
    </span>
  );
}

/** Окно номеров страниц: 1 … (текущая ±2) … последняя */
function pageNumbers(current: number, total: number): number[] {
  const out = new Set<number>([1, total]);
  for (let n = current - 2; n <= current + 2; n++) {
    if (n >= 1 && n <= total) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

const EMPTY_FILTERS = {
  status: "",
  number: "",
  phone: "",
  email: "",
  from: "",
  to: "",
};

export default function AdminOrdersPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  /* Фильтры (дебаунс 300 мс — один таймер на всё) */
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [sumKopecks, setSumKopecks] = useState<number | null>(null);

  /* Токен-гард: устаревшие ответы отбрасываются */
  const seqRef = useRef(0);

  /* Task 152: начальные фильтры из URL — плитки-тревоги дашборда ведут на
   * /admin/orders?email=0. Читаем ПОСЛЕ гидрации, чтобы не расходиться
   * с prerender-HTML. */
  const filtersFromUrlRef = useRef(false);
  useEffect(() => {
    if (filtersFromUrlRef.current) return;
    filtersFromUrlRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    const patch: Partial<typeof EMPTY_FILTERS> = {};
    for (const key of ["status", "number", "phone", "email", "from", "to"] as const) {
      const v = sp.get(key) ?? "";
      if (v) patch[key] = v;
    }
    if (Object.keys(patch).length > 0) {
      /* Миктотаск: синхронный setState в эффекте — react-hooks/set-state-in-effect
       * (тот же приём, что в analytics/page.tsx). */
      void Promise.resolve().then(() => setFilters((f) => ({ ...f, ...patch })));
    }
  }, []);

  const hasFilters = useMemo(
    () => Object.values(filters).some((v) => v !== ""),
    [filters],
  );

  const query = useMemo(() => {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("per_page", String(perPage));
    if (filters.status) q.set("status", filters.status);
    if (filters.number) q.set("number", filters.number.trim());
    if (filters.phone) q.set("phone", filters.phone.trim());
    if (filters.email) q.set("email", filters.email);
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    return q.toString();
  }, [page, perPage, filters]);

  useEffect(() => {
    /* Миктотаск: setFetching(true) синхронно дёргает setState —
     * react-hooks/set-state-in-effect. */
    void Promise.resolve().then(() => setFetching(true));
    const t = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const res = await fetch(`${apiUrl}/admin/orders?${query}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (seq !== seqRef.current) return;
        if (!res.ok) {
          setError(json.error ?? `Ошибка ${res.status}`);
          setOrders([]);
          setTotal(null);
          return;
        }
        setError(null);
        setOrders((json.data as OrderRow[]) ?? []);
        setTotal(Number(json.total) || 0);
        setPages(Math.max(1, Number(json.pages) || 1));
        setSumKopecks(Number(json.sum_kopecks) || 0);
      } catch (e) {
        if (seq !== seqRef.current) return;
        setError(e instanceof Error ? e.message : "Ошибка сети");
        setOrders([]);
      } finally {
        if (seq === seqRef.current) setFetching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [apiUrl, query]);

  const csvHref = useMemo(() => {
    const q = new URLSearchParams(query);
    q.delete("page");
    q.delete("per_page");
    return `${apiUrl}/admin/orders/export?${q.toString()}`;
  }, [apiUrl, query]);

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setPage(1);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight text-[var(--color-heading)]">
            Заказы
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {total === null
              ? "…"
              : `Найдено ${total} заказ(ов) на сумму ${
                  sumKopecks !== null ? formatPrice(sumKopecks) : "…"
                }`}
          </p>
        </div>
        <a
          href={csvHref}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-primary)]"
          title="Выгрузить заказы по текущим фильтрам в CSV (Excel)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Экспорт CSV
        </a>
      </div>

      {/* ── Фильтры (Task 152) ── */}
      <div className="admin-card mb-4 p-4" data-testid="orders-filters">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <label className="block text-xs text-[var(--color-muted)]">
            Статус
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm text-[var(--color-heading)]"
            >
              <option value="">Все статусы</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-[var(--color-muted)]">
            Номер заказа
            <input
              type="text"
              value={filters.number}
              onChange={(e) => setFilter("number", e.target.value)}
              placeholder="ЛК-2026…"
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm text-[var(--color-heading)] placeholder:text-[var(--color-muted)]"
            />
          </label>
          <label className="block text-xs text-[var(--color-muted)]">
            Телефон (точно)
            <input
              type="tel"
              value={filters.phone}
              onChange={(e) => setFilter("phone", e.target.value)}
              placeholder="+7 900 000-00-00"
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm text-[var(--color-heading)] placeholder:text-[var(--color-muted)]"
            />
          </label>
          <label className="block text-xs text-[var(--color-muted)]">
            Письмо клиенту
            <select
              value={filters.email}
              onChange={(e) => setFilter("email", e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm text-[var(--color-heading)]"
            >
              <option value="">Все</option>
              <option value="0">Не отправлено</option>
              <option value="1">Отправлено</option>
            </select>
          </label>
          <label className="block text-xs text-[var(--color-muted)]">
            С даты
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilter("from", e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm text-[var(--color-heading)]"
            />
          </label>
          <label className="block text-xs text-[var(--color-muted)]">
            По дату
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilter("to", e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm text-[var(--color-heading)]"
            />
          </label>
        </div>
        {hasFilters && (
          <div className="mt-3">
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              Сбросить фильтры
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {orders === null ? (
        <div className="admin-card p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      ) : orders.length === 0 ? (
        <div className="admin-card p-12 text-center text-[var(--color-muted)]">
          {hasFilters ? "По фильтрам ничего не найдено" : "Заказов пока нет"}
        </div>
      ) : (
        <>
          {/* ── Десктоп: таблица ── */}
          <div className={`admin-card hidden overflow-x-auto transition-opacity lg:block ${fetching ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                  <th className="p-3">Номер</th>
                  <th className="p-3">Дата</th>
                  <th className="p-3">Клиент</th>
                  <th className="p-3">Телефон</th>
                  <th className="p-3">Состав</th>
                  <th className="p-3 text-right">Сумма</th>
                  <th className="p-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-[var(--color-border)] transition-colors last:border-none hover:bg-[var(--color-bg-soft)]"
                  >
                    <td className="p-3">
                      <Link
                        href={`/admin/orders/view?id=${o.id}`}
                        className="font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {o.order_number}
                      </Link>
                      {o.email_sent === 0 && <MailFailedIcon error={o.email_error} />}
                    </td>
                    <td className="p-3 text-[var(--color-muted)]">
                      {o.created_at}
                    </td>
                    <td className="p-3">{o.customer_name}</td>
                    <td className="p-3 text-[var(--color-muted)]">
                      {o.customer_phone}
                    </td>
                    <td className="p-3 text-[var(--color-muted)]">
                      {o.items_preview.length} поз.
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatPrice(o.total_kopecks)}
                    </td>
                    <td className="p-3">
                      <StatusChip status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Телефон/планшет (<lg): карточки ── */}
          <div className={`space-y-3 transition-opacity lg:hidden ${fetching ? "opacity-60" : ""}`}>
            {orders.map((o) => (
              <div key={o.id} className="admin-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/orders/view?id=${o.id}`}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    {o.order_number}
                  </Link>
                  <StatusChip status={o.status} />
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {o.created_at}
                  {o.email_sent === 0 && <MailFailedIcon error={o.email_error} />}
                </p>
                <p className="mt-2 text-sm text-[var(--color-heading)]">
                  {o.customer_name}
                </p>
                <p className="text-sm text-[var(--color-muted)]">
                  {o.customer_phone}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-sm">
                  <span className="text-[var(--color-muted)]">
                    {o.items_preview.length} поз.
                  </span>
                  <span className="font-semibold text-[var(--color-heading)]">
                    {formatPrice(o.total_kopecks)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Пагинация (Task 152). Подвал виден при любом числе заказов —
              иначе при ≤50 заказах нельзя переключить «На странице»; кнопки
              листания появляются только когда страниц больше одной. ── */}
          {total !== null && total > 0 && (
            <div
              data-testid="orders-pagination"
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
            >
              <span className="text-sm text-[var(--color-muted)]">
                Страница {page} из {pages}
                {` · всего ${total}`}
              </span>
              {pages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1 || fetching}
                  onClick={() => setPage(1)}
                  aria-label="Первая страница"
                  className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={page <= 1 || fetching}
                  onClick={() => setPage(page - 1)}
                  aria-label="Предыдущая страница"
                  className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]"
                >
                  ‹
                </button>
                {pageNumbers(page, pages).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={fetching}
                    onClick={() => setPage(n)}
                    aria-current={n === page ? "page" : undefined}
                    className={`min-w-[34px] rounded-lg border px-2 py-1.5 text-sm transition-colors ${
                      n === page
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= pages || fetching}
                  onClick={() => setPage(page + 1)}
                  aria-label="Следующая страница"
                  className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]"
                >
                  ›
                </button>
                <button
                  type="button"
                  disabled={page >= pages || fetching}
                  onClick={() => setPage(pages)}
                  aria-label="Последняя страница"
                  className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm disabled:opacity-40 hover:border-[var(--color-primary)]"
                >
                  »
                </button>
              </div>
              )}
              <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                На странице
                <select
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value) || 50);
                    setPage(1);
                  }}
                  aria-label="Заказов на странице"
                  className="rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm"
                >
                  {[20, 50, 100, 200].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
