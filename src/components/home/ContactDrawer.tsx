"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconMax, IconMail, IconPhone, IconWhatsapp } from "@/components/layout/contact-icons";

interface ContactDrawerProps {
  open: boolean;
  onClose: () => void;
}

const CONTACTS: { label: string; href: string; external?: boolean; icon: React.ReactNode }[] = [
  {
    label: "МАКС",
    href: "https://max.ru/u/f9LHodD0cOJg4EvnSb7cUdUogKqeA_9T8M_MuCXCPoxDbs7F3d9kBA5Lbuc",
    external: true,
    icon: <IconMax />,
  },
  {
    label: "Электронная почта",
    href: "mailto:Klakomka2016@mail.ru",
    external: true,
    icon: <IconMail />,
  },
  {
    label: "+7 (4212) 78 96 21",
    href: "tel:+74212789621",
    icon: <IconPhone />,
  },
  {
    label: "WhatsApp",
    href: "https://web.whatsapp.com/send/?phone=79141582464",
    external: true,
    icon: <IconWhatsapp />,
  },
];

export function ContactDrawer({ open, onClose }: ContactDrawerProps) {
  // Портал в body: иначе fixed-шторка остаётся в stacking-контексте секции
  // (isolate + z-10 обёртка) и соседние блоки могут отрисовываться поверх неё
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Esc — закрыть, блокировка прокрутки фона
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[80] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      {/* Затемнение */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 invisible"
        }`}
      />

      {/* Панель справа */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Связаться с нами"
        className={`absolute right-0 top-0 flex h-full w-[380px] max-w-[88vw] flex-col overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full invisible"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <h3 className="text-[18px] font-semibold text-[var(--color-heading)]">Связаться с нами</h3>
            <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">Ответим в рабочее время</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--color-bg-soft)] text-[var(--color-heading)] transition hover:bg-[var(--color-border)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 py-10">
          {CONTACTS.map((c) => (
            <div key={c.label} className="flex flex-col items-center gap-2 text-center">
              <a
                href={c.href}
                target={c.external ? "_blank" : undefined}
                rel={c.external ? "noopener noreferrer" : undefined}
                aria-label={c.label}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[0_8px_20px_-8px_rgba(27,126,194,0.7)] transition-transform duration-200 hover:scale-90"
              >
                {c.icon}
              </a>
              <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-heading)]">
                {c.label}
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>,
    document.body
  );
}
