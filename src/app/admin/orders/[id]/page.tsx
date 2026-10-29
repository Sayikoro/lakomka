import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { StatusChanger } from "@/components/admin/StatusChanger";
import { ResendEmailButton } from "@/components/admin/ResendEmailButton";

interface OrderItem {
  id: number;
  product_name: string;
  qty: number;
  price_kopecks: number;
}

interface HistoryEntry {
  status: string;
  comment: string | null;
  created_at: string;
}

interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_method: string;
  address: string | null;
  comment: string | null;
  total_kopecks: number;
  status: string;
  created_at: string;
  email_sent: number | null;
  email_error: string | null;
  items: OrderItem[];
  history: HistoryEntry[];
}

const DELIVERY_LABELS: Record<string, string> = {
  pickup: "Самовывоз",
  city: "По Хабаровску",
  region: "За городом",
  tk: "Транспортной компанией",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  paid: "Оплачен",
  shipped: "Отправлен",
  done: "Выполнен",
  cancelled: "Отменён",
};

async function getOrder(id: string): Promise<Order | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;

  const apiUrl = process.env.PHP_API_URL ?? "http://localhost:8000/api";
  try {
    const res = await fetch(`${apiUrl}/admin/orders/${id}`, {
      headers: { Cookie: `admin_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: Order };
    return json.data;
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderPage({ params }: PageProps) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/orders"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
        >
          ← К списку заказов
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
            Заказ {order.order_number}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Создан: {order.created_at}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-[var(--color-muted)]">Сумма</p>
          <p className="text-2xl font-semibold text-[var(--color-heading)]">
            {formatPrice(order.total_kopecks)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Левая колонка — состав и данные */}
        <div className="space-y-6">
          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--color-heading)]">
              Состав заказа
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                  <th className="pb-2">Товар</th>
                  <th className="pb-2 text-center">Кол-во</th>
                  <th className="pb-2 text-right">Цена</th>
                  <th className="pb-2 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr
                    key={it.id}
                    className="border-b border-[var(--color-border)] last:border-none"
                  >
                    <td className="py-2">{it.product_name}</td>
                    <td className="py-2 text-center">{it.qty}</td>
                    <td className="py-2 text-right text-[var(--color-muted)]">
                      {formatPrice(it.price_kopecks)}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {formatPrice(it.price_kopecks * it.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right text-sm text-[var(--color-muted)]">
                    Итого:
                  </td>
                  <td className="pt-3 text-right text-lg font-semibold text-[var(--color-heading)]">
                    {formatPrice(order.total_kopecks)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--color-heading)]">
              Клиент
            </h2>
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <dt className="text-[var(--color-muted)]">Имя</dt>
              <dd>{order.customer_name}</dd>

              <dt className="text-[var(--color-muted)]">Телефон</dt>
              <dd>
                <a href={`tel:${order.customer_phone}`} className="text-[var(--color-primary)] hover:underline">
                  {order.customer_phone}
                </a>
              </dd>

              {order.customer_email && (
                <>
                  <dt className="text-[var(--color-muted)]">Email</dt>
                  <dd>
                    <a href={`mailto:${order.customer_email}`} className="text-[var(--color-primary)] hover:underline">
                      {order.customer_email}
                    </a>
                    {order.email_sent === 1 && (
                      <span className="ml-2 inline-flex items-center gap-1 align-[-2px] text-xs font-medium text-green-700">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        письмо отправлено
                      </span>
                    )}
                  </dd>
                </>
              )}

              <dt className="text-[var(--color-muted)]">Доставка</dt>
              <dd>{DELIVERY_LABELS[order.delivery_method] ?? order.delivery_method}</dd>

              {order.address && (
                <>
                  <dt className="text-[var(--color-muted)]">Адрес</dt>
                  <dd>{order.address}</dd>
                </>
              )}

              {order.comment && (
                <>
                  <dt className="text-[var(--color-muted)]">Комментарий</dt>
                  <dd className="whitespace-pre-line">{order.comment}</dd>
                </>
              )}
            </dl>
          </section>
        </div>

        {/* Правая колонка — статус и история */}
        <aside className="space-y-6">
          {order.email_sent === 0 && order.customer_email && (
            <section className="rounded-[var(--radius-card)] border border-red-300 bg-red-50 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-red-700">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m2 7 10 6 10-6" />
                </svg>
                Письмо клиенту не отправлено
              </h2>
              <p className="mt-2 break-words text-sm text-red-600">
                {order.email_error ?? "Ошибка SMTP"}
              </p>
              <div className="mt-4">
                <ResendEmailButton orderId={order.id} />
              </div>
            </section>
          )}

          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-6">
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              Статус
            </h2>
            <p className="mb-4">
              <span className="inline-block rounded-full bg-white px-3 py-1 text-sm font-medium text-[var(--color-heading)]">
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            </p>
            <StatusChanger orderId={order.id} currentStatus={order.status} />
          </section>

          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              История
            </h2>
            {order.history.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Пока пусто</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {order.history.map((h, i) => (
                  <li key={i} className="border-l-2 border-[var(--color-primary)] pl-3">
                    <p className="font-medium text-[var(--color-heading)]">
                      {STATUS_LABELS[h.status] ?? h.status}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">{h.created_at}</p>
                    {h.comment && (
                      <p className="mt-1 text-[var(--color-body)]">{h.comment}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}