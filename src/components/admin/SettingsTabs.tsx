"use client";

import { useState } from "react";
import { SettingsForm } from "./SettingsForm";
import { PageTextsEditor } from "./PageTextsEditor";
import { SiteUpdateTab } from "./SiteUpdateTab";
import { AdminLogTab } from "./AdminLogTab";
import type { AdminSettings } from "@/app/admin/settings/page";

/**
 * Настройки с вкладками: «Основные» (почта/витрина/снегопад),
 * «Текст на страницах», «Обновление» и «Журнал» (Task 104).
 */
export function SettingsTabs({ settings }: { settings: AdminSettings }) {
  const [tab, setTab] = useState<"main" | "texts" | "update" | "log">("main");

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
        <button type="button" onClick={() => setTab("texts")} className={tabCls(tab === "texts")}>
          Текст на страницах
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
      ) : tab === "texts" ? (
        <PageTextsEditor />
      ) : tab === "log" ? (
        <AdminLogTab />
      ) : (
        <SiteUpdateTab />
      )}
    </div>
  );
}
