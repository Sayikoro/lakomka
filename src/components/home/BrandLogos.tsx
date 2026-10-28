"use client";

import { mockBrands } from "@/lib/mock-data";
import { useT } from "@/components/texts/TextsProvider";
import { SmartImage } from "@/components/ui/SmartImg";

export function BrandLogos() {
  const t = useT();

  return (
    <section className="mt-12 bg-[var(--color-bg-soft)] px-6 py-14">
      <div className="mx-auto max-w-[1360px]">
        <h2 className="mb-8 text-center text-[22px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
          {t("home_brands_heading")}
        </h2>
        {/* Логотипы PNG уже с прозрачностью — без белой подложки.
            Телефон 4 в ряд, планшет 6 (18 = 3 полных ряда), ПК 12;
            база 3/5/9 колонок × 0.7 (логотипы на 30% меньше),
            flex + justify-center — ряды, включая последний, центрируются */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-6">
          {mockBrands.map((b) => (
            <div
              key={b.name}
              title={b.name}
              className="relative aspect-square w-[calc((100%_-_32px)*0.7/3)] sm:w-[calc((100%_-_64px)*0.7/5)] lg:w-[calc((100%_-_128px)*0.7/9)]"
            >
              <SmartImage
                src={b.logoUrl}
                alt={b.name}
                fill
                sizes="(max-width: 640px) 22vw, (max-width: 1024px) 13vw, 96px"
                className="object-contain p-1"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
