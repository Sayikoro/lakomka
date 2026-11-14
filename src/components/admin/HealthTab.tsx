"use client";

/* «Здоровье сайта» (Task 121) — вкладка в Настройках.
 * Один запрос /api/admin/health — и владелец видит всё, что раньше
 * приходилось выяснять по кусочкам при каждой поломке: версии PHP/ffmpeg,
 * доступность записи uploads, свободное место, размер базы, когда был
 * последний бэкап (и сколько их), настроена ли почта/Telegram, сколько
 * было попыток входа за сутки, версия установленного пакета.
 * Отсюда же — ручной бэкап кнопкой (старый /admin/db-backup). */

import { useCallback, useEffect, useState } from "react";

interface HealthData {
  time: string;
  php: string;
  ffmpeg: string | null;
  uploads: {
    dir: string;
    writable: boolean;
    disk_free_bytes: number | null;
    disk_total_bytes: number | null;
  };
  db: {
    size_bytes: number | null;
    /** Task 157: когда база последний раз менялась (mtime файла) — «возраст» данных */
    modified_at: number | null;
  };
  backups: {
    interval_days: number;
    count: number;
    last: { file: string; time: number } | null;
  };
  mail: {
    driver: string;
    smtp_host_set: boolean;
    admin_email_set: boolean;
    notify_admin_email: boolean;
  };
  telegram_set: boolean;
  logins_24h: { total: number; failed: number };
  orders_new: number;
  products_total: number;
  version: string | null;
}

function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} МБ`;
  if (n >= 1024) return `${Math.round(n / 1024)} КБ`;
  return `${n} Б`;
}

function fmtWhen(unix: number | null | undefined): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Карточка-показатель: заголовок, значение, цветная точка состояния */
function Card({
  title,
  ok,
  children,
  testid,
}: {
  title: string;
  ok: boolean | null; // null — нейтрально (просто информация)
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5"
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          aria-hidden
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            ok === true ? "bg-emerald-500" : ok === false ? "bg-red-500" : "bg-sky-400"
          }`}
        />
        <h3 className="text-sm font-semibold text-[var(--color-heading)]">{title}</h3>
      </div>
      <div className="space-y-1 text-sm text-[var(--color-body)]">{children}</div>
    </div>
  );
}

