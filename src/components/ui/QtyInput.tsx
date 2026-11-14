"use client";

import { useEffect, useRef, useState } from "react";

interface QtyInputProps {
  /** Актуальное значение количества (из стора или локального состояния) */
  value: number;
  /** Вызывается с нормализованным значением, если оно изменилось */
  onCommit: (qty: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
  className?: string;
}

const MAX_LEN = 3; /* до 999 — руками больше не вводят */

/* Поле количества с вводом с клавиатуры (Task 154).
   Раньше количество менялось только стрелками +/-, а клиенту может
   понадобиться 100 подарков — теперь число можно напечатать.
   Пока поле в фокусе — свободный ввод цифр; на blur/Enter значение
   нормализуется: пустое/мусорное возвращается к прежнему, остальное
   зажимается в min..max. Стрелки вверх/вниз на клавиатуре тоже работают.
   inputMode="numeric" — цифровая клавиатура на телефоне, при фокусе
   значение выделяется целиком, 16px — чтобы iOS не зумил страницу. */
export function QtyInput({
  value,
  onCommit,
  min = 1,
  max = 999,
  ariaLabel = "Количество",
  className = "",
}: QtyInputProps) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  /* Пока поле не редактируется — показываем актуальное значение из стора
     (например, количество изменили с другой страницы или кнопками +/-) */
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  function commit() {
    const raw = text.trim();
    const parsed = raw === "" ? Number.NaN : Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setText(String(value)); /* пусто или мусор — возвращаем прежнее */
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label={ariaLabel}
      maxLength={MAX_LEN}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChange={(e) => {
        /* только цифры, без ведущих нулей */
        const digits = e.target.value
          .replace(/\D/g, "")
          .replace(/^0+(?=\d)/, "");
        setText(digits.slice(0, MAX_LEN));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const step = e.key === "ArrowUp" ? 1 : -1;
          const base = Number.parseInt(text, 10);
          const next = Math.min(
            max,
            Math.max(min, (Number.isFinite(base) ? base : value) + step)
          );
          setText(String(next));
          onCommit(next);
        }
      }}
      className={`${className} rounded-[inherit] bg-transparent text-center outline-none transition-colors focus:bg-[var(--color-bg-soft)]`}
    />
  );
}
