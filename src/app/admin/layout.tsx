"use client";

/* Клиентский layout админки.
 *
 * Раньше здесь был server-компонент с getCurrentUser() через cookies() —
 * но админка должна работать и в статическом деплое (Next.js export на
 * обычном хостинге с PHP-API), где серверных функций Next нет. Теперь
 * авторизация проверяется клиентом через /api/auth/me (httpOnly-кука
 * admin_token уходит браузером автоматически), при 401 — редирект на вход.
 * PHP-API сам защищает все данные, поэтому без токена рендерится только
 * каркас без содержимого.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { DownloadsProvider } from "@/components/admin/downloads/Downloads";

type Role = "super_admin" | "editor" | "viewer";

interface CurrentUser {
  id: number;
  email: string;
  role: Role;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Супер-админ",
  editor: "Редактор",
  viewer: "Просмотр",
};

function AuthSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-soft)]">
      <p className="animate-pulse text-sm text-[var(--color-muted)]">
        Проверяем доступ…
      </p>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checked, setChecked] = useState(false);

  const isLoginPage = pathname.startsWith("/admin/login");

  /* Перепроверяем токен при каждой смене страницы админки (в т.ч. после
   * входа/выхода — pathname меняется, состояние обновляется). */
  useEffect(() => {
    let alive = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/me`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setUser(res.ok ? (json.data ?? null) : null);
      } catch {
        if (alive) setUser(null);
      } finally {
        if (alive) setChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pathname]);

  /* Не авторизован и не на странице входа → редирект на вход */
  useEffect(() => {
    if (checked && !user && !isLoginPage) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [checked, user, isLoginPage, pathname, router]);

  if (!checked && !isLoginPage) return <AuthSplash />;
  if (checked && !user && !isLoginPage) return <AuthSplash />;

  return (
    <div className="min-h-screen bg-[var(--color-bg-soft)]">
      <header className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/admin/orders"
              className="font-medium text-[var(--color-heading)] hover:text-[var(--color-primary)]"
            >
              Заказы
            </Link>
            <Link
              href="/admin/products"
              className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
            >
              Товары
            </Link>
            <Link
              href="/admin/weight-recipes"
              className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
            >
              Рецепты
            </Link>
            <Link
              href="/admin/candies"
              className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
            >
              Конфеты
            </Link>
            <Link
              href="/admin/pdf"
              className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
            >
              PDF
            </Link>
            <Link
              href="/admin/files"
              className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
            >
              Файлы
            </Link>
            {user?.role === "super_admin" && (
              <Link
                href="/admin/users"
                className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
              >
                Пользователи
              </Link>
            )}
            {user?.role === "super_admin" && (
              <Link
                href="/admin/settings"
                className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
              >
                Настройки
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-4 text-sm">
            {user && (
              <span className="text-[var(--color-muted)]">
                {user.email}
                <span className="ml-2 rounded-full bg-[var(--color-bg-soft)] px-2 py-0.5 text-[11px]">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <DownloadsProvider>{children}</DownloadsProvider>
      </main>
    </div>
  );
}
