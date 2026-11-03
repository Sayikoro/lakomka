"use client";

/* Клиентский layout админки — «Админка 2.0» (Task 137, редизайн).
 *
 * Авторизация по-прежнему проверяется клиентом через /api/auth/me
 * (админка работает в статическом деплое, где серверных функций Next нет):
 * при 401 — редирект на вход. PHP-API сам защищает все данные.
 *
 * Новая оболочка:
 *  - ЛЕВЫЙ САЙДБАР (десктоп ≥lg): бренд, разделы, СГРУППИРОВАННЫЕ по смыслу
 *    («Продажи», «Каталог», «Контент», «Система»), внизу — карточка пользователя.
 *    Иконки — единый линейный SVG-набор вместо эмодзи (перекрашиваются темой).
 *  - ВЕРХНЯЯ ПАНЕЛЬ (все экраны): заголовок текущего раздела, бейдж обновления
 *    (super_admin), ссылка «На сайт», переключатель темы, бургер на <lg.
 *  - НИЖНЯЯ ТАБ-ПАНЕЛЬ (телефон/планшет <lg): Обзор · Заказы · Товары ·
 *    Аналитика · Ещё — самые частые действия под большой палец; «Ещё»
 *    открывает выезжающее меню со всеми разделами.
 *  - Формы/скроллбары/фокус приведены к единому виду CSS-слоем .admin-scope
 *    (globals.css, Task 137) — витрину он не затрагивает.
 *
 * Набор ссылок и правила видимости по ролям не изменились.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { DownloadsProvider } from "@/components/admin/downloads/Downloads";
import { NewOrdersBadge, UpdateBadge } from "@/components/admin/AdminIndicators";
import { ThemeToggle } from "@/components/admin/ThemeToggle";
import {
  IconAnalytics,
  IconBox,
  IconCandy,
  IconExternal,
  IconFolder,
  IconHome,
  IconMenu,
  IconOrders,
  IconPdf,
  IconScale,
  IconSettings,
  IconText,
  IconUsers,
} from "@/components/admin/icons";

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

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles?: Role[];
};

/* Разделы админки, сгруппированные по смыслу (Task 137).
 * Сами ссылки и их href не менялись — только порядок подачи.
 * roles — кому видно (undefined = всем ролям).
 * «Текст на страницах» — редактор и супер-админ (Task 112). */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Продажи",
    items: [
      { href: "/admin/orders", label: "Заказы", icon: IconOrders },
      { href: "/admin/analytics", label: "Аналитика", icon: IconAnalytics },
    ],
  },
  {
    title: "Каталог",
    items: [
      { href: "/admin/products", label: "Товары", icon: IconBox },
      { href: "/admin/weight-recipes", label: "Рецепты", icon: IconScale },
      { href: "/admin/candies", label: "Конфеты", icon: IconCandy },
    ],
  },
  {
    title: "Контент",
    items: [
      { href: "/admin/pdf", label: "PDF", icon: IconPdf },
      { href: "/admin/files", label: "Файлы", icon: IconFolder },
      {
        href: "/admin/page-texts",
        label: "Текст на страницах",
        icon: IconText,
        roles: ["super_admin", "editor"],
      },
    ],
  },
  {
    title: "Система",
    items: [
      {
        href: "/admin/users",
        label: "Пользователи",
        icon: IconUsers,
        roles: ["super_admin"],
      },
      {
        href: "/admin/settings",
        label: "Настройки",
        icon: IconSettings,
        roles: ["super_admin"],
      },
    ],
  },
];

/* Нижняя таб-панель телефона: самые частые разделы под большим пальцем. */
const TAB_ITEMS: (NavItem & { exact?: boolean })[] = [
  { href: "/admin", label: "Обзор", icon: IconHome, exact: true },
  { href: "/admin/orders", label: "Заказы", icon: IconOrders },
  { href: "/admin/products", label: "Товары", icon: IconBox },
  { href: "/admin/analytics", label: "Аналитика", icon: IconAnalytics },
];

