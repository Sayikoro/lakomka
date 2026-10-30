"use client";

/* Рецепты по граммовке — клиентская версия (данные через /api/admin/weight-recipes). */

import { useCallback, useEffect, useState } from "react";
import {
  WeightRecipesViewer,
  type WeightSummary,
} from "@/components/admin/WeightRecipesViewer";

export default function AdminWeightRecipesPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
  const [weights, setWeights] = useState<WeightSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/weight-recipes`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Ошибка ${res.status}`);
        setWeights([]);
        return;
      }
      setWeights((json.data as WeightSummary[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setWeights([]);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

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

      {error && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {weights === null ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white p-12 text-center text-sm text-[var(--color-muted)]">
          Загрузка…
        </div>
      ) : weights.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-white p-12 text-center text-[var(--color-muted)]">
          Рецептов нет. Загрузите CSV кнопкой «Загрузить CSV».
        </div>
      ) : (
        <WeightRecipesViewer initialWeights={weights} />
      )}
    </div>
  );
}
