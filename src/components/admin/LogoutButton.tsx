"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    // Относительный /api — Next проксирует на PHP (next.config rewrites).
    // Работает и на localhost, и через preview-туннель (абсолютный
    // http://localhost:8000 из браузера туннеля давал Failed to fetch).
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    try {
      await fetch(`${apiUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Бэкенд недоступен — всё равно уводим на логин:
      // выход не должен ломаться из-за сетевой ошибки.
    }
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
    >
      Выйти
    </button>
  );
}