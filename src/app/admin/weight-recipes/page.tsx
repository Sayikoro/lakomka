import { cookies } from "next/headers";
import {
  WeightRecipesViewer,
  type WeightSummary,
} from "@/components/admin/WeightRecipesViewer";

async function getWeights(): Promise<WeightSummary[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return [];

  const apiUrl = process.env.PHP_API_URL ?? "http://localhost:8000/api";
  try {
    const res = await fetch(`${apiUrl}/admin/weight-recipes`, {
      headers: { Cookie: `admin_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: WeightSummary[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export default async function AdminWeightRecipesPage() {
  const weights = await getWeights();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
          Рецепты по граммовке
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Справочник конфет для каждой граммовки. Используется в карточке набора
          кнопкой «Заполнить по граммовке». Можно редактировать вручную или
          загрузить новый CSV.
        </p>
      </div>

      {weights.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-white p-12 text-center text-[var(--color-muted)]">
          Рецептов нет. Загрузите CSV через{" "}
          <code className="rounded bg-[var(--color-bg-soft)] px-1.5 py-0.5">
            php scripts/import-weight-recipes.php
          </code>{" "}
          или через кнопку «Загрузить CSV».
        </div>
      ) : (
        <WeightRecipesViewer initialWeights={weights} />
      )}
    </div>
  );
}