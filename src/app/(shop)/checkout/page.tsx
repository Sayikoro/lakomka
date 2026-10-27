"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCart } from "@/store/cart";
import { formatPrice } from "@/lib/utils";

const schema = z
  .object({
    customer_name: z.string().min(2, "Укажите имя (минимум 2 символа)"),
    customer_phone: z
      .string()
      .regex(/^[\d\s\+\-\(\)]{10,}$/, "Некорректный телефон"),
    customer_email: z
      .string()
      .email("Некорректный email")
      .optional()
      .or(z.literal("")),
    delivery_method: z.enum(["pickup", "city", "region", "tk"]),
    address: z.string().optional(),
    comment: z.string().optional(),
  })
  .refine(
    (d) => d.delivery_method === "pickup" || (d.address && d.address.length > 5),
    { message: "Укажите адрес доставки", path: ["address"] }
  );

type FormData = z.infer<typeof schema>;

const DELIVERY_OPTIONS: { value: FormData["delivery_method"]; label: string }[] = [
  { value: "pickup", label: "Самовывоз" },
  { value: "city", label: "По Хабаровску" },
  { value: "region", label: "За городом" },
  { value: "tk", label: "Транспортной компанией" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);

  const [mounted, setMounted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setMounted(true), []);

  const totalKopecks = useMemo(
    () => lines.reduce((sum, l) => sum + l.product.price_kopecks * l.qty, 0),
    [lines]
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      delivery_method: "city",
      customer_name: "",
      customer_phone: "",
      customer_email: "",
      address: "",
      comment: "",
    },
  });

  const method = watch("delivery_method");

  if (!mounted) {
    return <div className="mx-auto max-w-[1200px] px-4 py-10" />;
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-20 text-center">
        <h1 className="mb-4 text-[32px] font-medium text-[var(--color-heading)]">
          Корзина пуста
        </h1>
        <p className="mb-8 text-[var(--color-muted)]">
          Добавьте товары, чтобы оформить заказ.
        </p>
        <Link
          href="/catalog"
          className="inline-flex rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-8 py-3 font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Перейти в каталог
        </Link>
      </div>
    );
  }

  async function onSubmit(data: FormData) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            items: lines.map((l) => ({
              product_id: l.product.id,
              qty: l.qty,
            })),
          }),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        setSubmitError(json.error ?? "Не удалось создать заказ");
        return;
      }

      clear();
      router.push(`/order/${encodeURIComponent(json.data.order_number)}`);
    } catch {
      setSubmitError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const labelClass = "mb-1 block text-sm font-medium text-[var(--color-heading)]";
  const errClass = "mt-1 text-xs text-red-500";

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <h1 className="mb-8 text-[32px] font-medium text-[var(--color-heading)]">
        Оформление заказа
      </h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-8 lg:grid-cols-[1fr_360px]"
      >
        <div className="space-y-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-6">
          <div>
            <label className={labelClass}>Имя *</label>
            <input {...register("customer_name")} className={inputClass} />
            {errors.customer_name && (
              <p className={errClass}>{errors.customer_name.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Телефон *</label>
            <input
              {...register("customer_phone")}
              className={inputClass}
              placeholder="+7 (999) 000-00-00"
              type="tel"
            />
            {errors.customer_phone && (
              <p className={errClass}>{errors.customer_phone.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input
              {...register("customer_email")}
              className={inputClass}
              placeholder="для отправки копии заказа"
              type="email"
            />
            {errors.customer_email && (
              <p className={errClass}>{errors.customer_email.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Способ доставки *</label>
            <div className="mt-2 space-y-1.5">
              {DELIVERY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    value={opt.value}
                    {...register("delivery_method")}
                    className="accent-[var(--color-primary)]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {method !== "pickup" && (
            <div>
              <label className={labelClass}>Адрес *</label>
              <input
                {...register("address")}
                className={inputClass}
                placeholder={
                  method === "tk" ? "Город и адрес ПВЗ/ТК" : "Улица, дом, квартира"
                }
              />
              {errors.address && (
                <p className={errClass}>{errors.address.message}</p>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>Комментарий</label>
            <textarea
              {...register("comment")}
              className={inputClass}
              rows={3}
              placeholder="Например: позвонить за час"
            />
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-6">
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              Ваш заказ
            </h2>
            <ul className="mb-3 space-y-1.5 text-sm text-[var(--color-body)]">
              {lines.map((l) => (
                <li
                  key={l.product.id}
                  className="flex justify-between gap-2 border-b border-[var(--color-border)] pb-1.5 last:border-none"
                >
                  <span className="line-clamp-2">
                    {l.product.name} × {l.qty}
                  </span>
                  <span className="shrink-0">
                    {formatPrice(l.product.price_kopecks * l.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mb-4 flex justify-between text-lg font-semibold text-[var(--color-heading)]">
              <span>Итого</span>
              <span>{formatPrice(totalKopecks)}</span>
            </div>

            {submitError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-3 font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {submitting ? "Отправляем…" : "Оформить заказ"}
            </button>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Нажимая кнопку, вы соглашаетесь с условиями обработки персональных данных.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}