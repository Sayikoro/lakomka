/**
 * Task 152: единый источник статусов заказа.
 * Раньше labels/цвета дублировались в orders/page.tsx, orders/view/page.tsx
 * и StatusChanger.tsx — при добавлении статуса они расходились. Теперь
 * все три файла импортируют отсюда; бэкенд-источник — OrderStatuses.php,
 * жёсткая гарантия — CHECK в schema.sql.
 */

export type OrderStatus =
  | "new"
  | "confirmed"
  | "paid"
  | "shipped"
  | "done"
  | "cancelled";

export interface OrderStatusMeta {
  value: OrderStatus;
  label: string;
  /** Tailwind-классы чипа в списке заказов. */
  chip: string;
}

export const ORDER_STATUSES: OrderStatusMeta[] = [
  { value: "new", label: "Новый", chip: "bg-blue-100 text-blue-800" },
  { value: "confirmed", label: "Подтверждён", chip: "bg-yellow-100 text-yellow-800" },
  { value: "paid", label: "Оплачен", chip: "bg-green-100 text-green-800" },
  { value: "shipped", label: "Отправлен", chip: "bg-indigo-100 text-indigo-800" },
  { value: "done", label: "Выполнен", chip: "bg-gray-100 text-gray-700" },
  { value: "cancelled", label: "Отменён", chip: "bg-red-100 text-red-700" },
];

export const ORDER_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  ORDER_STATUSES.map((s) => [s.value, s.label]),
);

export const ORDER_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  ORDER_STATUSES.map((s) => [s.value, s.chip]),
);

export const ORDER_STATUS_VALUES: OrderStatus[] = ORDER_STATUSES.map((s) => s.value);

export function isOrderStatus(v: string): v is OrderStatus {
  return ORDER_STATUS_VALUES.includes(v as OrderStatus);
}

/** Способы доставки (были продублированы в view/page.tsx). */
export const DELIVERY_LABELS: Record<string, string> = {
  pickup: "Самовывоз",
  city: "По Хабаровску",
  region: "За городом",
  tk: "Транспортной компанией",
};
