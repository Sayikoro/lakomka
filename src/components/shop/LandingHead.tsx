import Link from "next/link";

/**
 * Task 147: шапка SEO-лендинга — визуальные хлебные крошки
 * (Главная / … / Страница), H1 и вводный абзац. Ставьте рядом с
 * BreadcrumbJsonLd с теми же крошками.
 */
export function LandingHead({
  crumb,
  h1,
  lead,
}: {
  /** Название текущей страницы в крошках */
  crumb: string;
  h1: string;
  lead?: string;
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-10">
      <nav
        data-testid="crumbs"
        className="mb-4 text-xs text-[var(--color-muted)] sm:text-sm"
      >
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Главная
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-heading)]">{crumb}</span>
      </nav>
      <h1 className="max-w-[900px] text-[32px] font-medium leading-tight text-[var(--color-heading)] sm:text-[40px]">
        {h1}
      </h1>
      {lead && (
        <p className="mt-4 max-w-[900px] text-[15px] leading-relaxed text-[var(--color-body)]">
          {lead}
        </p>
      )}
    </div>
  );
}
