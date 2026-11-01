"use client";

/* ============================================================
   Task 114: АДМИНСКИЙ ТУЛБАР НА СТРАНИЦАХ ВИТРИНЫ.
   Плавающая панель справа внизу видна ТОЛЬКО авторизованным
   editor/super_admin (проверка через /api/auth/me с httpOnly-кукой).
   Обычный покупатель не получает ни кнопок, ни лишних запросов
   результата — панель рендерится пустотой, пока роль не подтверждена.

   На карточке товара (/product/{slug}) добавляется кнопка
   «Редактировать товар» → /admin/products/edit?id={id}
   (id берётся из публичного /api/products/{slug}).

   Монтируется в layout группы (shop) — в /admin не попадает.
   ============================================================ */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

interface MeUser {
  email?: string;
  name?: string;
  role?: string;
}

export function AdminToolbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<MeUser | null>(null);
  const [product, setProduct] = useState<{ id: number; name: string } | null>(null);

  const isEditor =
    user?.role === "super_admin" || user?.role === "editor";

  /* Роль при каждой смене страницы (и после входа/выхода в другой вкладке) */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (alive) setUser(res.ok ? (json.data ?? null) : null);
      } catch {
        if (alive) setUser(null);
      }
    })();
    return () => { alive = false; };
  }, [pathname]);

  /* На карточке товара — узнать id для кнопки «Редактировать».
     Все setState — после await: синхронных каскадов рендера нет. */
  useEffect(() => {
    let alive = true;
    (async () => {
      let next: { id: number; name: string } | null = null;
      const m = /^\/product\/([^/?#]+)\/?$/.exec(pathname || "");
      if (isEditor && m) {
        try {
          const res = await fetch(`${API_URL}/products/${encodeURIComponent(m[1])}`, {
            cache: "no-store",
          });
          const json = await res.json().catch(() => ({}));
          if (!alive) return;
          if (res.ok && json.data?.id) {
            next = { id: Number(json.data.id), name: String(json.data.name ?? "") };
          }
        } catch { /* тулбар не должен падать — просто без кнопки */ }
      }
      if (alive) setProduct(next);
    })();
    return () => { alive = false; };
  }, [pathname, isEditor]);

  if (!isEditor) return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-40 flex flex-wrap items-center gap-1.5 rounded-full border border-white/10 bg-neutral-900/90 px-2 py-1.5 text-xs text-white shadow-lg backdrop-blur"
      data-testid="admin-toolbar"
    >
      {product && (
        <Link
          href={`/admin/products/edit?id=${product.id}`}
          title={`Редактировать «${product.name}»`}
          className="flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 font-medium text-neutral-900 transition hover:bg-amber-400"
        >
          ✎ Редактировать товар
        </Link>
      )}
      <Link
        href="/admin"
        title={user?.email ?? "Админка"}
        className="flex items-center gap-1 rounded-full px-3 py-1.5 font-medium text-white/90 transition hover:bg-white/10"
      >
        ⚙ Админка
      </Link>
    </div>
  );
}
