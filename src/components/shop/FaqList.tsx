import type { FaqItem } from "@/components/seo/FaqJsonLd";

/**
 * Task 147: визуальный список «Вопрос — ответ» для SEO-лендингов.
 * Нативные <details>/<summary> — работают без JS и доступны
 * поисковикам (текст ответа всегда в HTML). Пары вопрос/ответ
 * обязаны совпадать с FaqJsonLd на той же странице.
 */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="mx-auto mt-6 max-w-[900px] space-y-3">
      {items.map((f) => (
        <details
          key={f.question}
          className="group rounded-[var(--radius-card)] bg-[var(--color-bg)] px-5 py-4 transition-shadow hover:shadow-[0_12px_26px_-12px_rgba(0,0,0,0.18)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium text-[var(--color-heading)] [&::-webkit-details-marker]:hidden">
            {f.question}
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-[var(--color-primary)] transition-transform duration-300 group-open:rotate-45"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-body)]">
            {f.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
