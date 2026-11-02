"use client";

/* Журнал действий админов (Task 104): таблица последних записей
 * admin_log — кто, когда и что делал (товары, файлы, настройки,
 * статусы заказов). Супер-админ смотрит его в Настройках. */

import { useCallback, useEffect, useState } from "react";

interface LogItem {
  id: number;
  created_at: string;
  actor: string;
  action: string;
  details: string;
}

const ACTION_LABEL: Record<string, string> = {
  "product.create": "Создан товар",
  "product.update": "Изменён товар",
  "product.delete": "Товар → корзина",
  "product.delete-forever": "Товар удалён навсегда",
  "product.restore": "Товар восстановлен",
  "product.duplicate": "Товар дублирован",
  "product.bulk-status": "Массово: статусы",
  "product.bulk-category": "Массово: категория",
  "product.bulk-price": "Массово: цены",
  "product.bulk-delete": "Массово: удаление",
  "settings.update": "Настройки сохранены",
  "files.rename": "Файл переименован",
  "files.delete": "Файл удалён",
  "files.restore": "Файл восстановлен из корзины",
  "files.trash-purge": "Стерто из корзины",
  "files.unused-purge": "Удалены неиспользуемые",
  "order.status": "Статус заказа",
  "db-backup": "Скачан бэкап базы",
};

export function AdminLogTab() {
  const [items, setItems] = useState<LogItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/log?limit=300`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      setItems((json.data?.items as LogItem[]) ?? []);
      setTotal(json.data?.total ?? 0);
    } catch {
      setError("Ошибка сети");
    }
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/admin/log?limit=300`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Ошибка ${res.status}`);
          return;
        }
        setItems((json.data?.items as LogItem[]) ?? []);
        setTotal(json.data?.total ?? 0);
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
            Журнал действий
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Последние операции админки: товары, файлы, настройки, заказы. Всего записей: {total}.
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
          Пока пусто — журнал заполнится по мере работы с админкой.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="p-2.5">Когда</th>
                <th className="p-2.5">Кто</th>
                <th className="p-2.5">Действие</th>
                <th className="p-2.5">Детали</th>
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
                    })}
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-xs">{it.actor}</td>
                  <td className="p-2.5 whitespace-nowrap text-xs font-medium text-[var(--color-heading)]">
                    {ACTION_LABEL[it.action] ?? it.action}
                  </td>
                  <td className="p-2.5 text-xs text-[var(--color-body)]" title={it.details}>
                    {it.details}
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
