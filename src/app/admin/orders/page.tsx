"use client";

/* Список заказов — клиентская версия (данные через /api/admin/orders).
 * Клиентская, чтобы страница работала в статическом деплое: браузер сам
 * отправляет httpOnly-куку admin_token, PHP-API отдаёт данные только с ней. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

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

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  paid: "Оплачен",
  shipped: "Отправлен",
  done: "Выполнен",
  cancelled: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  confirmed: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  shipped: "bg-indigo-100 text-indigo-800",
  done: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

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

export default function AdminOrdersPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/orders`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        setOrders([]);
        return;
      }
      setOrders((json.data as OrderRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setOrders([]);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
          Заказы
        </h1>
        <span className="text-sm text-[var(--color-muted)]">
          Всего: {orders?.length ?? "…"}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {orders === null ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-white p-12 text-center text-[var(--color-muted)]">
          Заказов пока нет
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
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
                  className="border-b border-[var(--color-border)] last:border-none hover:bg-[var(--color-bg-soft)]"
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
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
