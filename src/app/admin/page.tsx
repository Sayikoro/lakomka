"use client";

/* Корневая страница админки: клиентский редирект на заказы.
 * (клиентский — чтобы работать в статическом деплое) */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/orders");
  }, [router]);

  return (
    <p className="animate-pulse text-sm text-[var(--color-muted)]">
      Открываем заказы…
    </p>
  );
}
