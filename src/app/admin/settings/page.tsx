"use client";

/* Настройки — клиентская версия (данные через /api/admin/settings). */

import { useCallback, useEffect, useState } from "react";
import { SettingsTabs } from "@/components/admin/SettingsTabs";

export interface AdminSettings {
  admin_email: string;
  from_email: string;
  from_name: string;
  site_url: string;
  mail_driver: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_pass_set: boolean;
  smtp_secure: string;
  /* витрина */
  hero_image: string;
  hero_slider_enabled: string;
  hero_slides: string;
  product_card_template: string;
  /* видео в карточке каталога: "1" = показывать, "0" = скрыть */
  card_video_enabled: string;
  /* Яндекс.Метрика: номер счётчика (только цифры), пусто = счётчика нет */
  ym_id: string;
  /* Встраиваемый блок Метрики целиком (Task 114), пусто = блока нет */
  metrika_code: string;
  /* Telegram-уведомления (Task 108) */
  tg_bot_token: string;
  tg_bot_token_set: boolean;
  tg_chat_id: string;
  /* Task 121: дублировать заказы админу на email ("1"/"0") */
  notify_admin_email: string;
  /* Task 121: интервал авто-бэкапа БД, суток (0 — выключено) */
  backup_interval_days: string;
  /* Task 132: генеративный PDF — обложка (первая страница) и последняя страница.
     Путь вида /uploads/pdf/…; пусто = страниц нет (сразу карточки подарков). */
  pdf_cover_first: string;
  pdf_cover_last: string;
  /* снегопад */
  snow_enabled: string;
  snow_count: string;
  snow_count_mobile: string;
  snow_speed: string;
  snow_size: string;
  snow_color: string;
  snow_flake: string;
  /* Task 141: счётчик «До Нового года» на главной ("1"/"0") */
  newyear_counter_enabled: string;
  /* Task 141: быстрый просмотр товара из каталога ("1"/"0") */
  quick_view_enabled: string;
}

const DEFAULTS: AdminSettings = {
  admin_email: "",
  from_email: "",
  from_name: "",
  site_url: "",
  mail_driver: "smtp",
  smtp_host: "",
  smtp_port: "465",
  smtp_user: "",
  smtp_pass: "",
  smtp_pass_set: false,
  smtp_secure: "ssl",
  hero_image: "",
  hero_slider_enabled: "0",
  hero_slides: "",
  /* «new» — карточка с каруселью (клик по картинке переключает слайд).
     Если ключа ещё нет в БД, форма и первое сохранение дают «new»,
     а не отключают карусель дефолтом «classic» (регресс галереи). */
  product_card_template: "new",
  /* видео в карточке показываем по умолчанию (историческое поведение) */
  card_video_enabled: "1",
  ym_id: "",
  metrika_code: "",
  tg_bot_token: "",
  tg_bot_token_set: false,
  tg_chat_id: "",
  notify_admin_email: "1",
  backup_interval_days: "3",
  pdf_cover_first: "",
  pdf_cover_last: "",
  snow_enabled: "0",
  snow_count: "110",
  snow_count_mobile: "60",
  snow_speed: "0.5",
  snow_size: "31",
  snow_color: "#f5f5f5",
  snow_flake: "",
  /* Task 141: обе фичи по умолчанию включены (ключа нет в БД — витрина уже показывает) */
  newyear_counter_enabled: "1",
  quick_view_enabled: "1",
};

export default function AdminSettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/admin/settings`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      setSettings({ ...DEFAULTS, ...(json.data ?? {}) } as AdminSettings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    }
  }, [apiUrl]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <div>
      <h1 className="mb-6 text-[24px] font-medium text-[var(--color-heading)]">
        Настройки
      </h1>

      {error ? (
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-6 text-red-700">
          Не удалось загрузить настройки: {error}
        </div>
      ) : settings ? (
        <SettingsTabs settings={settings} />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      )}
    </div>
  );
}
