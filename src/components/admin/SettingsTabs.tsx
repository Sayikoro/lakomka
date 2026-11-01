"use client";

import { useState } from "react";
import { SettingsForm } from "./SettingsForm";
import { SiteUpdateTab } from "./SiteUpdateTab";
import { AdminLogTab } from "./AdminLogTab";
import type { AdminSettings } from "@/app/admin/settings/page";

/**
 * Настройки с вкладками: «Основные» (почта/витрина/снегопад),
 * «Обновление» и «Журнал» (Task 104). «Текст на страницах» с Task 112
 * живёт отдельной вкладкой верхнего уровня /admin/page-texts.
 */
export function SettingsTabs({ settings }: { settings: AdminSettings }) {
  const [tab, setTab] = useState<"main" | "update" | "log">("main");

  const tabCls = (active: boolean) =>
    `rounded-full px-5 py-2 text-sm font-medium transition ${
      active
        ? "bg-[var(--color-primary)] text-white shadow"
        : "border border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
    }`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => setTab("main")} className={tabCls(tab === "main")}>
          Основные
        </button>
        <button type="button" onClick={() => setTab("update")} className={tabCls(tab === "update")}>
          Обновление
        </button>
        <button type="button" onClick={() => setTab("log")} className={tabCls(tab === "log")}>
          Журнал
        </button>
      </div>

      {tab === "main" ? (
        <SettingsForm initial={settings} />
      ) : tab === "log" ? (
        <AdminLogTab />
      ) : (
        <SiteUpdateTab />
      )}
    </div>
  );
}
