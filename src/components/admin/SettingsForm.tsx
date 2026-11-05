"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminSettings } from "@/app/admin/settings/page";
import { DEFAULT_FLAKE_DATA } from "@/lib/snow";

interface Props {
  initial: AdminSettings;
}

/* Task 132: строка «обложка / последняя страница» генеративного PDF:
   превью A4-пропорций, кнопка загрузки, поле пути и «Убрать». */
function PdfCoverRow(props: {
  title: string;
  hint: string;
  value: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onChange: (url: string) => void;
  testId: string;
}) {
  const input =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] p-4"
      data-testid={props.testId}
    >
      <span className="mb-2 block text-sm font-medium text-[var(--color-heading)]">
        {props.title}
      </span>
      <div className="flex items-start gap-4">
        <div className="flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-soft)]">
          {props.value ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={props.value}
              alt={props.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[11px] text-[var(--color-muted)]">нет</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <label className="inline-flex cursor-pointer items-center rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white">
            {props.uploading ? "Загружаем…" : "Загрузить картинку"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={props.uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                props.onUpload(file);
              }}
            />
          </label>
          <input
            type="text"
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            className={input}
            placeholder="/uploads/pdf/… (заполняется кнопкой загрузки)"
          />
          {props.value && (
            <button
              type="button"
              onClick={() => props.onChange("")}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Убрать картинку
            </button>
          )}
          <p className="text-xs text-[var(--color-muted)]">{props.hint}</p>
        </div>
      </div>
    </div>
  );
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

  /* Telegram-тест (Task 108) */
  const [tgStatus, setTgStatus] = useState<string | null>(null);
  const [tgTesting, setTgTesting] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  /* ── Витрина: слайды hero ── */
  const [slides, setSlides] = useState<{ url: string }[]>(() => {
    try {
      const parsed = JSON.parse(initial.hero_slides || "[]");
      if (Array.isArray(parsed)) {
        return parsed
          .map((s) =>
            typeof s === "string"
              ? { url: s }
              : s && typeof s.url === "string"
                ? { url: s.url }
                : null
          )
          .filter(Boolean) as { url: string }[];
      }
    } catch {
      /* пусто */
    }
    return [];
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingFlake, setUploadingFlake] = useState(false);
  /* Task 132: загрузка обложки/финала генеративного PDF */
  const [uploadingPdfPage, setUploadingPdfPage] = useState(false);

  function setField<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* Сжимаем картинку на клиенте: максимум 2200px по ширине, JPEG 85% */
  async function fileToResizedJpeg(file: File, maxW = 2200, quality = 0.85): Promise<File> {
    if (!file.type.startsWith("image/")) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxW / bitmap.width);
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      if (!blob) return file;
      return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    } catch {
      return file;
    }
  }

  async function uploadHeroImage(file: File): Promise<string | null> {
    setError(null);
    setUploading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const fd = new FormData();
      fd.append("file", await fileToResizedJpeg(file));
      const res = await fetch(`${apiUrl}/admin/uploads/hero`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось загрузить картинку");
        return null;
      }
      return json.data.url as string;
    } catch {
      setError("Ошибка сети при загрузке картинки");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function uploadSnowflakeSvg(file: File): Promise<string | null> {
    setError(null);
    setUploadingFlake(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const fd = new FormData();
      fd.append("file", file); // SVG не сжимаем — отправляем как есть
      const res = await fetch(`${apiUrl}/admin/uploads/snowflake`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось загрузить снежинку");
        return null;
      }
      return json.data.url as string;
    } catch {
      setError("Ошибка сети при загрузке снежинки");
      return null;
    } finally {
      setUploadingFlake(false);
    }
  }

  function moveSlide(i: number, dir: -1 | 1) {
    setSlides((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  /* Task 132: картинка обложки/финальной страницы генеративного PDF.
     Клиентская компрессия та же, что у hero; сервер кладёт файл
     в /uploads/pdf и возвращает путь. */
  async function uploadPdfPageImage(file: File): Promise<string | null> {
    setError(null);
    setUploadingPdfPage(true);
    try {
      const fd = new FormData();
      fd.append("file", await fileToResizedJpeg(file));
      const res = await fetch(`${apiUrl}/admin/uploads/pdf-page`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось загрузить картинку");
        return null;
      }
      return json.data.url as string;
    } catch {
      setError("Ошибка сети при загрузке картинки");
      return null;
    } finally {
      setUploadingPdfPage(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    setSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
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
          hero_image: form.hero_image,
          /* Всегда строки «0»/«1»: если в поле попало что-то другое (пусто,
             boolean из старого кэша) — приводим сами, чтобы бэкенд не отвечал
             ошибкой «hero_slider_enabled: 0 | 1» */
          hero_slider_enabled: form.hero_slider_enabled === "1" ? "1" : "0",
          hero_slides: JSON.stringify(slides.filter((s) => s.url)),
          product_card_template: form.product_card_template || "new",
          card_video_enabled: form.card_video_enabled === "1" ? "1" : "0",
          snow_enabled: form.snow_enabled === "1" ? "1" : "0",
          /* Task 141: счётчик «До Нового года» и быстрый просмотр */
          newyear_counter_enabled: form.newyear_counter_enabled === "1" ? "1" : "0",
          quick_view_enabled: form.quick_view_enabled === "1" ? "1" : "0",
          /* Task 146: шорткод галереи блока фабрик (пусто = дефолтная fabriki) */
          brands_gallery: (form.brands_gallery ?? "").trim(),
          snow_count: String(Math.max(0, Math.min(500, parseInt(form.snow_count || "110", 10) || 0))),
          snow_count_mobile: String(Math.max(0, Math.min(500, parseInt(form.snow_count_mobile || "60", 10) || 0))),
          snow_speed: String(Math.max(0.1, Math.min(20, parseFloat(form.snow_speed || "0.5") || 0.5))),
          snow_size: String(Math.max(4, Math.min(120, parseInt(form.snow_size || "31", 10) || 31))),
          snow_color: /^#[0-9a-fA-F]{6}$/.test(form.snow_color || "") ? form.snow_color : "",
          snow_flake: form.snow_flake.trim(),
          ym_id: form.ym_id.trim(),
          metrika_code: form.metrika_code,
          tg_bot_token: form.tg_bot_token, // пустая строка = не менять
          tg_chat_id: form.tg_chat_id.trim(),
          notify_admin_email: form.notify_admin_email === "1" ? "1" : "0",
          /* Task 132: обложка/финал генеративного PDF (/uploads/pdf/… или пусто) */
          pdf_cover_first: form.pdf_cover_first.trim(),
          pdf_cover_last: form.pdf_cover_last.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сохранить");
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      setForm((f) => ({ ...f, smtp_pass: "", tg_bot_token: "" })); // после сохранения очищаем поля секретов
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
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

  async function sendTestTelegram() {
    setTgStatus(null);
    setTgTesting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const res = await fetch(`${apiUrl}/admin/settings/test-telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const json = await res.json();
      setTgStatus(res.ok ? `✓ ${json.data.message}` : `✗ ${json.error}`);
    } catch {
      setTgStatus("✗ Ошибка сети");
    } finally {
      setTgTesting(false);
    }
  }

  const input =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const label =
    "mb-1 block text-sm font-medium text-[var(--color-heading)]";

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
      <div className="space-y-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
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

      </div>

      {/* ── Аналитика и уведомления: Метрика + Telegram (Task 107/108) ── */}
      <div className="space-y-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          Аналитика и уведомления
        </h2>

        <div>
          <label className={label}>Яндекс.Метрика — номер счётчика</label>
          <input
            type="text"
            value={form.ym_id}
            onChange={(e) => setField("ym_id", e.target.value)}
            className={input}
            placeholder="12345678"
            data-testid="ym-id-input"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Только цифры из metrika.yandex.ru («Счётчик создан» → номер). Пусто = счётчика нет.
            Появляется на витрине по F5; цели «add_to_cart» и «order_created» отправляются автоматически.
          </p>
        </div>

        <div>
          <label className={label}>Яндекс.Метрика — встраиваемый блок (заменяет номер счётчика)</label>
          <textarea
            rows={6}
            value={form.metrika_code}
            onChange={(e) => setField("metrika_code", e.target.value)}
            className={`${input} font-mono text-xs`}
            placeholder="<!-- Yandex.Metrika counter --> … <!-- /Yandex.Metrika counter -->"
            data-testid="metrika-code-input"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Вставьте код счётчика ЦЕЛИКОМ, как его даёт Метрика (кнопка «Скопировать код»).
            Если блок задан — он используется вместо номера выше и попадает на витрину без пересборки.
          </p>
        </div>

        <hr className="border-[var(--color-border)]" />

        <div>
          <label className={label}>
            Telegram — токен бота{" "}
            {form.tg_bot_token_set && (
              <span className="text-xs font-normal text-[var(--color-muted)]">(уже установлен, оставь пустым чтобы не менять)</span>
            )}
          </label>
          <input
            type="password"
            value={form.tg_bot_token}
            onChange={(e) => setField("tg_bot_token", e.target.value)}
            className={input}
            placeholder={form.tg_bot_token_set ? "••••••••" : "123456789:AAEl…"}
            autoComplete="new-password"
            data-testid="tg-token-input"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Создайте бота у @BotFather (команда /newbot) и скопируйте его токен.
          </p>
        </div>

        <div>
          <label className={label}>Telegram — chat_id</label>
          <input
            type="text"
            value={form.tg_chat_id}
            onChange={(e) => setField("tg_chat_id", e.target.value)}
            className={input}
            placeholder="123456789 или @имя_канала"
            data-testid="tg-chat-id-input"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Узнать свой id можно у бота @getmyid_bot. Для группы/канала id отрицательный (напр. -1001234567890);
            сначала напишите боту в этот чат одно сообщение. Пусто = уведомления выключены.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={sendTestTelegram}
            disabled={tgTesting}
            className="rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-60"
            data-testid="tg-test-btn"
          >
            {tgTesting ? "Отправляем…" : "Отправить тест в Telegram"}
          </button>
          {tgStatus && (
            <span className="text-sm text-[var(--color-body)]">{tgStatus}</span>
          )}
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Тест и уведомления используют СОХРАНЁННЫЕ настройки — сначала нажмите «Сохранить».
          Ошибка доставки в Telegram никогда не мешает заказу — он оформится, а письмо придёт как обычно.
        </p>

        <hr className="border-[var(--color-border)]" />

        {/* Task 121: дубли заказов админу на email (письмо шлётся на «Email администратора» выше) */}
        <label className="flex cursor-pointer items-start gap-3 text-sm" data-testid="notify-admin-label">
          <input
            type="checkbox"
            checked={form.notify_admin_email === "1"}
            onChange={(e) => setField("notify_admin_email", e.target.checked ? "1" : "0")}
            className="mt-1 accent-[var(--color-primary)]"
            data-testid="notify-admin-toggle"
          />
          <span>
            <span className="font-medium text-[var(--color-heading)]">
              Дублировать заказы админу на email
            </span>
            <span className="block text-xs text-[var(--color-muted)]">
              Копия каждого заказа уйдёт на «Email администратора» (поле выше). Telegram-уведомления
              работают независимо. По умолчанию включено.
            </span>
          </span>
        </label>
      </div>

      {/* ── Витрина: hero и шаблон карточки товара ── */}
      <div className="space-y-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          Витрина
        </h2>

        {/* Главная картинка hero */}
        <div>
          <label className={label}>Главная картинка (фон hero)</label>
          <div className="flex items-start gap-4">
            <div className="h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-soft)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.hero_image || "/hero-bg.webp"}
                alt="Текущий фон hero"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1 space-y-2">
              <label className="inline-flex cursor-pointer items-center rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white">
                {uploading ? "Загружаем…" : "Загрузить картинку"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const url = await uploadHeroImage(file);
                    if (url) setField("hero_image", url);
                  }}
                />
              </label>
              <input
                type="text"
                value={form.hero_image}
                onChange={(e) => setField("hero_image", e.target.value)}
                className={input}
                placeholder="/uploads/hero/... или https://..."
              />
              <p className="text-xs text-[var(--color-muted)]">
                Пусто = картинка по умолчанию (/hero-bg.webp). Картинка сжимается перед загрузкой автоматически.
                На сайте появится после обновления главной страницы (F5) — пересборка сайта не нужна.
              </p>
            </div>
          </div>
        </div>

        {/* Слайдер */}
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.hero_slider_enabled === "1"}
              onChange={(e) =>
                setField("hero_slider_enabled", e.target.checked ? "1" : "0")
              }
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm font-medium text-[var(--color-heading)]">
              Перелистываемый hero (слайдер)
            </span>
          </label>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Несколько картинок листаются автоматически (5 сек) и по свайпу. Если выключено — на фоне одна главная картинка.
          </p>

          {form.hero_slider_enabled === "1" && (
            <div className="mt-4 space-y-3">
              {slides.map((s, i) => (
                <div
                  key={`${s.url}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={`Слайд ${i + 1}`}
                    className="h-14 w-24 shrink-0 rounded-md object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted)]">
                    {s.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveSlide(i, -1)}
                    disabled={i === 0}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm disabled:opacity-30"
                    aria-label="Переместить раньше"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlide(i, 1)}
                    disabled={i === slides.length - 1}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm disabled:opacity-30"
                    aria-label="Переместить позже"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlides((arr) => arr.filter((_, j) => j !== i))}
                    className="rounded-md border border-red-200 px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                    aria-label="Удалить слайд"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <label className="inline-flex cursor-pointer items-center rounded-[var(--radius-btn)] border-2 border-dashed border-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white">
                {uploading ? "Загружаем…" : "+ Добавить слайд"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const url = await uploadHeroImage(file);
                    if (url) setSlides((arr) => [...arr, { url }]);
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Шаблон карточки товара */}
        <div>
          <label className={label}>Карточка товара в каталоге</label>
          <select
            value={form.product_card_template || "new"}
            onChange={(e) => setField("product_card_template", e.target.value)}
            className={input}
          >
            <option value="classic">Классическая (светлая, кнопка «В корзину»)</option>
            <option value="new">Новая (тёмная, свайп фото и видео)</option>
          </select>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Новая карточка показывает всё медиа товара: фото и видео листаются свайпом, видео проигрывается прямо в карточке.
          </p>

          {/* Видео в карточке каталога */}
          <div className="mt-4 rounded-lg border border-[var(--color-border)] p-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={form.card_video_enabled === "1"}
                onChange={(e) =>
                  setField("card_video_enabled", e.target.checked ? "1" : "0")
                }
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm font-medium text-[var(--color-heading)]">
                Показывать видео в карточках каталога
              </span>
            </label>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Когда товаров с видео много, каталог грузится медленно. Выключите — в карточках останутся только фото, видео по-прежнему будет на странице товара.
            </p>
          </div>

          {/* Task 141: счётчик «До Нового года» */}
          <div className="mt-4 rounded-lg border border-[var(--color-border)] p-4" data-testid="toggle-newyear">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={form.newyear_counter_enabled === "1"}
                onChange={(e) =>
                  setField("newyear_counter_enabled", e.target.checked ? "1" : "0")
                }
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm font-medium text-[var(--color-heading)]">
                Счётчик «До Нового года» на главной
              </span>
            </label>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Полоска под главным экраном: «До Нового года осталось N дней» и подпись. Текст правится в разделе «Текст на страницах» → «Главная». Сезонная фича — после праздников просто снимите галочку.
            </p>
          </div>

          {/* Task 141: быстрый просмотр из каталога */}
          <div className="mt-4 rounded-lg border border-[var(--color-border)] p-4" data-testid="toggle-quickview">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={form.quick_view_enabled === "1"}
                onChange={(e) =>
                  setField("quick_view_enabled", e.target.checked ? "1" : "0")
                }
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm font-medium text-[var(--color-heading)]">
                Быстрый просмотр товара в каталоге
              </span>
            </label>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Кнопка-глаз на карточке открывает компактную модалку: фото, цена, «В корзину» — без перехода в карточку товара. Полная карточка остаётся по кнопке «Перейти».
            </p>
          </div>

          {/* Task 146: блок фабрик из галереи (шорткод) */}
          <div className="mt-4 rounded-lg border border-[var(--color-border)] p-4" data-testid="settings-brands-gallery">
            <label className="mb-2 block text-sm font-medium text-[var(--color-heading)]">
              Блок «Конфеты от фабрик» — галерея логотипов
            </label>
            <input
              type="text"
              value={form.brands_gallery ?? ""}
              onChange={(e) => setField("brands_gallery", e.target.value)}
              placeholder="[gallery fabriki]"
              className={input}
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Вставьте шорткод галереи из раздела «Файлы → Галерея» (скопировать можно там же, на вкладке). Пусто — работает галерея по умолчанию «fabriki», а если её нет — встроенный набор логотипов. Логотипы правятся в «Файлы → Галерея», пересборка сайта не нужна.
            </p>
          </div>
        </div>
      </div>

      {/* ── Task 132: генеративный PDF — обложка и финальная страница ── */}
      <div className="space-y-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          PDF по подаркам
        </h2>
        <p className="-mt-2 text-sm text-[var(--color-muted)]">
          Страницы для PDF, который собирается в разделе «Товары»: выделите подарки →
          «Сформировать PDF». Обложка станет первой страницей, финал — последней,
          между ними — карточки подарков (фото, название, цена). Пусто = сразу карточки.
        </p>
        <PdfCoverRow
          testId="pdf-cover-first"
          title="Обложка (первая страница)"
          hint="Например, заставка «Новогодние подарки». Картинка вписывается в лист А4 целиком, без обрезки."
          value={form.pdf_cover_first}
          uploading={uploadingPdfPage}
          onUpload={async (file) => {
            const url = await uploadPdfPageImage(file);
            if (url) setField("pdf_cover_first", url);
          }}
          onChange={(u) => setField("pdf_cover_first", u)}
        />
        <PdfCoverRow
          testId="pdf-cover-last"
          title="Последняя страница"
          hint="Например, контакты и условия заказа. Пусто = последней страницы нет."
          value={form.pdf_cover_last}
          uploading={uploadingPdfPage}
          onUpload={async (file) => {
            const url = await uploadPdfPageImage(file);
            if (url) setField("pdf_cover_last", url);
          }}
          onChange={(u) => setField("pdf_cover_last", u)}
        />
      </div>

      {/* ── Витрина: снегопад ── */}
      <div className="space-y-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          Снегопад
        </h2>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={form.snow_enabled === "1"}
            onChange={(e) =>
              setField("snow_enabled", e.target.checked ? "1" : "0")
            }
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          <span className="text-sm font-medium text-[var(--color-heading)]">
            Падающий снег в Hero-блоке на главной
          </span>
        </label>
        <p className="-mt-4 text-xs text-[var(--color-muted)]">
          Снежинки падают только внутри главного экрана (Hero) — как на оригинальном сайте. У каждой снежинки случайная прозрачность (0.35–0.9) и размер — снег падает будто на разных слоях.
        </p>

        {form.snow_enabled === "1" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>
                  Плотность (компьютеры) — {Math.max(0, Math.min(500, parseInt(form.snow_count || "0", 10) || 0))} снежинок
                </label>
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={10}
                  value={parseInt(form.snow_count || "0", 10) || 0}
                  onChange={(e) => setField("snow_count", e.target.value)}
                  className="w-full accent-[var(--color-primary)]"
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">Экран ≥ 768px. В оригинале — 110. Максимум — 500.</p>
              </div>
              <div>
                <label className={label}>
                  Плотность (телефоны) — {Math.max(0, Math.min(500, parseInt(form.snow_count_mobile || "0", 10) || 0))} снежинок
                </label>
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={10}
                  value={parseInt(form.snow_count_mobile || "0", 10) || 0}
                  onChange={(e) => setField("snow_count_mobile", e.target.value)}
                  className="w-full accent-[var(--color-primary)]"
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">Экран уже 768px — задаётся отдельно, у телефонов экран меньше. По умолчанию 60.</p>
              </div>
              <div>
                <label className={label}>
                  Скорость — {(parseFloat(form.snow_speed || "0") || 0).toFixed(1)}
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={8}
                  step={0.1}
                  value={parseFloat(form.snow_speed || "0") || 0.5}
                  onChange={(e) => setField("snow_speed", e.target.value)}
                  className="w-full accent-[var(--color-primary)]"
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">В оригинале — 0.5. Больше = быстрее падают.</p>
              </div>
              <div>
                <label className={label}>
                  Размер — {Math.max(4, Math.min(120, parseInt(form.snow_size || "0", 10) || 31))} px
                </label>
                <input
                  type="range"
                  min={6}
                  max={80}
                  step={1}
                  value={parseInt(form.snow_size || "0", 10) || 31}
                  onChange={(e) => setField("snow_size", e.target.value)}
                  className="w-full accent-[var(--color-primary)]"
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Базовый размер; фактический у каждой снежинки — 40–160% от него. В оригинале — 31.
                </p>
              </div>
              <div>
                <label className={label}>Цвет снежинок</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.snow_color || "") ? form.snow_color : "#f5f5f5"}
                    onChange={(e) => setField("snow_color", e.target.value.toUpperCase())}
                    className="h-9 w-12 cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-1"
                    aria-label="Цвет снежинок"
                  />
                  <input
                    type="text"
                    value={form.snow_color}
                    onChange={(e) => setField("snow_color", e.target.value)}
                    className={input}
                    placeholder="#f5f5f5"
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  В оригинале — #f5f5f5. На светлом фоне виднее тёмные/цветные оттенки (например #9ecff7).
                </p>
              </div>
            </div>

            {/* Своя SVG-снежинка */}
            <div>
              <label className={label}>Снежинка</label>
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-[#3a4a5a]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.snow_flake.trim() || DEFAULT_FLAKE_DATA}
                    alt="Текущая снежинка"
                    className="h-full w-full object-contain p-1"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-[var(--radius-btn)] border-2 border-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white">
                      {uploadingFlake ? "Загружаем…" : "Загрузить свою SVG"}
                      <input
                        type="file"
                        accept="image/svg+xml,.svg"
                        className="hidden"
                        disabled={uploadingFlake}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          const url = await uploadSnowflakeSvg(file);
                          if (url) setField("snow_flake", url);
                        }}
                      />
                    </label>
                    {form.snow_flake.trim() !== "" && (
                      <button
                        type="button"
                        onClick={() => setField("snow_flake", "")}
                        className="rounded-[var(--radius-btn)] border-2 border-[var(--color-border)] px-4 py-1.5 text-sm font-medium text-[var(--color-body)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                      >
                        Вернуть стандартную
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={form.snow_flake}
                    onChange={(e) => setField("snow_flake", e.target.value)}
                    className={input}
                    placeholder="/uploads/snowflake/… или https://…"
                  />
                  <p className="text-xs text-[var(--color-muted)]">
                    Пусто = встроенная снежинка (как в оригинале). Свою можно загрузить SVG-файлом (до 1 МБ) или указать ссылку.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
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

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-xs text-[var(--color-muted)]">
          <p className="mb-2 font-medium text-[var(--color-heading)]">Настройки Yandex 360:</p>
          <ul className="space-y-1 list-disc pl-4">
            <li>Хост: <code>smtp.yandex.ru</code></li>
            <li>Порт: <code>465</code>, SSL</li>
            <li>Логин: полный email</li>
            <li>Пароль: «пароль приложения» из аккаунта, не обычный</li>
          </ul>
        </div>
      </aside>

      {/* ── Обслуживание: бэкап базы (Task 105) ── */}
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6 lg:col-span-2">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">
          Обслуживание
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Снимок базы делается консистентным (живой сайт не останавливается) и
          одновременно остаётся в хранилище на сервере — последние 10 копий.
          Скачивайте перед рискованными экспериментами или просто на всякий случай.
        </p>
        <a
          href={`${apiUrl}/admin/db-backup`}
          data-testid="db-backup-btn"
          className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v10M7.5 10.5 12 15l4.5-4.5" />
            <path d="M4 19h16" />
          </svg>
          Скачать бэкап базы данных
        </a>
      </div>
    </form>
  );
}