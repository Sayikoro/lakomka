"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PasswordModal } from "@/components/admin/PasswordModal";
import type { AdminUser } from "@/app/admin/users/page";

interface Props {
  initialUsers: AdminUser[];
  currentUserId: number;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Супер-админ",
  editor: "Редактор",
  viewer: "Просмотр",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-indigo-100 text-indigo-800",
  editor: "bg-emerald-100 text-emerald-800",
  viewer: "bg-gray-100 text-gray-700",
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  // "2026-10-26 12:34:56" → "26.10.2026 12:34"
  const [d, t] = s.split(" ");
  if (!d || !t) return s;
  const [y, m, day] = d.split("-");
  const [hh, mm] = t.split(":");
  return `${day}.${m}.${y} ${hh}:${mm}`;
}

export function UsersTable({ initialUsers, currentUserId }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  // синхронизация с props после router.refresh() — иначе список stale
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [changingRole, setChangingRole] = useState<number | null>(null);
  const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  async function changeRole(u: AdminUser, newRole: string) {
    if (u.role === newRole) return;
    setChangingRole(u.id);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/users/${u.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось изменить роль");
        return;
      }
      setUsers((list) =>
        list.map((x) => (x.id === u.id ? { ...x, role: json.data.role } : x))
      );
    } catch {
      setError("Ошибка сети");
    } finally {
      setChangingRole(null);
    }
  }

  async function destroy(u: AdminUser) {
    if (!confirm(`Удалить пользователя ${u.email}?`)) return;
    setDeleting(u.id);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/users/${u.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось удалить");
        return;
      }
      setUsers((list) => list.filter((x) => x.id !== u.id));
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-xs underline">
            закрыть
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <th className="p-3">Email</th>
              <th className="p-3">Имя</th>
              <th className="p-3">Роль</th>
              <th className="p-3">Последний вход</th>
              <th className="p-3">Создан</th>
              <th className="p-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === currentUserId;
              const busy = deleting === u.id || changingRole === u.id;
              return (
                <tr
                  key={u.id}
                  className={`border-b border-[var(--color-border)] last:border-none ${
                    busy ? "opacity-50" : ""
                  }`}
                >
                  <td className="p-3">
                    <span className="font-medium">{u.email}</span>
                    {isMe && (
                      <span className="ml-2 rounded bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                        это вы
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-[var(--color-muted)]">{u.name || "—"}</td>
                  <td className="p-3">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                      disabled={busy}
                      className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-xs font-medium ${
                        ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      <option value="viewer">Просмотр</option>
                      <option value="editor">Редактор</option>
                      <option value="super_admin">Супер-админ</option>
                    </select>
                  </td>
                  <td className="p-3 text-[var(--color-muted)]">
                    {formatDate(u.last_login_at)}
                  </td>
                  <td className="p-3 text-[var(--color-muted)]">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setPasswordFor(u)}
                      disabled={busy}
                      className="mr-3 text-xs text-[var(--color-primary)] hover:underline"
                    >
                      пароль
                    </button>
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="mr-3 text-xs text-[var(--color-primary)] hover:underline"
                    >
                      ред.
                    </Link>
                    <button
                      type="button"
                      onClick={() => destroy(u)}
                      disabled={busy || isMe}
                      title={isMe ? "Нельзя удалить себя" : "Удалить"}
                      className="text-xs text-[var(--color-muted)] hover:text-red-600 disabled:opacity-30 disabled:hover:text-[var(--color-muted)]"
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {passwordFor && (
        <PasswordModal
          user={passwordFor}
          onClose={() => setPasswordFor(null)}
        />
      )}
    </div>
  );
}