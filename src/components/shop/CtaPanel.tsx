import Link from "next/link";
import { COMPANY } from "@/lib/company";
import {
  IconMax,
  IconMail,
  IconWhatsapp,
} from "@/components/layout/contact-icons";

/**
 * Task 147: контактная панель в конце SEO-лендингов (B2B, доставка):
 * телефоны, мессенджеры, почта и адрес самовывоза. Серверный
 * компонент — запекается в статику, JS не нужен.
 */
export function CtaPanel({
  title = "Обсудить заказ",
  note,
}: {
  title?: string;
  /** Пояснение под заголовком (что уточнить у менеджера) */
  note?: string;
}) {
  return (
    <section
      data-testid="cta-panel"
      className="mx-auto mt-12 max-w-[1200px] px-4"
    >
      <div className="rounded-[var(--radius-card)] bg-[var(--color-bg)] px-6 py-8 text-center sm:px-10">
        <h2 className="text-[26px] font-medium text-[var(--color-heading)] sm:text-[30px]">
          {title}
        </h2>
        {note && (
          <p className="mx-auto mt-2 max-w-[640px] text-sm leading-relaxed text-[var(--color-muted)]">
            {note}
          </p>
        )}

        <div className="mt-6 space-y-1 font-semibold">
          <p>
            <a
              href={`tel:${COMPANY.phoneLandline.replace(/[^+\d]/g, "")}`}
              className="text-[20px] text-[var(--color-heading)] underline-offset-4 transition-colors hover:text-[var(--color-primary)] hover:underline sm:text-[24px]"
            >
              {COMPANY.phoneLandline}
            </a>
          </p>
          <p>
            <a
              href={`tel:${COMPANY.phoneMobile.replace(/[^+\d]/g, "")}`}
              className="text-[20px] text-[var(--color-heading)] underline-offset-4 transition-colors hover:text-[var(--color-primary)] hover:underline sm:text-[24px]"
            >
              {COMPANY.phoneMobile}
            </a>
          </p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4">
          <a
            href={COMPANY.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Написать в WhatsApp"
            title="WhatsApp"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[0_8px_20px_-8px_rgba(27,126,194,0.7)] transition-transform duration-200 hover:scale-90"
          >
            <IconWhatsapp className="h-[22px] w-[22px]" />
          </a>
          <a
            href={COMPANY.max}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Написать в МАКС"
            title="МАКС"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[0_8px_20px_-8px_rgba(27,126,194,0.7)] transition-transform duration-200 hover:scale-90"
          >
            <IconMax className="h-5 w-5" />
          </a>
          <a
            href={`mailto:${COMPANY.email}`}
            aria-label="Написать на почту"
            title="Электронная почта"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[0_8px_20px_-8px_rgba(27,126,194,0.7)] transition-transform duration-200 hover:scale-90"
          >
            <IconMail className="h-[22px] w-[22px]" />
          </a>
        </div>

        <p className="mt-6 text-sm text-[var(--color-muted)]">
          Самовывоз: {COMPANY.address} ·{" "}
          <Link
            href="/delivery"
            className="text-[var(--color-primary)] underline-offset-4 hover:underline"
          >
            доставка и оплата
          </Link>
        </p>
      </div>
    </section>
  );
}
