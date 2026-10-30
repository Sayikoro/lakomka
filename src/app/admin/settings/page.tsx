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
  /* снегопад */
  snow_enabled: string;
  snow_count: string;
  snow_count_mobile: string;
  snow_speed: string;
  snow_size: string;
  snow_color: string;
  snow_flake: string;
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
  product_card_template: "classic",
  snow_enabled: "0",
  snow_count: "110",
  snow_count_mobile: "60",
  snow_speed: "0.5",
  snow_size: "31",
  snow_color: "#f5f5f5",
  snow_flake: "",
};

export default function AdminSettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
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
    void load();
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
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      )}
    </div>
  );
}
