"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/store/cart";

export function Header() {
  const lines = useCart((s) => s.lines);
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="border-b border-[var(--color-border)] bg-white">
      <div className="mx-auto flex h-[70px] max-w-[1200px] items-center justify-between px-4">
        <Link href="/" className="text-xl font-semibold text-[var(--color-heading)]">
          Лакомка
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/catalog"
            className="text-[var(--color-body)] hover:text-[var(--color-primary)]"
          >
            Каталог
          </Link>
          <Link
            href="/cart"
            className="relative flex items-center gap-2 text-[var(--color-body)] hover:text-[var(--color-primary)]"
          >
            Корзина
            {mounted && totalQty > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-1 text-xs font-bold text-white">
                {totalQty}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}