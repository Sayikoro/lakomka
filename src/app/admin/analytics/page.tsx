"use client";

/* ============================================================
   Аналитика (Task 133): собственная статистика посещений витрины
   + защита от автоматизированных систем.

   Разделы страницы:
   - сводка за период (сессии, люди/боты, просмотры, клики, события);
   - популярные подарки (просмотры карточек, «в корзину», обложка, цена);
   - страницы витрины (просмотры, средний доскролл, среднее время);
   - источники заходов (referrer по доменам);
   - посетители: сессии с фильтром все/люди/боты/заблокированные,
     таймлайн визита, блокировка/разблокировка IP;
   - боты и краулеры на публичных API.

   Данные: GET /api/admin/analytics/* (просмотр — все роли),
   блокировка/разблокировка — редактор+, очистка — супер-админ.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";

interface Period {
  sessions: number;
  humans: number;
  bots: number;
  suspected: number;
  views: number;
  events: number;
  pageviews: number;
  clicks: number;
  gift_views: number;
  cart_adds: number;
}
interface Today {
  sessions: number;
  views: number;
  events: number;
}
interface GiftRow {
  slug: string;
  name: string;
  views: number;
  cart_adds: number;
  sessions: number;
  price_kopecks: number | null;
  cover: string | null;
}
interface PageRow {
  path: string;
  views: number;
  scroll: number | null;
  time: number | null;
}
interface SourceRow {
  source: string;
  sessions: number;
}
interface SessionRow {
  id: number;
  sid: string;
  ip_hash: string;
  ip_mask: string;
  user_agent: string;
  is_bot: number;
  bot_reason: string;
  blocked: number;
  referrer: string;
  landing: string;
  screen: string;
  views: number;
  events: number;
  first_seen: string;
  last_seen: string;
  /* Task 134: отпечаток и ввод */
  bot_score: number;
  webdriver: number;
  mouse_moves: number;
  touches: number;
  key_downs: number;
  no_input: number;
  accept_lang: number;
  fp: string;
}
interface BotRow {
  ua: string;
  ip_hash: string;
  ip_mask: string;
  hits: number;
  paths: number;
  last_seen: string;
}
interface BlockRow {
  ip_hash: string;
  ip_mask: string;
  reason: string;
  created_at: string;
}
interface TimelineEvent {
  type: string;
  path: string;
  gift_slug: string;
  gift_name: string;
  meta: Record<string, string | number>;
  created_at: string;
}

interface Summary {
  days: number;
  period: Period;
  today: Today;
  blocked_ips: number;
  gifts: GiftRow[];
  pages: PageRow[];
  sources: SourceRow[];
}

const EVENT_LABELS: Record<string, string> = {
  pageview: "Страница",
  click: "Клик",
  scroll: "Скролл",
  gift_view: "Открыл подарок",
  cart_add: "В корзину",
  leave: "Ушёл со страницы",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("ru-RU");
}

function fmtPrice(kopecks: number | null): string {
  if (kopecks == null) return "—";
  return `${Math.round(kopecks / 100).toLocaleString("ru-RU")} ₽`;
}

function shortUa(ua: string, max = 60): string {
  const one = ua.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

function hostOf(ref: string): string {
  if (!ref) return "";
  try {
    return new URL(ref).host;
  } catch {
    return ref.slice(0, 40);
  }
}

/** Человек с высоким баллом «похожести на бота» (Task 134). */
const SUSPICION_THRESHOLD = 30;

/** Отпечаток сессии (fp — JSON-строка от бэкенда) для модалки таймлайна. */
interface Fingerprint {
  wd: number;
  chrome: number;
  plugins: number;
  langs: number;
  tz: string;
  touch: number;
  al: number;
}

function parseFp(fp: string): Fingerprint | null {
  if (!fp) return null;
  try {
    const j = JSON.parse(fp) as Partial<Fingerprint>;
    return {
      wd: Number(j.wd ?? 0),
      chrome: Number(j.chrome ?? 0),
      plugins: Number(j.plugins ?? 0),
      langs: Number(j.langs ?? 0),
      tz: String(j.tz ?? ""),
      touch: Number(j.touch ?? 0),
      al: Number(j.al ?? 0),
    };
  } catch {
    return null;
  }
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      data-testid="analytics-card"
      className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--color-heading)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>}
    </div>
  );
}

