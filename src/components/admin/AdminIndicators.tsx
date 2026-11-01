"use client";

/* Индикаторы шапки админки (Task 97-106):
 *
 * 1. NewOrdersBadge — бейдж «новые заказы» на ссылке «Заказы»:
 *    опрос /api/admin/orders/unread раз в 45 сек, счётчик заказов,
 *    которые пользователь ещё не видел (lastSeenId в localStorage).
 *    При появлении нового заказа — тихий сигнал через WebAudio
 *    (без аудиофайлов). Открытие страницы заказов помечает всё
 *    прочитанным.
 *
 * 2. UpdateBadge — плашка «доступно обновление» для super_admin:
 *    один запрос к /api/admin/site-update/github-check на монтировании
 *    (сервер кеширует ответ на 60 сек — дёшево). Если есть релиз новее
 *    текущей версии — заметная ссылка на вкладку обновлений. Боль из
 *    Task 91: «не работает» оказалась необновлённая версия — теперь
 *    забыть про обновление сложнее.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const LAST_SEEN_KEY = "admin_last_seen_order_id";

interface UnreadData {
  count_since: number;
  count_new: number;
  max_id: number;
  latest: { order_number: string; customer_name: string; total_kopecks: number } | null;
}

/** Короткий двухтонный сигнал (WebAudio, без файлов) */
function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1174.7].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.32);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* звук не критичен */
  }
}

export function NewOrdersBadge({ onOrdersPage }: { onOrdersPage: boolean }) {
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const prevCountRef = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      let sinceId = 0;
      try {
        sinceId = Number(localStorage.getItem(LAST_SEEN_KEY) ?? "0") || 0;
      } catch {
        /* без localStorage — просто since_id=0 */
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const res = await fetch(`${apiUrl}/admin/orders/unread?since_id=${sinceId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data: UnreadData };
      const d = json.data;
      setCount(d.count_since);

      /* Новые заказы появились (не первый опрос) → сигнал + всплывашка */
      if (prevCountRef.current !== null && d.count_since > prevCountRef.current) {
        playChime();
        if (d.latest) {
          const rub = Math.round(d.latest.total_kopecks / 100);
          setToast(`Новый заказ ${d.latest.order_number} — ${rub} ₽ (${d.latest.customer_name})`);
          window.setTimeout(() => setToast(null), 8000);
        }
      }
      prevCountRef.current = d.count_since;
    } catch {
      /* API недоступен — бейдж просто не обновится */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive) void poll();
    };
    tick();
    const t = window.setInterval(tick, 45000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [poll]);

  /* Страница заказов открыта → всё прочитано */
  useEffect(() => {
    if (!onOrdersPage) return;
    let cancelled = false;
    (async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
        const res = await fetch(`${apiUrl}/admin/orders/unread?since_id=0`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { data: UnreadData };
        try {
          localStorage.setItem(LAST_SEEN_KEY, String(json.data.max_id));
        } catch {
          /* приватный режим */
        }
        setCount(0);
        prevCountRef.current = 0;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onOrdersPage]);

  return (
    <>
      {count > 0 && (
        <span
          data-testid="orders-badge"
          aria-label={`Новых заказов: ${count}`}
          className="ml-1 inline-flex min-w-[20px] justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
      {toast && (
        <span className="fixed left-1/2 top-16 z-[90] -translate-x-1/2 rounded-full bg-[#2e9e5b] px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </span>
      )}
    </>
  );
}

interface CheckData {
  update_available: boolean;
  current_version: string | null;
  release?: { tag: string } | null;
  asset?: { version: string } | null;
}

export function UpdateBadge({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [info, setInfo] = useState<CheckData | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
        const res = await fetch(`${apiUrl}/admin/site-update/github-check`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { data: CheckData };
        setInfo(json.data);
      } catch {
        /* нет связи с GitHub — плашка не показывается */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  return (
    <span data-testid="version-badge" className="flex items-center gap-2 text-xs">
      {info?.update_available ? (
        <a
          href="/admin/settings"
          title="Доступно обновление — откройте Настройки → вкладка «Обновление»"
          className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 ring-1 ring-amber-300 transition-colors hover:bg-amber-200"
        >
          ↑ Обновление {info?.asset?.version ? `v${info.asset.version}` : "доступно"}
        </a>
      ) : (
        info?.current_version && (
          <span className="text-[var(--color-muted)]" title="Версия установлена — обновлений нет">
            v{info.current_version}
          </span>
        )
      )}
    </span>
  );
}
