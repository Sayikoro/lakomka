import { cookies } from "next/headers";
import Link from "next/link";
import { UsersTable } from "@/components/admin/UsersTable";
import { getCurrentUser } from "@/lib/auth";

export interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  role: "super_admin" | "editor" | "viewer";
  last_login_at: string | null;
  created_at: string;
}

async function getUsers(): Promise<AdminUser[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return [];

  const apiUrl = process.env.PHP_API_URL ?? "http://localhost:8000/api";
  try {
    const res = await fetch(`${apiUrl}/admin/users`, {
      headers: { Cookie: `admin_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: AdminUser[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export default async function AdminUsersPage() {
  const [users, me] = await Promise.all([getUsers(), getCurrentUser()]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
          Пользователи{" "}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            ({users.length})
          </span>
        </h1>
        <Link
          href="/admin/users/new"
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          + Добавить пользователя
        </Link>
      </div>

      <UsersTable initialUsers={users} currentUserId={me?.id ?? 0} />
    </div>
  );
}