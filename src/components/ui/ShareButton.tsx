"use client";

/* ============================================================
   Task 141: кнопка «Поделиться» в карточке товара.

   На телефоне (или где поддерживается Web Share API) — системное
   меню шаринга одним нажатием. На десктопе — компактное меню:
   Telegram / WhatsApp / VK + «Скопировать ссылку» (с подписью
   «Ссылка скопирована»). Каждое действие уходит в аналитику
   (gift_share с каналом) — владелец видит, чем делятся.
   Ссылка строится из текущего origin — работает на любом домене.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/texts/TextsProvider";
import { trackGiftShare } from "@/lib/visit-tracker";

interface Props {
  slug: string;
  name: string;
  /** Путь относительно корня (по умолчанию /product/<slug>) */
  path?: string;
  testId?: string;
}

export function ShareButton({ slug, name, path, testId }: Props) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const sharePath = path ?? `/product/${slug}`;

  /* Закрытие меню по клику мимо и по Esc */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const buildUrl = () =>
    `${window.location.origin}${sharePath}`;

  const shareText = () => `${name} — Лакомка`;

  const nativeShare = async () => {
    const url = buildUrl();
    try {
      await navigator.share({ title: name, text: shareText(), url });
      trackGiftShare(slug, name, "native");
    } catch (err) {
      /* Отмена пользователем — не ошибка; прочие сбои не ломаем витрину */
      if ((err as DOMException)?.name !== "AbortError") {
        setMenuOpen(true);
      }
    }
  };

  const openChannel = (channel: "telegram" | "whatsapp" | "vk") => {
    const url = encodeURIComponent(buildUrl());
    const text = encodeURIComponent(shareText());
    const links: Record<typeof channel, string> = {
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      vk: `https://vk.com/share.php?url=${url}&title=${text}`,
    };
    trackGiftShare(slug, name, channel);
    window.open(links[channel], "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  };

  const copyLink = async () => {
    const url = buildUrl();
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      /* clipboard API недоступен (http, старый браузер) — fallback */
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      trackGiftShare(slug, name, "copy");
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
        setMenuOpen(false);
      }, 1400);
    }
  };

  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof window !== "undefined" &&
    /* На широких экранах системный шаринг обычно бесполезен — показываем меню */
    window.matchMedia("(max-width: 767px)").matches;

  const onButtonClick = () => {
    if (canNativeShare) {
      void nativeShare();
    } else {
      setMenuOpen((v) => !v);
    }
  };

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-heading)] transition-colors hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-primary)]";

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={onButtonClick}
        aria-label={t("product_share")}
        aria-expanded={menuOpen}
        data-testid={testId ?? "share-button"}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm text-[var(--color-heading)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 10.7l6.8-4M8.6 13.3l6.8 4" />
        </svg>
        {copied ? t("product_share_copied") : t("product_share")}
      </button>

      {menuOpen && (
        <div
          data-testid="share-menu"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-52 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-1.5 shadow-lg"
        >
          <button type="button" onClick={() => openChannel("telegram")} className={itemClass}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M21.9 4.6c.3-1.3-.7-1.9-1.6-1.5L2.6 10.3c-1.2.5-1.2 1.4-.2 1.7l4.5 1.4 1.7 5.2c.2.6.4.8.9.8.4 0 .6-.2 1-.5l2.4-2.3 4.6 3.4c.8.5 1.5.2 1.7-.8l2.7-14.6zM8.9 13.5l9.2-5.8c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.2-1.8-4.5z" />
            </svg>
            Telegram
          </button>
          <button type="button" onClick={() => openChannel("whatsapp")} className={itemClass}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.5-.3-3 .8.8-2.9-.3-.5A8 8 0 0 1 12 4zm-3.1 4.2c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.8 4.3 3.8 2.1.8 2.5.7 3 .6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3l-1.7-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-.9-1.1-1.3-1.7-.1-.2 0-.4.1-.5l.5-.6c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5L9.7 8.6c-.2-.4-.4-.4-.8-.4z" />
            </svg>
            WhatsApp
          </button>
          <button type="button" onClick={() => openChannel("vk")} className={itemClass}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M13 18.6c-6.2 0-9.8-4.3-9.9-11.4h3.1c.1 5.3 2.5 7.5 4.3 8V7.2h3v4.6c1.8-.2 3.7-2.3 4.3-4.6h3c-.5 2.9-2.5 5-4 5.9 1.5.7 3.7 2.6 4.6 5.5h-3.3c-.7-2.1-2.4-3.8-4.6-4v4h-.5z" />
            </svg>
            ВКонтакте
          </button>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button type="button" onClick={() => void copyLink()} className={itemClass} data-testid="share-copy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
            {copied ? t("product_share_copied") : "Скопировать ссылку"}
          </button>
        </div>
      )}
    </div>
  );
}
