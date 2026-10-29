"use client";

import { useState } from "react";
import type { AdminUser } from "@/app/admin/users/page";

interface Props {
  user: AdminUser;
  onClose: () => void;
}

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 12; i++) s += chars[arr[i] % chars.length];
  return s;
}

export function PasswordModal({ user, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  async function submitChange() {
    setError(null);
    if (password.length < 6) {
      setError("Пароль короче 6 символов");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/admin/users/${user.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сохранить");
        return;
      }
      onClose();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  async function submitReset() {
    if (!confirm("Сгенерировать новый пароль? Старый перестанет работать.")) return;
    setError(null);
    setResetting(true);
    try {
      const res = await fetch(`${apiUrl}/admin/users/${user.id}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сбросить");
        return;
      }
      setGenerated(json.data.password);
    } catch {
      setError("Ошибка сети");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-[var(--color-heading)]">
          Сменить пароль
        </h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          {user.email}
        </p>

        {generated ? (
          <>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs text-amber-800">
                Новый пароль. Он показывается <b>только один раз</b> — сохраните
                в менеджере паролей и передайте пользователю.
              </p>
              <code className="block break-all rounded bg-white px-2 py-1 text-sm font-mono text-[var(--color-heading)]">
                {generated}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(generated)}
                className="mt-2 text-xs text-[var(--color-primary)] hover:underline"
              >
                Скопировать
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm text-white"
              >
                Готово
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-[var(--color-heading)]">
              Новый пароль
            </label>
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="минимум 6 символов"
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)] hover:border-[var(--color-primary)]"
                title="Сгенерировать пароль"
              >
                🎲
              </button>
            </div>

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={submitReset}
                disabled={resetting}
                className="text-xs text-[var(--color-muted)] hover:text-red-600 disabled:opacity-50"
              >
                {resetting ? "…" : "Сгенерировать и сохранить"}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-4 py-2 text-sm"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={submitChange}
                  disabled={saving || password.length < 6}
                  className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {saving ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}