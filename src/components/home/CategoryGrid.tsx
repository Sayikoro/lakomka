import Link from "next/link";
import Image from "next/image";
import { mockCategories } from "@/lib/mock-data";

export function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {mockCategories.map((cat) => (
        <Link
          key={cat.slug}
          href={`/catalog?category=${cat.slug}`}
          className="group relative mx-auto flex w-full max-w-[240px] flex-col transition hover:-translate-y-0.5"
        >
          <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-soft)]">
            <Image
              src={cat.imageUrl}
              alt={cat.name}
              fill
              sizes="240px"
              className="object-contain p-5 transition group-hover:scale-105"
            />
            <span
              aria-hidden
              className="absolute bottom-0 right-0 flex h-[71px] w-[71px] items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] text-white transition group-hover:bg-[var(--color-primary-hover)]"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17L17 7M7 7h10v10" />
              </svg>
            </span>
          </div>
          <h3 className="mt-3 text-[24px] font-medium capitalize leading-tight text-[var(--color-heading)]">
            {cat.name}
          </h3>
        </Link>
      ))}
    </div>
  );
}