const TYPE_BADGE: Record<string, string> = {
  pageview: "bg-blue-100 text-blue-800",
  click: "bg-amber-100 text-amber-800",
  scroll: "bg-teal-100 text-teal-800",
  gift_view: "bg-fuchsia-100 text-fuchsia-800",
  cart_add: "bg-green-100 text-green-800",
  leave: "bg-gray-100 text-gray-700",
};

export default function AdminAnalyticsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [bots, setBots] = useState<BotRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [sessionFilter, setSessionFilter] = useState<"all" | "human" | "bot" | "blocked">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuper, setIsSuper] = useState(false);

  /* Таймлайн визита */
  const [timelineSession, setTimelineSession] = useState<SessionRow | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[] | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, sesRes, bRes, blRes] = await Promise.all([
        fetch(`${apiUrl}/admin/analytics/summary?days=${days}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`${apiUrl}/admin/analytics/sessions?days=${days}&bot=${sessionFilter}&limit=60`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`${apiUrl}/admin/analytics/bots?days=${days}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`${apiUrl}/admin/analytics/blocks`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (!sRes.ok) {
        const j = await sRes.json().catch(() => ({}));
        throw new Error(j.error ?? `Ошибка ${sRes.status}`);
      }
      const sJson = await sRes.json();
      setSummary(sJson.data as Summary);
      if (sesRes.ok) setSessions(((await sesRes.json()).data?.items ?? []) as SessionRow[]);
      if (bRes.ok) setBots(((await bRes.json()).data?.items ?? []) as BotRow[]);
      if (blRes.ok) setBlocks(((await blRes.json()).data?.items ?? []) as BlockRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить аналитику");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, days, sessionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Роль — для кнопки очистки */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/me`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        setIsSuper(res.ok && json.data?.role === "super_admin");
      } catch {
        setIsSuper(false);
      }
    })();
  }, [apiUrl]);

  async function openTimeline(s: SessionRow) {
    setTimelineSession(s);
    setTimeline(null);
    setTimelineLoading(true);
    try {
      const res = await fetch(`${apiUrl}/admin/analytics/sessions/${s.id}/events?limit=300`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setTimeline((json.data?.items ?? []) as TimelineEvent[]);
      } else {
        setTimeline([]);
      }
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  async function toggleBlock(s: { ip_hash: string; ip_mask: string; blocked: number | null }) {
    const action = s.blocked ? "unblock" : "block";
    const confirmText = s.blocked
      ? `Разблокировать IP ${s.ip_mask}?`
      : `Заблокировать IP ${s.ip_mask}? Витрина и API перестанут отвечать этому адресу.`;
    if (!window.confirm(confirmText)) return;
    try {
      const res = await fetch(`${apiUrl}/admin/analytics/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip_hash: s.ip_hash, ip_mask: s.ip_mask }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error ?? "Не удалось выполнить");
        return;
      }
      await load();
    } catch {
      window.alert("Сеть недоступна");
    }
  }

  async function blockBot(b: BotRow) {
    if (!window.confirm(`Заблокировать IP ${b.ip_mask} (${shortUa(b.ua, 40)})?`)) return;
    try {
      const res = await fetch(`${apiUrl}/admin/analytics/block`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip_hash: b.ip_hash, ip_mask: b.ip_mask, reason: "Бот/краулер" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error ?? "Не удалось выполнить");
        return;
      }
      await load();
    } catch {
      window.alert("Сеть недоступна");
    }
  }

  async function wipeAnalytics() {
    if (
      !window.confirm(
        "Удалить ВСЮ аналитику (события, сессии, боты)? Блок-лист IP сохранится. Отменить будет нельзя."
      )
    )
      return;
    try {
      const res = await fetch(`${apiUrl}/admin/analytics/wipe`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error ?? "Не удалось выполнить");
        return;
      }
      await load();
    } catch {
      window.alert("Сеть недоступна");
    }
  }

  const p = summary?.period;

  return (
    <div data-testid="analytics-page" className="space-y-6">
      {/* Шапка */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-heading)]">Аналитика</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            Посещения витрины, поведение покупателей, боты и защита
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex overflow-hidden rounded-[10px] border border-[var(--color-border)]"
            data-testid="analytics-period"
          >
            {[1, 3, 7, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  days === d
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card)] text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
                }`}
              >
                {d === 1 ? "Сегодня" : `${d} дн.`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-sm text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
          >
            ⟳ Обновить
          </button>
          {isSuper && (
            <button
              type="button"
              onClick={() => void wipeAnalytics()}
              data-testid="analytics-wipe"
              className="rounded-[10px] border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Очистить аналитику
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-[14px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && !summary && (
        <p className="animate-pulse text-sm text-[var(--color-muted)]">Загружаем аналитику…</p>
      )}

      {summary && p && (
        <>
          {/* Сводка */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card
              label="Сессии"
              value={fmtNum(p.sessions)}
              hint={`сегодня: ${fmtNum(summary.today.sessions)}`}
            />
            <Card
              label="Люди"
              value={fmtNum(p.humans)}
              hint={`подозрительных: ${fmtNum(p.suspected ?? 0)}`}
            />
            <Card label="Боты" value={fmtNum(p.bots)} hint="краулеры и скрипты" />
            <Card
              label="Просмотры страниц"
              value={fmtNum(p.pageviews)}
              hint={`сегодня: ${fmtNum(summary.today.views)}`}
            />
            <Card label="Просмотры подарков" value={fmtNum(p.gift_views)} hint={`в корзину: ${fmtNum(p.cart_adds)}`} />
            <Card
              label="Клики"
              value={fmtNum(p.clicks)}
              hint={`всего событий: ${fmtNum(p.events)}`}
            />
          </div>

          {/* Популярные подарки */}
          <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)]">
            <header className="border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-[15px] font-semibold text-[var(--color-heading)]">
                Популярные подарки
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Открытия карточек, уникальные посетители и добавления в корзину
              </p>
            </header>
            {summary.gifts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--color-muted)]">
                Пока нет просмотров подарков за выбранный период.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table data-testid="analytics-gifts" className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                      <th className="px-4 py-2 font-medium">Подарок</th>
                      <th className="px-4 py-2 text-right font-medium">Просмотры</th>
                      <th className="px-4 py-2 text-right font-medium">Посетители</th>
                      <th className="px-4 py-2 text-right font-medium">В корзину</th>
                      <th className="px-4 py-2 text-right font-medium">Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.gifts.map((g) => (
                      <tr key={g.slug} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            {g.cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={g.cover}
                                alt=""
                                className="h-10 w-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-bg-soft)] text-base">
                                🎁
                              </div>
                            )}
                            <span className="font-medium text-[var(--color-heading)]">
                              {g.name || g.slug}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{fmtNum(g.views)}</td>
                        <td className="px-4 py-2 text-right">{fmtNum(g.sessions)}</td>
                        <td className="px-4 py-2 text-right">
                          {g.cart_adds > 0 ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              {fmtNum(g.cart_adds)}
                            </span>
                          ) : (
                            <span className="text-[var(--color-muted)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-[var(--color-body)]">
                          {fmtPrice(g.price_kopecks)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Страницы + источники */}
          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] lg:col-span-2">
              <header className="border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-[15px] font-semibold text-[var(--color-heading)]">
                  Страницы витрины
                </h2>
                <p className="text-xs text-[var(--color-muted)]">
                  Просмотры, средний доскролл и среднее время на странице
                </p>
              </header>
              {summary.pages.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--color-muted)]">
                  Пока нет данных о страницах.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table data-testid="analytics-pages" className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                        <th className="px-4 py-2 font-medium">Страница</th>
                        <th className="px-4 py-2 text-right font-medium">Просмотры</th>
                        <th className="px-4 py-2 text-right font-medium">Доскролл</th>
                        <th className="px-4 py-2 text-right font-medium">Время</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.pages.map((pg) => (
                        <tr key={pg.path} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="max-w-[280px] truncate px-4 py-2 font-mono text-[13px]" title={pg.path}>
                            {pg.path}
                          </td>
                          <td className="px-4 py-2 text-right">{fmtNum(pg.views)}</td>
                          <td className="px-4 py-2 text-right">
                            {pg.scroll != null ? `${pg.scroll}%` : "—"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {pg.time != null ? `${pg.time} с` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)]">
              <header className="border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-[15px] font-semibold text-[var(--color-heading)]">
                  Откуда приходят
                </h2>
                <p className="text-xs text-[var(--color-muted)]">Источники заходов</p>
              </header>
              {summary.sources.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--color-muted)]">Нет данных.</p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {summary.sources.map((s) => (
                    <li key={s.source} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="truncate text-[var(--color-body)]" title={s.source}>
                        {s.source}
                      </span>
                      <span className="ml-3 shrink-0 font-medium text-[var(--color-heading)]">
                        {fmtNum(s.sessions)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {/* Посетители */}
      <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)]">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-heading)]">Посетители</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Сессии за период: откуда, сколько страниц, бот или человек
            </p>
          </div>
          <div
            className="flex overflow-hidden rounded-[10px] border border-[var(--color-border)] text-sm"
            data-testid="analytics-session-filter"
          >
            {(
              [
                ["all", "Все"],
                ["human", "Люди"],
                ["bot", "Боты"],
                ["blocked", "Заблокированные"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSessionFilter(key)}
                className={`px-3 py-1.5 transition-colors ${
                  sessionFilter === key
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-card)] text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--color-muted)]">Сессий нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="analytics-sessions" className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                  <th className="px-4 py-2 font-medium">Активность</th>
                  <th className="px-4 py-2 font-medium">IP</th>
                  <th className="px-4 py-2 font-medium">User-Agent</th>
                  <th className="px-4 py-2 font-medium">Источник</th>
                  <th className="px-4 py-2 text-right font-medium">Стр.</th>
                  <th className="px-4 py-2 text-right font-medium">Событий</th>
                  <th className="px-4 py-2 font-medium">Статус</th>
                  <th className="px-4 py-2 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-[13px]">{fmtTime(s.last_seen)}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[13px]">{s.ip_mask || "—"}</td>
                    <td className="max-w-[220px] truncate px-4 py-2 text-[13px] text-[var(--color-muted)]" title={s.user_agent}>
                      {shortUa(s.user_agent, 46) || "—"}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2 text-[13px]">
                      {s.referrer ? hostOf(s.referrer) : <span className="text-[var(--color-muted)]">прямой</span>}
                    </td>
                    <td className="px-4 py-2 text-right">{s.views}</td>
                    <td className="px-4 py-2 text-right">{s.events}</td>
                    <td className="px-4 py-2">
                      {s.blocked === 1 ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Заблокирован
                        </span>
                      ) : s.is_bot === 1 ? (
                        <span
                          className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800"
                          title={s.bot_reason}
                        >
                          Бот
                          {s.bot_reason === "behavior"
                            ? " (поведение)"
                            : s.bot_reason.startsWith("fp:")
                              ? " (отпечаток)"
                              : ""}
                        </span>
                      ) : (s.bot_score ?? 0) >= SUSPICION_THRESHOLD ? (
                        <span
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                          title={`Балл похожести на бота: ${s.bot_score}`}
                        >
                          Подозрение {s.bot_score}
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Человек
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void openTimeline(s)}
                        className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-bg-soft)]"
                        title="Показать визит по шагам"
                      >
                        🧭 Визит
                      </button>{" "}
                      <button
                        type="button"
                        onClick={() => void toggleBlock(s)}
                        className={`rounded-lg border px-2 py-1 text-xs ${
                          s.blocked === 1
                            ? "border-green-200 text-green-700 hover:bg-green-50"
                            : "border-red-200 text-red-600 hover:bg-red-50"
                        }`}
                      >
                        {s.blocked === 1 ? "✅ Разблокировать" : "⛔ Блокировать"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Боты и краулеры */}
      <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)]">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-heading)]">
              Боты и краулеры
            </h2>
            <p className="text-xs text-[var(--color-muted)]">
              Автоматизированные запросы к публичным API (по User-Agent)
            </p>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Заблокированных адресов: {summary?.blocked_ips ?? 0}
          </p>
        </header>
        {bots.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--color-muted)]">
            Автоматизированных запросов не зафиксировано.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="analytics-bots" className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                  <th className="px-4 py-2 font-medium">User-Agent</th>
                  <th className="px-4 py-2 font-medium">IP</th>
                  <th className="px-4 py-2 text-right font-medium">Запросов</th>
                  <th className="px-4 py-2 text-right font-medium">Маршрутов</th>
                  <th className="px-4 py-2 font-medium">Последний</th>
                  <th className="px-4 py-2 text-right font-medium">Действие</th>
                </tr>
              </thead>
              <tbody>
                {bots.map((b) => (
                  <tr
                    key={`${b.ip_hash}-${b.ua}`}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="max-w-[260px] truncate px-4 py-2 font-mono text-[13px]" title={b.ua}>
                      {shortUa(b.ua, 60)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[13px]">{b.ip_mask}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(b.hits)}</td>
                    <td className="px-4 py-2 text-right">{b.paths}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-[13px]">{fmtTime(b.last_seen)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void blockBot(b)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        ⛔ Блокировать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {blocks.length > 0 && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <h3 className="text-[13px] font-semibold text-[var(--color-heading)]">
              Блок-лист IP
            </h3>
            <ul className="mt-2 space-y-1" data-testid="analytics-blocks">
              {blocks.map((b) => (
                <li key={b.ip_hash} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="font-mono">{b.ip_mask || b.ip_hash.slice(0, 12) + "…"}</span>
                  <span className="truncate text-[var(--color-muted)]">{b.reason}</span>
                  <button
                    type="button"
                    onClick={() =>
                      void toggleBlock({ ip_hash: b.ip_hash, ip_mask: b.ip_mask, blocked: 1 })
                    }
                    className="shrink-0 rounded-lg border border-green-200 px-2 py-0.5 text-xs text-green-700 hover:bg-green-50"
                  >
                    ✅ Разблокировать
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Таймлайн визита (модалка) */}
      {timelineSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setTimelineSession(null)}
          role="presentation"
        >
          <div
            data-testid="analytics-timeline"
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-[14px] bg-[var(--color-card)] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--color-heading)]">
                  Визит · {timelineSession.ip_mask || "IP скрыт"}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  {fmtTime(timelineSession.first_seen)} → {fmtTime(timelineSession.last_seen)} ·
                  страниц: {timelineSession.views} · событий: {timelineSession.events} ·{" "}
                  {timelineSession.is_bot === 1
                    ? `бот${timelineSession.bot_reason ? ` (${timelineSession.bot_reason})` : ""}`
                    : (timelineSession.bot_score ?? 0) >= SUSPICION_THRESHOLD
                      ? `подозрение (${timelineSession.bot_score})`
                      : "человек"}
                </p>
                {timelineSession.user_agent && (
                  <p className="mt-1 max-w-xl break-all text-[11px] text-[var(--color-muted)]">
                    {timelineSession.user_agent}
                  </p>
                )}
                {(() => {
                  const fp = parseFp(timelineSession.fp);
                  if (!fp) return null;
                  return (
                    <p
                      data-testid="analytics-fp"
                      className="mt-1 rounded-lg bg-[var(--color-bg-soft)] px-2 py-1 text-[11px] text-[var(--color-muted)]"
                    >
                      Отпечаток: webdriver: {fp.wd === 1 ? "да" : "нет"} · Chrome-объект:{" "}
                      {fp.chrome === 1 ? "есть" : "нет"} · плагинов: {fp.plugins} · языков:{" "}
                      {fp.langs} · тач: {fp.touch === 1 ? "да" : "нет"} · мышь:{" "}
                      {timelineSession.mouse_moves ?? 0} · касания: {timelineSession.touches ?? 0} ·
                      клавиатура: {timelineSession.key_downs ?? 0} · Accept-Language:{" "}
                      {fp.al === 1 ? "есть" : "нет"}
                      {fp.tz ? ` · ${fp.tz}` : ""}
                    </p>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => setTimelineSession(null)}
                className="rounded-lg px-2 py-1 text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg-soft)]"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            {timelineLoading && (
              <p className="animate-pulse text-sm text-[var(--color-muted)]">Загружаем…</p>
            )}
            {timeline && timeline.length === 0 && (
              <p className="text-sm text-[var(--color-muted)]">Событий не записано.</p>
            )}
            {timeline && timeline.length > 0 && (
              <ol className="space-y-1.5">
                {timeline.map((ev, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg bg-[var(--color-bg-soft)] px-3 py-2 text-[13px]"
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        TYPE_BADGE[ev.type] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {EVENT_LABELS[ev.type] ?? ev.type}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--color-body)]">
                        {ev.path}
                        {ev.gift_name ? ` · ${ev.gift_name}` : ""}
                      </span>
                      {ev.meta && Object.keys(ev.meta).length > 0 && (
                        <span className="block truncate text-[11px] text-[var(--color-muted)]">
                          {Object.entries(ev.meta)
                            .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
                            .join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--color-muted)]">
                      {fmtTime(ev.created_at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
