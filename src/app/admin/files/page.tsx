"use client";

/* Файлы (проводник) — клиентская версия: проверка доступа уже в layout,
 * FilesManager сам ходит на /api/admin/files с httpOnly-кукой. */

import { FilesManager } from "@/components/admin/FilesManager";

export default function AdminFilesPage() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-heading)]">Файлы</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Проводник по архивам и медиа · скачивание в два этапа
        </p>
      </div>
      <FilesManager />
    </div>
  );
}
