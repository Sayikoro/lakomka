"use client";

/* Текст на страницах — отдельный раздел админки (Task 112): владелец
 * попросил вкладку верхнего уровня, раньше редактор прятался внутри
 * «Настроек». Редактор универсальный: реестр страниц/полей лежит в
 * src/lib/page-texts.ts, хранение — settings (text_*) на PHP-бэкенде.
 * Витрина подтягивает свежие тексты сама (TextsProvider), пересборка
 * сайта не нужна. */

import { PageTextsEditor } from "@/components/admin/PageTextsEditor";

export default function AdminPageTextsPage() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-heading)]">
          Текст на страницах
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          Заголовки, подписи и реквизиты витрины · попадает на сайт без пересборки
        </p>
      </div>
      <PageTextsEditor />
    </div>
  );
}
