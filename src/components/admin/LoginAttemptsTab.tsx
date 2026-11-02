"use client";

/* Журнал входов в админку (Task 121): таблица login_attempts — кто,
 * откуда (IP) и когда пытался войти, успех или нет. Данные чистятся
 * сами (записи старше суток удаляются при каждом успешном логине),
 * поэтому это окно отвечает на вопрос «были ли чужие попытки сегодня».
 * super_admin смотрит его на странице «Пользователи», вкладка «Входы». */

import { useCallback, useEffect, useState } from "react";

interface LoginAttempt {
  id: number;
  ip: string;
  email: string;
  success: number;
  created_at: string;
}

export function LoginAttemptsTab() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [items, setItems] = useState<LoginAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/logins?limit=300`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      setItems((json.data?.items as LoginAttempt[]) ?? []);
    } catch {
      setError("Ошибка сети");
    }
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/admin/logins?limit=300`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Ошибка ${res.status}`);
          return;
        }
        setItems((json.data?.items as LoginAttempt[]) ?? []);
      } catch {
        if (!cancelled) setError("Ошибка сети");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-heading)]">
            Журнал входов
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Попытки входа за последние сутки (успешные и нет). Записи старше суток
            удаляются автоматически.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          Обновить
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {items === null ? (
        <p className="py-8 text-center text-sm text-[var(--color-muted)]">Загружаем…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--color-muted)]">
          За сутки попыток входа не было.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="p-2.5">Когда</th>
                <th className="p-2.5">Email</th>
                <th className="p-2.5">IP</th>
                <th className="p-2.5">Итог</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-[var(--color-border)] last:border-none">
                  <td className="p-2.5 whitespace-nowrap text-xs text-[var(--color-muted)]">
                    {new Date(it.created_at + "Z").toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="p-2.5 text-xs">{it.email || "—"}</td>
                  <td className="p-2.5 whitespace-nowrap font-mono text-xs">{it.ip}</td>
                  <td className="p-2.5 text-xs">
                    {it.success === 1 ? (
                      <span
                        data-testid="login-ok"
                        className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                      >
                        успех
                      </span>
                    ) : (
                      <span
                        data-testid="login-fail"
                        className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                      >
                        отказ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
