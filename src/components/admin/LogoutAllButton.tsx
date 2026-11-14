"use client";

/* Task 152: «Выйти на всех устройствах».
 * Отзывает ВСЕ JWT текущего пользователя: бэкенд инкрементирует
 * users.token_version, Auth::requireAuth отклоняет токены с устаревшей
 * версией — соседние входы (телефон, планшет, другой браузер) вылетают
 * мгновенно, не дожидаясь истечения 7-дневного срока. Текущее устройство
 * тоже отзывается — после ответа уводим на логин. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm, useToast } from "@/components/admin/Feedback";

export function LogoutAllButton() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function logoutAll() {
    const ok = await confirm({
      title: "Выйти на всех устройствах?",
      message:
        "Все активные сессии (телефон, планшет, другие браузеры) будут отозваны. На каждом устройстве потребуется войти заново.",
      confirmLabel: "Выйти везде",
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const res = await fetch(`${apiUrl}/auth/logout-all`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast("Все сессии отозваны — войдите заново", "info");
      } else {
        toast("Не удалось отозвать сессии", "error");
      }
    } catch {
      toast("Ошибка сети", "error");
    } finally {
      /* Токен отозван (или недоступен) — в любом случае на логин */
      router.push("/admin/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logoutAll}
      disabled={busy}
      title="Выйти на всех устройствах (отозвать все сессии)"
      data-testid="logout-all"
      className="shrink-0 rounded-lg p-1.5 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-heading)] disabled:opacity-50"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m10 13-5 5m0 0 5 5m-5-5h9a5 5 0 0 0 0-10h-1" />
        <line x1="16" x2="22" y1="2" y2="8" />
        <line x1="22" x2="16" y1="8" y2="2" />
      </svg>
      <span className="sr-only">Выйти на всех устройствах</span>
    </button>
  );
}
