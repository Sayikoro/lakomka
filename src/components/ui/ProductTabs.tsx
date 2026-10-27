"use client";

import { useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/Modal";
import { PACKAGING_LABELS } from "@/lib/constants";
import type { Product, BundleItem } from "@/lib/types";

interface Props {
  product: Product;
}

type TabKey = "description" | "details" | "composition";

const TAB_LABELS: Record<TabKey, string> = {
  description: "Описание",
  details: "Детали",
  composition: "Состав подарка",
};

function formatWeight(g: number | null | undefined): string | null {
  if (g === null || g === undefined || g <= 0) return null;
  if (g >= 1000) {
    const kg = g / 1000;
    return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(2).replace(/\.?0+$/, "")} кг`;
  }
  return `${g} г`;
}

function formatDimensions(
  l: number | null | undefined,
  w: number | null | undefined,
  h: number | null | undefined,
): string | null {
  if (!l && !w && !h) return null;
  const fmt = (n: number | null | undefined) =>
    n ? (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "")) : "—";
  return `${fmt(l)} × ${fmt(w)} × ${fmt(h)} см`;
}

export function ProductTabs({ product }: Props) {
  const isBundle = product.type === "bundle" && (product.bundle_items?.length ?? 0) > 0;

  const tabs: TabKey[] = ["description", "details"];
  if (isBundle) tabs.push("composition");

  const initial: TabKey = product.description ? "description" : "details";
  const [active, setActive] = useState<TabKey>(initial);
  const [selected, setSelected] = useState<BundleItem | null>(null);

  const weight = formatWeight(product.weight_g);
  const dims = formatDimensions(product.length_cm, product.width_cm, product.height_cm);

  return (
    <>
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
        <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] px-2">
          {tabs.map((key) => {
            const isActive = active === key;
            return (
              <button key={key} type="button" onClick={() => setActive(key)}
                className={`relative px-4 py-3 text-sm font-medium transition ${
                  isActive
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-heading)]"
                }`}>
                {TAB_LABELS[key]}
                {isActive && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 bg-[var(--color-primary)]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {active === "description" && (
            <div>
              {product.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-body)]">
                  {product.description}
                </p>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">Описание пока не заполнено.</p>
              )}
            </div>
          )}

          {active === "details" && (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-[200px_1fr]">
              {product.manufacturer && (
                <>
                  <dt className="text-[var(--color-muted)]">Производитель</dt>
                  <dd className="text-[var(--color-heading)]">{product.manufacturer}</dd>
                </>
              )}
              <dt className="text-[var(--color-muted)]">Тип</dt>
              <dd className="text-[var(--color-heading)]">
                {isBundle ? "Подарочный набор" : "Подарочный товар"}
              </dd>
              {product.packaging_material && (
                <>
                  <dt className="text-[var(--color-muted)]">Материал упаковки</dt>
                  <dd className="text-[var(--color-heading)]">
                    {PACKAGING_LABELS[product.packaging_material] ?? product.packaging_material}
                  </dd>
                </>
              )}
              {weight && (
                <>
                  <dt className="text-[var(--color-muted)]">Вес</dt>
                  <dd className="text-[var(--color-heading)]">{weight}</dd>
                </>
              )}
              {dims && (
                <>
                  <dt className="text-[var(--color-muted)]">Габариты (Д × Ш × В)</dt>
                  <dd className="text-[var(--color-heading)]">{dims}</dd>
                </>
              )}
              {product.sku && (
                <>
                  <dt className="text-[var(--color-muted)]">Артикул</dt>
                  <dd className="text-[var(--color-heading)]">{product.sku}</dd>
                </>
              )}
              {isBundle && (
                <>
                  <dt className="text-[var(--color-muted)]">Позиций в наборе</dt>
                  <dd className="text-[var(--color-heading)]">{product.bundle_items!.length}</dd>
                </>
              )}
            </dl>
          )}

          {active === "composition" && isBundle && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {product.bundle_items!.map((item) => (
                <CompositionCard key={item.id} item={item} onDetails={() => setSelected(item)} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.component?.name ?? ""}>
        {selected && (
          <div className="space-y-4">
            <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-soft)]">
              {selected.component?.images?.[0]?.url ? (
                <Image src={selected.component.images[0].url} alt={selected.component.name}
                  fill sizes="400px" className="object-contain p-4" />
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
                  Нет изображения
                </div>
              )}
            </div>
            {selected.component?.manufacturer && (
              <p className="text-xs text-[var(--color-muted)]">
                Производитель:{" "}
                <span className="font-medium text-[var(--color-heading)]">
                  {selected.component.manufacturer}
                </span>
              </p>
            )}
            {selected.quantity > 1 && (
              <p className="text-xs text-[var(--color-muted)]">
                В наборе:{" "}
                <span className="font-medium text-[var(--color-heading)]">× {selected.quantity}</span>
              </p>
            )}
            {selected.component?.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-body)]">
                {selected.component.description}
              </p>
            ) : (
              <p className="text-sm italic text-[var(--color-muted)]">
                Описание для этой позиции пока не заполнено.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function CompositionCard({ item, onDetails }: { item: BundleItem; onDetails: () => void }) {
  const c = item.component;
  const img = c?.images?.[0]?.url ?? null;

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
      <div className="relative aspect-square overflow-hidden bg-[var(--color-bg-soft)]">
        {img ? (
          <Image src={img} alt={c?.name ?? ""} fill
            sizes="(max-width: 640px) 50vw, 25vw" className="object-contain p-3" />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
            Нет фото
          </div>
        )}
        {item.quantity > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
            × {item.quantity}
          </span>
        )}
      </div>
            <div className="flex flex-1 flex-col gap-1 p-2">
        {c?.manufacturer && (
          <p className="line-clamp-1 text-[10px] text-[var(--color-muted)]">
            {c.manufacturer}
          </p>
        )}
        <p className="line-clamp-2 text-xs font-medium leading-snug text-[var(--color-heading)]">
          {c?.name ?? "—"}
        </p>
        <button type="button" onClick={onDetails}
          className="mt-auto inline-flex items-center gap-1 self-start rounded-[var(--radius-btn)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium text-[var(--color-primary)] transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white">
          Подробнее
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}