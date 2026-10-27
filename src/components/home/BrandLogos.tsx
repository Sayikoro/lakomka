import Image from "next/image";
import { mockBrands } from "@/lib/mock-data";

export function BrandLogos() {
  return (
    <section className="mt-12 bg-[var(--color-bg-soft)] px-6 py-14">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="mb-8 text-[24px] font-medium text-[var(--color-muted)]">
          В наших подарках конфеты от фабрик
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 md:grid-cols-9">
          {mockBrands.map((b) => (
            <div
              key={b.name}
              title={b.name}
              className="relative aspect-square overflow-hidden rounded-xl bg-white"
            >
              <Image
                src={b.logoUrl}
                alt={b.name}
                fill
                sizes="(max-width: 768px) 33vw, 12vw"
                className="object-contain p-3"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}