"use client";

import { useState } from "react";
import { useCart } from "@/store/cart";
import { useT } from "@/components/texts/TextsProvider";
import type { Product } from "@/lib/types";

interface Props {
  product: Product;
}

export function AddToCart({ product }: Props) {
  const add = useCart((s) => s.add);
  const t = useT();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    add(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center rounded-[var(--radius-btn)] border border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="h-10 w-10 rounded-l-full text-lg text-[var(--color-primary)] hover:bg-[var(--color-bg-soft)]"
          aria-label="Уменьшить количество"
        >
          −
        </button>
        <span className="w-10 text-center font-medium">{qty}</span>
        <button
          type="button"
          onClick={() => setQty((q) => q + 1)}
          className="h-10 w-10 rounded-r-full text-lg text-[var(--color-primary)] hover:bg-[var(--color-bg-soft)]"
          aria-label="Увеличить количество"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-3 font-medium text-white transition hover:bg-[var(--color-primary-hover)] active:scale-95"
      >
        {added ? t("product_added") : t("product_add")}
      </button>
    </div>
  );
}