export function HealthTab() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyBackup, setBusyBackup] = useState(false);
  const [interval, setIntervalDays] = useState<string>("");
  const [savingInterval, setSavingInterval] = useState(false);
  const [intervalNote, setIntervalNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/health`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      const d = json.data as HealthData;
      setData(d);
      setIntervalDays(String(d.backups.interval_days));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    }
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/admin/health`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Ошибка ${res.status}`);
          return;
        }
        const d = json.data as HealthData;
        setData(d);
        setIntervalDays(String(d.backups.interval_days));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка сети");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  /* Ручной бэкап: тот же эндпоинт, что и раньше (скачивание файла),
   * после — перечитываем, чтобы «последний бэкап» стал актуальным */
  async function downloadBackup() {
    setBusyBackup(true);
    try {
      const res = await fetch(`${apiUrl}/admin/db-backup`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError(`Не удалось создать бэкап (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lakomka-db-${new Date().toISOString().slice(0, 10)}.sqlite`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await load();
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusyBackup(false);
    }
  }

  /* Интервал авто-бэкапа сохраняется штатным POST /admin/settings */
  async function saveInterval() {
    const n = Number(interval);
    if (!Number.isInteger(n) || n < 0 || n > 30) {
      setIntervalNote("Целое число 0–30 суток (0 — выключено)");
      return;
    }
    setSavingInterval(true);
    setIntervalNote(null);
    try {
      const res = await fetch(`${apiUrl}/admin/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ backup_interval_days: String(n) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIntervalNote(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      setIntervalNote(`Сохранено: авто-бэкап каждые ${n} сут.`);
      await load();
    } catch {
      setIntervalNote("Ошибка сети");
    } finally {
      setSavingInterval(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Не удалось получить данные: {error}
        <button type="button" onClick={() => void load()} className="ml-3 underline">
          повторить
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center text-sm text-[var(--color-muted)]">
        Собираем показатели…
      </div>
    );
  }

  const diskFree = data.uploads.disk_free_bytes;
  const diskWarn = diskFree !== null && diskFree < 1024 * 1024 * 1024; // меньше 1 ГБ

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-muted)]">
          Состояние сайта на момент запроса. Обновляется по кнопке — показатели
          считаются заново при каждом открытии вкладки.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          Обновить
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Сервер" ok={true} testid="health-server">
          <p>PHP {data.php}</p>
          <p>
            ffmpeg:{" "}
            {data.ffmpeg ? (
              <span className="text-[var(--color-heading)]">{data.ffmpeg}</span>
            ) : (
              <span className="text-amber-700">
                не найден — видео не сжимаются
              </span>
            )}
          </p>
        </Card>

        <Card title="Папка uploads" ok={data.uploads.writable} testid="health-uploads">
          <p>{data.uploads.dir}</p>
          <p>
            Запись: {data.uploads.writable ? "доступна" : "ЗАПРЕЩЕНА — загрузки сломаются"}
          </p>
          <p>
            Свободно: {fmtBytes(diskFree)}
            {diskFree !== null && diskWarn && (
              <span className="text-amber-700"> · меньше 1 ГБ</span>
            )}
          </p>
        </Card>

        <Card title="База данных" ok={data.db.size_bytes !== null} testid="health-db">
          <p>Размер: {fmtBytes(data.db.size_bytes)}</p>
          <p>Товаров: {data.products_total}</p>
          <p>Новых заказов в ожидании: {data.orders_new}</p>
          {/* Task 157: «возраст» базы — если база новее последнего бэкапа, копия устарела */}
          <p>
            Изменена: {fmtWhen(data.db.modified_at)}
            {data.db.modified_at && data.backups.last?.time && data.db.modified_at > data.backups.last.time && (
              <span className="text-amber-700"> · новее последнего бэкапа</span>
            )}
          </p>
        </Card>

        <Card
          title="Резервные копии"
          ok={(data.backups.count ?? 0) > 0}
          testid="health-backups"
        >
          <p>
            Последний: {fmtWhen(data.backups.last?.time)}{" "}
            {data.backups.last && (
              <span className="text-xs text-[var(--color-muted)]">
                ({data.backups.last.file})
              </span>
            )}
          </p>
          <p>Всего копий: {data.backups.count} (хранятся последние 10)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs" htmlFor="health-interval">
              Авто-бэкап раз в
            </label>
            <input
              id="health-interval"
              type="number"
              min={0}
              max={30}
              value={interval}
              onChange={(e) => setIntervalDays(e.target.value)}
              className="w-16 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
            />
            <span className="text-xs">сут. (0 — выкл.)</span>
            <button
              type="button"
              onClick={() => void saveInterval()}
              disabled={savingInterval}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:border-[var(--color-primary)] disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
          <button
            type="button"
            onClick={() => void downloadBackup()}
            disabled={busyBackup}
            className="mt-2 rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-50"
          >
            {busyBackup ? "Готовим…" : "⬇ Скачать бэкап сейчас"}
          </button>
          {intervalNote && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">{intervalNote}</p>
          )}
        </Card>

        <Card
          title="Почта и уведомления"
          ok={data.mail.driver === "log" ? null : data.mail.smtp_host_set}
          testid="health-mail"
        >
          <p>Драйвер: {data.mail.driver === "smtp" ? "SMTP" : "log (письма только в файл)"}</p>
          <p>SMTP-хост: {data.mail.smtp_host_set ? "задан" : "не задан"}</p>
          <p>Email админа: {data.mail.admin_email_set ? "задан" : "не задан"}</p>
          <p>Дубли заказов админу на email: {data.mail.notify_admin_email ? "вкл." : "выкл."}</p>
          <p>Telegram: {data.telegram_set ? "настроен" : "не настроен"}</p>
        </Card>

        <Card title="Входы в админку за сутки" ok={data.logins_24h.failed === 0} testid="health-logins">
          <p>Попыток: {data.logins_24h.total}</p>
          <p>
            Неудачных: {data.logins_24h.failed}
            {data.logins_24h.failed > 0 && (
              <span className="text-amber-700"> — проверьте журнал на странице «Пользователи»</span>
            )}
          </p>
        </Card>

        <Card title="Версия сайта" ok={null} testid="health-version">
          <p>{data.version ?? "неизвестна (backend/version.json отсутствует)"}</p>
          <p className="text-xs text-[var(--color-muted)]">
            Проверить обновления — вкладка «Обновление».
          </p>
        </Card>
      </div>
    </div>
  );
}
