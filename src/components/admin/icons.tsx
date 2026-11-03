"use client";

/* Иконки админки (Task 137) — единый линейный набор вместо эмодзи.
 * Рисуются currentColor, размер настраивается классом. Базовый кегль 20px,
 * stroke 1.8 — читаемо и на ретине, и на маленьких кнопках мобильных.
 *
 * Замена эмодзи на SVG: эмодзи по-разному выглядят на Windows/Android/iOS
 * и не перекрашиваются темой; SVG наследует цвет активного пункта меню. */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="20"
      height="20"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconOrders(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 7h8M8 11h8M8 15h5" />
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M9 3.2V2m6 1.2V2" />
    </Base>
  );
}

export function IconAnalytics(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20V10m5.3 10V4m5.4 16v-7m5.3 7V8" />
    </Base>
  );
}

export function IconBox(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M4.2 7.6 12 12l7.8-4.4M12 12v8.8" />
    </Base>
  );
}

export function IconScale(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4v16m0-16-6 2m6-2 6 2" />
      <path d="M6 6 3 13a3.2 3.2 0 0 0 6 0L6 6Zm12 0-3 7a3.2 3.2 0 0 0 6 0l-3-7Z" />
      <path d="M8 20h8" />
    </Base>
  );
}

export function IconCandy(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="m8.6 8.8-3.3-3m9.9 2.9 3.2-3M8.6 15.2l-3.3 3m9.9-2.9 3.2 3" />
      <path d="M12 9.4v5.2M9.4 12h5.2" />
    </Base>
  );
}

export function IconPdf(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 17v-4h1.2a1.3 1.3 0 0 1 0 2.6H9.5m4.9 1.4v-4h1.7" />
    </Base>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.6c.7 0 1.3.3 1.8.8l1.2 1.2h5.4A2.5 2.5 0 0 1 20.5 9v8A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7Z" />
    </Base>
  );
}

export function IconText(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 6h14M5 11h14M5 16h9" />
    </Base>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.8 19.2c.6-2.9 2.7-4.6 5.2-4.6s4.6 1.7 5.2 4.6" />
      <path d="M15.5 5.7a3.2 3.2 0 0 1 0 5.7m1.4 3.6c1.7.6 3 2 3.4 4.2" />
    </Base>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8 13 5a7.2 7.2 0 0 1 2.1.9l2.3-.8 1.9 3.2-1.7 1.7a7 7 0 0 1 0 2.3l1.7 1.7-1.9 3.2-2.3-.8a7.2 7.2 0 0 1-2.1.9l-1 2.5h-.1l-1-2.5a7.2 7.2 0 0 1-2-.9l-2.3.8-1.9-3.2 1.7-1.7a7 7 0 0 1 0-2.3L4.7 8.3l1.9-3.2 2.3.8A7.2 7.2 0 0 1 11 5l1-2.2Z" />
    </Base>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </Base>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20h-4" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </Base>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 5h5v5" />
      <path d="M19 5 11.5 12.5" />
      <path d="M19 14.5V18A1.5 1.5 0 0 1 17.5 19.5h-11A1.5 1.5 0 0 1 5 18V7a1.5 1.5 0 0 1 1.5-1.5H10" />
    </Base>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}
