import Link from "next/link";

interface PageProps {
  params: Promise<{ number: string }>;
}

export const metadata = {
  title: "Заказ оформлен — Лакомка",
};

export default async function OrderSuccessPage({ params }: PageProps) {
  const { number } = await params;
  const decoded = decodeURIComponent(number);

  return (
    <div className="mx-auto max-w-[700px] px-4 py-20 text-center">
      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)] text-3xl text-white">
        ✓
      </div>
      <h1 className="mb-4 text-[32px] font-medium text-[var(--color-heading)]">
        Заказ оформлен
      </h1>
      <p className="mb-2 text-[var(--color-body)]">
        Номер вашего заказа:
      </p>
      <p className="mb-6 text-2xl font-semibold text-[var(--color-heading)]">
        {decoded}
      </p>
      <p className="mb-8 text-[var(--color-muted)]">
        Менеджер свяжется с вами в рабочее время для подтверждения заказа
        и согласования доставки.
      </p>
      <Link
        href="/catalog"
        className="inline-flex rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-8 py-3 font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
      >
        Вернуться в каталог
      </Link>
    </div>
  );
}