"use client";

/* Пользователи — клиентская версия (данные через /api/admin/users),
 * работает и в dev, и в статическом деплое. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UsersTable } from "@/components/admin/UsersTable";

export interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  role: "super_admin" | "editor" | "viewer";
  last_login_at: string | null;
  created_at: string;
}

export default function AdminUsersPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/users`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        setUsers([]);
        return;
      }
      setUsers((json.data as AdminUser[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setUsers([]);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
          Пользователи{" "}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            ({users?.length ?? "…"})
          </span>
        </h1>
        <Link
          href="/admin/users/new"
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          + Добавить пользователя
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {users === null ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      ) : (
        <UsersTable initialUsers={users} />
      )}
    </div>
  );
}
