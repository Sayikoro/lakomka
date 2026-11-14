"use client";

import { useEffect, useState } from "react";
import { RichText } from "./RichText";

/* ============================================================
   Живой seo_text категории (Task 146).

   Страница категории запекается при сборке: seo_text на момент
   сборки вшит в HTML. После монтирования подтягиваем свежий текст
   с /api/categories — владелец поправил SEO-текст (или вставил в
   него шорткод [gallery …]) в админке → F5 → новый текст на
   странице, пересборка сайта не нужна. Пока грузится — запечённый
   текст, при ошибке сети остаётся он же.
   ============================================================ */

export function CategorySeoLive({
  slug,
  initialText,
  className,
}: {
  slug: string;
  initialText: string;
  className?: string;
}) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    let cancelled = false;
    fetch(`${apiUrl}/categories`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.data || !Array.isArray(json.data)) return;
        const cat = json.data.find((c: { slug?: string }) => c?.slug === slug);
        const seo = typeof cat?.seo_text === "string" ? cat.seo_text.trim() : "";
        if (seo !== "") setText(seo);
      })
      .catch(() => { /* нет связи — остаётся запечённый текст */ });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!text) return null;
  return <RichText text={text} className={className} testId="category-seo-text" />;
}
