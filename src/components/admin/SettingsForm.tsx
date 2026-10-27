"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminSettings } from "@/app/admin/settings/page";

interface Props {
  initial: AdminSettings;
}

export function SettingsForm({ initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<AdminSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [testEmail, setTestEmail] = useState(initial.admin_email || "");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  function setField<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    setSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
      const res = await fetch(`${apiUrl}/admin/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          admin_email: form.admin_email,
          from_email: form.from_email,
          from_name: form.from_name,
          site_url: form.site_url,
          mail_driver: form.mail_driver,
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          smtp_user: form.smtp_user,
          smtp_pass: form.smtp_pass, // пустая строка = не менять
          smtp_secure: form.smtp_secure,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сохранить");
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      setForm((f) => ({ ...f, smtp_pass: "" })); // после сохранения очищаем поле пароля
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTestStatus(null);
    setTesting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
      const res = await fetch(`${apiUrl}/admin/settings/test-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: testEmail }),
      });
      const json = await res.json();
      setTestStatus(res.ok ? `✓ ${json.data.message}` : `✗ ${json.error}`);
    } catch {
      setTestStatus("✗ Ошибка сети");
    } finally {
      setTesting(false);
    }
  }

  const input =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const label =
    "mb-1 block text-sm font-medium text-[var(--color-heading)]";

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          Контакты и почта
        </h2>

        <div>
          <label className={label}>Email администратора</label>
          <input
            type="email"
            value={form.admin_email}
            onChange={(e) => setField("admin_email", e.target.value)}
            className={input}
            placeholder="admin@lakomka.ru"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            На этот адрес приходят уведомления о новых заказах.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>From email</label>
            <input
              type="email"
              value={form.from_email}
              onChange={(e) => setField("from_email", e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label}>From name</label>
            <input
              type="text"
              value={form.from_name}
              onChange={(e) => setField("from_name", e.target.value)}
              className={input}
            />
          </div>
        </div>

        <div>
          <label className={label}>URL сайта</label>
          <input
            type="url"
            value={form.site_url}
            onChange={(e) => setField("site_url", e.target.value)}
            className={input}
            placeholder="https://lakomkakhv.ru"
          />
        </div>

        <hr className="border-[var(--color-border)]" />

        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          SMTP
        </h2>

        <div>
          <label className={label}>Драйвер</label>
          <select
            value={form.mail_driver}
            onChange={(e) => setField("mail_driver", e.target.value)}
            className={input}
          >
            <option value="log">log (письма в файл, для разработки)</option>
            <option value="smtp">smtp (реальная отправка)</option>
          </select>
        </div>

        {form.mail_driver === "smtp" && (
          <>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <div>
                <label className={label}>Хост</label>
                <input
                  type="text"
                  value={form.smtp_host}
                  onChange={(e) => setField("smtp_host", e.target.value)}
                  className={input}
                  placeholder="smtp.yandex.ru"
                />
              </div>
              <div>
                <label className={label}>Порт</label>
                <input
                  type="text"
                  value={form.smtp_port}
                  onChange={(e) => setField("smtp_port", e.target.value)}
                  className={input}
                  placeholder="465"
                />
              </div>
            </div>

            <div>
              <label className={label}>Шифрование</label>
              <select
                value={form.smtp_secure}
                onChange={(e) => setField("smtp_secure", e.target.value)}
                className={input}
              >
                <option value="">Без шифрования</option>
                <option value="tls">TLS (порт 587)</option>
                <option value="ssl">SSL (порт 465)</option>
              </select>
            </div>

            <div>
              <label className={label}>Логин</label>
              <input
                type="text"
                value={form.smtp_user}
                onChange={(e) => setField("smtp_user", e.target.value)}
                className={input}
                placeholder="noreply@lakomka.ru"
              />
            </div>

            <div>
              <label className={label}>
                Пароль {form.smtp_pass_set && <span className="text-xs font-normal text-[var(--color-muted)]">(уже установлен, оставь пустым чтобы не менять)</span>}
              </label>
              <input
                type="password"
                value={form.smtp_pass}
                onChange={(e) => setField("smtp_pass", e.target.value)}
                className={input}
                placeholder={form.smtp_pass_set ? "••••••••" : "пароль приложения"}
                autoComplete="new-password"
              />
            </div>
          </>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          {savedAt && (
            <span className="text-sm text-green-700">✓ Сохранено в {savedAt}</span>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-6">
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
            Тест отправки
          </h2>
          <p className="mb-3 text-sm text-[var(--color-muted)]">
            Отправит тестовое письмо с текущими настройками.
          </p>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className={`${input} mb-3`}
            placeholder="куда@отправить.ru"
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={testing}
            className="w-full rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-60"
          >
            {testing ? "Отправляем…" : "Отправить тест"}
          </button>
          {testStatus && (
            <p className="mt-3 text-sm text-[var(--color-body)]">{testStatus}</p>
          )}
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-4 text-xs text-[var(--color-muted)]">
          <p className="mb-2 font-medium text-[var(--color-heading)]">Настройки Yandex 360:</p>
          <ul className="space-y-1 list-disc pl-4">
            <li>Хост: <code>smtp.yandex.ru</code></li>
            <li>Порт: <code>465</code>, SSL</li>
            <li>Логин: полный email</li>
            <li>Пароль: «пароль приложения» из аккаунта, не обычный</li>
          </ul>
        </div>
      </aside>
    </form>
  );
}