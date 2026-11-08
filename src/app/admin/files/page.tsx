"use client";

/* Файлы (проводник) — клиентская версия: проверка доступа уже в layout,
 * FilesManager сам ходит на /api/admin/files с httpOnly-кукой.
 * Task 146: вторая вкладка «Галерея» — управление галереями картинок
 * (создание, загрузка, порядок, шорткод [gallery слаг] для блоков сайта). */

import { useState } from "react";
import { FilesManager } from "@/components/admin/FilesManager";
import { GalleryManager } from "@/components/admin/GalleryManager";

type Tab = "explorer" | "gallery";

export default function AdminFilesPage() {
  const [tab, setTab] = useState<Tab>("explorer");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-heading)]">Файлы</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Проводник по архивам и медиа · галереи для блоков сайта
        </p>
      </div>

      {/* Вкладки: проводник / галерея */}
      <div
        className="mb-5 flex gap-1 rounded-[var(--radius-btn)] border border-[var(--color-border)] bg-[var(--color-card)] p-1"
        role="tablist"
        data-testid="files-tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "explorer"}
          data-testid="files-tab-explorer"
          onClick={() => setTab("explorer")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition sm:flex-none ${
            tab === "explorer"
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
          }`}
        >
          Проводник
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "gallery"}
          data-testid="files-tab-gallery"
          onClick={() => setTab("gallery")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition sm:flex-none ${
            tab === "gallery"
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
          }`}
        >
          Галерея
        </button>
      </div>

      {tab === "explorer" ? <FilesManager /> : <GalleryManager />}
    </div>
  );
}
