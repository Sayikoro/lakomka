import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderSuccessClient } from "./OrderSuccessClient";

export const metadata: Metadata = {
  title: "Заказ оформлен — Лакомка",
};

/* Номер заказа приходит query-параметром (?number=...) — так страница
 * остаётся полностью статической и работает в экспорте для ЛЮБОГО
 * номера заказа (раньше был динамический роут order/[number]). */
export default function OrderSuccessPage() {
  return (
    <Suspense fallback={null}>
      <OrderSuccessClient />
    </Suspense>
  );
}
