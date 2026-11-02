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
 *
 * Навигация (Task 115): панель разделов переехала из горизонтальной шапки
 * в ЛЕВЫЙ САЙДБАР — на десктопе он закреплён слева, на планшете/телефоне
 * прячется за бургер (выезжающее меню с затемнением). Активный раздел
 * подсвечивается. Набор ссылок и правила видимости по ролям не изменились.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { DownloadsProvider } from "@/components/admin/downloads/Downloads";
import { NewOrdersBadge, UpdateBadge } from "@/components/admin/AdminIndicators";
import { ThemeToggle } from "@/components/admin/ThemeToggle";

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

/* Разделы админки. roles — кому видно (undefined = всем ролям).
 * «Текст на страницах» — редактор и супер-админ (Task 112). */
const NAV: { href: string; label: string; icon: string; roles?: Role[] }[] = [
  { href: "/admin/orders", label: "Заказы", icon: "🧾" },
  { href: "/admin/products", label: "Товары", icon: "📦" },
  { href: "/admin/weight-recipes", label: "Рецепты", icon: "⚖️" },
  { href: "/admin/candies", label: "Конфеты", icon: "🍬" },
  { href: "/admin/pdf", label: "PDF", icon: "📄" },
  { href: "/admin/files", label: "Файлы", icon: "📁" },
  { href: "/admin/page-texts", label: "Текст на страницах", icon: "📝", roles: ["super_admin", "editor"] },
  { href: "/admin/users", label: "Пользователи", icon: "👥", roles: ["super_admin"] },
  { href: "/admin/settings", label: "Настройки", icon: "⚙️", roles: ["super_admin"] },
];

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
  /* Выезжающее меню на экранах < lg (планшет/телефон) */
  const [menuOpen, setMenuOpen] = useState(false);

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

  /* Esc закрывает выезжающее меню */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!checked && !isLoginPage) return <AuthSplash />;
  if (checked && !user && !isLoginPage) return <AuthSplash />;

  /* Страница входа — без оболочки: форма сама занимает весь экран */
  if (isLoginPage) return <>{children}</>;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const navItems = NAV.filter(
    (item) => !item.roles || (user !== null && item.roles.includes(user.role)),
  );

  const sidebar = (
    <aside
      data-testid="admin-sidebar"
      className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)] shadow-xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Бренд */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-5">
        <span className="text-xl" aria-hidden="true">
          🎁
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-[var(--color-heading)]">
            Лакомка
          </p>
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            Админ-панель
          </p>
        </div>
      </div>

      {/* Разделы */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Разделы админки">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[14px] px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--color-bg-soft)] font-medium text-[var(--color-primary)]"
                  : "text-[var(--color-body)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-heading)]"
              }`}
            >
              <span className="w-5 text-center text-base" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.href === "/admin/orders" && (
                <NewOrdersBadge onOrdersPage={isActive("/admin/orders")} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Низ сайдбара: обновление, пользователь, тема, выход */}
      <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-3 text-sm">
        <UpdateBadge isSuperAdmin={user?.role === "super_admin"} />
        {/* Task 121: переключатель тёмной темы — на всех ролях */}
        <div className="mt-2">
          <ThemeToggle />
        </div>
        {user && (
          <div className="mt-2">
            <p
              className="truncate text-[13px] font-medium text-[var(--color-heading)]"
              title={user.email}
            >
              {user.email}
            </p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="rounded-full bg-[var(--color-bg-soft)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              <LogoutButton />
            </div>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg-soft)]">
      {sidebar}

      {/* Затемнение под выезжающим меню (только < lg) */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <div className="lg:pl-64">
        {/* Верхняя панель мобильных/планшетов: бургер + название */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-card)] px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Открыть меню"
            className="rounded-lg p-2 text-xl leading-none text-[var(--color-heading)] hover:bg-[var(--color-bg-soft)]"
          >
            ☰
          </button>
          <span className="text-[15px] font-semibold text-[var(--color-heading)]">
            Лакомка · Админ-панель
          </span>
        </div>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <DownloadsProvider>{children}</DownloadsProvider>
        </main>
      </div>
    </div>
  );
}