/* Заголовок текущего раздела для верхней панели. */
const PAGE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/admin/orders", title: "Заказы" },
  { prefix: "/admin/analytics", title: "Аналитика" },
  { prefix: "/admin/products", title: "Товары" },
  { prefix: "/admin/weight-recipes", title: "Рецепты" },
  { prefix: "/admin/candies", title: "Конфеты" },
  { prefix: "/admin/pdf", title: "PDF" },
  { prefix: "/admin/files", title: "Файлы" },
  { prefix: "/admin/page-texts", title: "Текст на страницах" },
  { prefix: "/admin/users", title: "Пользователи" },
  { prefix: "/admin/settings", title: "Настройки" },
];

function pageTitle(pathname: string): string {
  const found = PAGE_TITLES.find((t) => pathname.startsWith(t.prefix));
  return found ? found.title : "Обзор";
}

function AuthSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-soft)]">
      <div className="flex flex-col items-center gap-3">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--color-border)] border-t-[var(--color-primary)]" />
        <p className="text-sm text-[var(--color-muted)]">Проверяем доступ…</p>
      </div>
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

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.roles || (user !== null && item.roles.includes(user.role)),
    ),
  })).filter((group) => group.items.length > 0);

  const sidebar = (
    <aside
      data-testid="admin-sidebar"
      className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)] shadow-xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Бренд — клик ведёт на «Обзор» */}
      <Link
        href="/admin"
        onClick={() => setMenuOpen(false)}
        className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-5 transition-colors hover:bg-[var(--color-bg-soft)]"
        aria-label="Обзор — на главную админки"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0274BE] to-[#024F80] text-lg shadow-sm"
        >
          🎁
        </span>
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-[var(--color-heading)]">
            Лакомка
          </span>
          <span className="block text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
            Панель управления
          </span>
        </span>
      </Link>

      {/* Разделы, сгруппированные по смыслу */}
      <nav
        className="flex-1 overflow-y-auto px-3 py-2"
        aria-label="Разделы админки"
      >
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-[var(--color-primary)] font-medium text-white shadow-sm"
                        : "font-medium text-[var(--color-body)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-heading)]"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-[var(--color-muted)]"}`}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.href === "/admin/orders" && (
                      <NewOrdersBadge onOrdersPage={isActive("/admin/orders")} />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Низ сайдбара: карточка пользователя */}
      <div className="shrink-0 border-t border-[var(--color-border)] p-3 text-sm">
        {user && (
          <div className="flex items-center gap-3 rounded-xl bg-[var(--color-bg-soft)] p-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[15px] font-semibold text-white"
            >
              {user.email.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span
                className="block truncate text-[13px] font-medium text-[var(--color-heading)]"
                title={user.email}
              >
                {user.email}
              </span>
              <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </span>
            <LogoutButton />
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="admin-scope min-h-screen bg-[var(--color-bg-soft)]">
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
        {/* Верхняя панель: бургер (<lg), заголовок раздела, индикаторы, тема */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-card)] px-3 sm:gap-3 sm:px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Открыть меню"
            className="rounded-lg p-2 text-[var(--color-heading)] transition-colors hover:bg-[var(--color-bg-soft)] lg:hidden"
          >
            <IconMenu className="h-6 w-6" />
          </button>

          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--color-heading)] sm:flex-none">
            {pageTitle(pathname)}
          </p>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <UpdateBadge isSuperAdmin={user?.role === "super_admin"} />
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть витрину в новой вкладке"
              aria-label="Открыть витрину сайта"
              className="hidden items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-heading)] md:inline-flex"
            >
              <IconExternal className="h-3.5 w-3.5" />
              На сайт
            </a>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
          <DownloadsProvider>{children}</DownloadsProvider>
        </main>
      </div>

      {/* Нижняя таб-панель (телефон/планшет <lg): частые разделы + «Ещё» */}
      <nav
        aria-label="Быстрый доступ"
        className="admin-tabbar fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--color-border)] bg-[var(--color-card)] lg:hidden"
      >
        {TAB_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact ?? false);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active
                  ? "text-[var(--color-primary)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-heading)]"
        >
          <IconMenu className="h-[22px] w-[22px]" />
          Ещё
        </button>
      </nav>
    </div>
  );
}
