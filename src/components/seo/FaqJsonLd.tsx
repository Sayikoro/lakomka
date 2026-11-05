export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Task 147: разметка FAQPage (schema.org) — вопросы и ответы со
 * страницы в сниппеты поисковиков. Ставится рядом с визуальным
 * списком FaqList; вопросы/ответы должны совпадать 1-в-1.
 */
export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        // Экранируем «<» — защита от вырыва из тега script
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
