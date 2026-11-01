"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, Product } from "@/lib/types";
import { ymReachGoal } from "@/lib/metrika";

interface CartState {
  lines: CartLine[];
  add: (product: Product, qty?: number) => void;
  remove: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
  clear: () => void;
  totalKopecks: () => number;
  totalQty: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      add: (product, qty = 1) =>
        set((state) => {
          /* Цель Метрики «добавление в корзину» (Task 107) — все кнопки
             «В корзину» витрины проходят через этот метод стора */
          ymReachGoal("add_to_cart", {
            product_id: product.id,
            product: product.name,
            price: Math.round(product.price_kopecks / 100),
            quantity: qty,
          });
          const existing = state.lines.find((l) => l.product.id === product.id);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.product.id === product.id ? { ...l, qty: l.qty + qty } : l
              ),
            };
          }
          return { lines: [...state.lines, { product, qty }] };
        }),

      remove: (productId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.product.id !== productId),
        })),

      setQty: (productId, qty) =>
        set((state) => ({
          lines:
            qty <= 0
              ? state.lines.filter((l) => l.product.id !== productId)
              : state.lines.map((l) =>
                  l.product.id === productId ? { ...l, qty } : l
                ),
        })),

      clear: () => set({ lines: [] }),

      totalKopecks: () =>
        get().lines.reduce(
          (sum, l) => sum + l.product.price_kopecks * l.qty,
          0
        ),

      totalQty: () => get().lines.reduce((sum, l) => sum + l.qty, 0),
    }),
    { name: "lakomka-cart" }
  )
);