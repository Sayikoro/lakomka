import { cookies } from "next/headers";
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

async function getOrders(): Promise<OrderRow[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return [];

  const apiUrl = process.env.PHP_API_URL ?? "http://localhost:8000/api";
  try {
    const res = await fetch(`${apiUrl}/admin/orders`, {
      headers: { Cookie: `admin_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: OrderRow[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export default async function AdminOrdersPage() {
  const orders = await getOrders();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
          Заказы
        </h1>
        <span className="text-sm text-[var(--color-muted)]">
          Всего: {orders.length}
        </span>
      </div>

      {orders.length === 0 ? (
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
                      href={`/admin/orders/${o.id}`}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {o.order_number}
                    </Link>
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
