"use client";

/* Редактирование пользователя — клиентская версия (бывшая /admin/users/[id]).
 * В статическом деплое динамические роуты не работают без generateStaticParams,
 * поэтому редактирование живёт на query-параметре: /admin/users/edit?id=2. */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserForm, type UserFormValues } from "@/components/admin/UserForm";

function UserEditInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [user, setUser] = useState<UserFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/users`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        setUser(null);
        return;
      }
      const list = (json.data as {
        id: number;
        email: string;
        name: string | null;
        role: string;
      }[]) ?? [];
      const found = list.find((u) => String(u.id) === id) ?? null;
      if (!found) {
        setError("Пользователь не найден");
        setUser(null);
        return;
      }
      setUser({
        id: found.id,
        email: found.email,
        name: found.name ?? "",
        role: found.role as UserFormValues["role"],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) {
    return (
      <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Не указан пользователь. Выберите его в{" "}
        <Link href="/admin/users" className="underline">
          списке пользователей
        </Link>
        .
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
        Загрузка…
      </div>
    );
  }

  if (error || !user) {
    return (
      <div>
        <div className="mb-6">
          <Link
            href="/admin/users"
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
          >
            ← К пользователям
          </Link>
        </div>
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error ?? "Пользователь не найден"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link
          href="/admin/users"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
        >
          ← К пользователям
        </Link>
      </div>
      <h1 className="mb-6 text-[24px] font-medium text-[var(--color-heading)]">
        {user.email}
      </h1>
      <UserForm mode="edit" initial={user} />
    </div>
  );
}

export default function AdminUserEditPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      }
    >
      <UserEditInner />
    </Suspense>
  );
}
