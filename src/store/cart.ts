"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, Product } from "@/lib/types";

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