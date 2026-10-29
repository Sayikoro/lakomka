import { CandiesManager } from "@/components/admin/CandiesManager";

export const metadata = {
  title: "Конфеты — Админка",
};

export default function AdminCandiesPage() {
  return (
    <div>
      <h1 className="mb-6 text-[24px] font-medium text-[var(--color-heading)]">
        Конфеты и кастомные наборы
      </h1>
      <CandiesManager />
    </div>
  );
}
