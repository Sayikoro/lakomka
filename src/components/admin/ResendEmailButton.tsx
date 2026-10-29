"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Кнопка «Отправить клиенту» — повторная отправка письма о заказе.
 * Показывается, когда письмо клиенту не ушло (orders.email_sent = 0).
 */
export function ResendEmailButton({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function resend() {
    setState("sending");
    setMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const res = await fetch(`${apiUrl}/admin/orders/${orderId}/resend-email`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        setMsg(json.error ?? "Не удалось отправить письмо");
        return;
      }
      setState("done");
      setMsg(
        json?.data?.to
          ? `Письмо отправлено на ${json.data.to}`
          : "Письмо отправлено"
      );
      router.refresh();
    } catch {
      setState("error");
      setMsg("Ошибка сети");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={resend}
        disabled={state === "sending"}
        className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
      >
        {state === "sending" ? "Отправляем…" : "Отправить клиенту"}
      </button>
      {state === "done" && <p className="mt-2 text-sm font-medium text-green-700">{msg}</p>}
      {state === "error" && <p className="mt-2 text-sm font-medium text-red-700">{msg}</p>}
    </div>
  );
}
