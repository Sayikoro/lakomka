import Link from "next/link";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { getCurrentUser } from "@/lib/auth";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Супер-админ",
  editor: "Редактор",
  viewer: "Просмотр",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

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
              href="/admin/pdf"
              className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
            >
              PDF
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
      <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
    </div>
  );
}