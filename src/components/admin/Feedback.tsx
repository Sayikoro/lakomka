"use client";

/* Task 152: единая обратная связь админки — тосты и подтверждения.
 * Раньше 32 места в 13 файлах дёргали window.confirm/window.alert —
 * браузерные диалоги выглядят чужеродно и не стилизуются. Теперь:
 *
 *   const toast = useToast();            // внутри AdminFeedbackProvider
 *   toast("Сохранено");                  // success по умолчанию
 *   toast("Ошибка SMTP", "error");
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "Удалить файл?",
 *     message: "Действие нельзя отменить.",
 *     confirmLabel: "Удалить",
 *     danger: true,
 *   });
 *
 * Провайдеры смонтированы в админ-лэйауте. Витрина их не использует. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ============================== ТОСТЫ =============================== */

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastCtx {
  toast: (text: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast(): ToastCtx {
  return useContext(ToastContext);
}

const TOAST_STYLES: Record<ToastKind, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-heading)]",
};

function ToastIcon({ kind }: { kind: ToastKind }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  if (kind === "success") {
    return (
      <svg {...common} className="shrink-0 text-green-600">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="m9 11 3 3L22 4" />
      </svg>
    );
  }
  if (kind === "error") {
    return (
      <svg {...common} className="shrink-0 text-red-600">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="8" y2="12" />
        <line x1="12" x2="12.01" y1="16" y2="16" />
      </svg>
    );
  }
  return (
    <svg {...common} className="shrink-0 text-[var(--color-muted)]">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function ToastStack({ items, remove }: { items: ToastItem[]; remove: (id: number) => void }) {
  /* Портал — как Modal: тосты не должны попадать в stacking-контексты */
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 left-1/2 z-[98] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 lg:bottom-6"
      data-testid="admin-toasts"
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} remove={remove} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({ item, remove }: { item: ToastItem; remove: (id: number) => void }) {
  /* Таймер на карточку: закрытие по клику или через 4.5 с */
  useEffect(() => {
    const t = setTimeout(() => remove(item.id), 4500);
    return () => clearTimeout(t);
  }, [item.id, remove]);
  return (
    <button
      type="button"
      onClick={() => remove(item.id)}
      className={`pointer-events-auto flex w-full items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm shadow-lg transition-opacity ${TOAST_STYLES[item.kind]}`}
      role="status"
    >
      <ToastIcon kind={item.kind} />
      <span className="min-w-0 flex-1 break-words">{item.text}</span>
    </button>
  );
}

/* ============================ ПОДТВЕРЖДЕНИЯ ========================= */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Красная кнопка и иконка — для удаления/блокировки */
  danger?: boolean;
}

interface ConfirmCtx {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmCtx>({
  confirm: async () => false,
});

export function useConfirm(): ConfirmCtx {
  return useContext(ConfirmContext);
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

function ConfirmDialog({
  pending,
  answer,
}: {
  pending: PendingConfirm | null;
  answer: (ok: boolean) => void;
}) {
  const options = pending?.options ?? null;
  const open = pending !== null && options !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, answer]);

  if (!open || !options) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => answer(false)}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={options.title}
        data-testid="admin-confirm"
        className="relative w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--color-card)] p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          {options.danger && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" x2="12" y1="9" y2="13" />
                <line x1="12" x2="12.01" y1="17" y2="17" />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-heading)]">
              {options.title}
            </h2>
            {options.message && (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-[var(--color-body)]">
                {options.message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => answer(false)}
            className="rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm text-[var(--color-body)] hover:border-[var(--color-primary)] hover:text-[var(--color-heading)]"
          >
            {options.cancelLabel ?? "Отмена"}
          </button>
          <button
            type="button"
            autoFocus
            data-testid="admin-confirm-yes"
            onClick={() => answer(true)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
              options.danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]"
            }`}
          >
            {options.confirmLabel ?? "ОК"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ============================ ПРОВАЙДЕР ============================= */

export function AdminFeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: ToastKind = "success") => {
    const id = ++seq.current;
    setToasts((list) => [...list.slice(-4), { id, kind, text }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  /* confirm(): Promise-диалог. Храним очередь (обычно один запрос,
     но повторные клики не должны терять resolve). */
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending((prev) => {
        /* На случай «нажал дважды»: прежний диалог закрываем как «отмена» */
        prev?.resolve(false);
        return { options, resolve };
      });
    });
  }, []);

  const answer = useCallback(
    (ok: boolean) => {
      setPending((prev) => {
        prev?.resolve(ok);
        return null;
      });
    },
    [],
  );

  const toastCtx = useMemo(() => ({ toast }), [toast]);
  const confirmCtx = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ToastContext.Provider value={toastCtx}>
      <ConfirmContext.Provider value={confirmCtx}>
        {children}
        <ToastStack items={toasts} remove={removeToast} />
        <ConfirmDialog pending={pending} answer={answer} />
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
