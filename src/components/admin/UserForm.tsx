"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface UserFormValues {
  id?: number;
  email: string;
  name: string;
  role: "super_admin" | "editor" | "viewer";
}

interface Props {
  mode: "create" | "edit";
  initial?: UserFormValues;
}

const ROLES = [
  { value: "super_admin", label: "Супер-админ — всё" },
  { value: "editor", label: "Редактор — товары и заказы" },
  { value: "viewer", label: "Просмотр — только смотреть" },
] as const;

export function UserForm({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<UserFormValues>(
    initial ?? { email: "", name: "", role: "viewer" }
  );
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof UserFormValues>(k: K, v: UserFormValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const url = mode === "create"
        ? `${apiUrl}/admin/users`
        : `${apiUrl}/admin/users/${form.id}`;

      const payload: Record<string, unknown> = {
        email: form.email,
        name: form.name,
        role: form.role,
      };
      if (mode === "create" || password !== "") {
        payload.password = password;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сохранить");
        return;
      }

      if (mode === "create") {
        router.push("/admin/users");
      } else {
        setPassword("");
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const label = "mb-1 block text-sm font-medium text-[var(--color-heading)]";

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6"
    >
      <div>
        <label className={label}>Email *</label>
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          className={input}
        />
      </div>

      <div>
        <label className={label}>Имя</label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          className={input}
        />
      </div>

      <div>
        <label className={label}>Роль *</label>
        <select
          value={form.role}
          onChange={(e) => set("role", e.target.value as UserFormValues["role"])}
          className={input}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>
          Пароль {mode === "create" ? "*" : "(оставь пустым, чтобы не менять)"}
        </label>
        <input
          type="password"
          required={mode === "create"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "create" ? "минимум 6 символов" : "новый пароль"}
          className={input}
          autoComplete="new-password"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
        >
          {saving ? "Сохраняем…" : mode === "create" ? "Создать" : "Сохранить"}
        </button>
        {saved && <span className="text-sm text-green-700">✓ Сохранено</span>}
      </div>
    </form>
  );
}