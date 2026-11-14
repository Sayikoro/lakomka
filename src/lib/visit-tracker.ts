/* ============================================================
   Task 133: собственный трекер посещений витрины.

   Что собирает (только витрина, админка не отслеживается):
   - pageview — переход по каждой странице (смена route Next.js);
   - scroll  — максимальный доскролл страницы в % (при уходе со страницы);
   - leave   — время на странице в секундах (при уходе);
   - click   — клики по ссылкам/кнопкам (тег, текст ≤ 80, href ≤ 200);
   - gift_view — открытие карточки подарка (slug + название);
   - cart_add — добавление подарка в корзину.

   Всё уходит батчем на POST /api/analytics/collect раз в 6 секунд
   и при закрытии/скрытии вкладки (sendBeacon). Никаких куки и
   персональных данных: только локальный случайный sid в localStorage.

   Task 134 (бот-детект v2): вместе с батчем уходят env — обезличенный
   отпечаток браузера (navigator.webdriver, наличие window.chrome,
   число плагинов/языков, тач, часовой пояс) и sig — счётчики
   человеческого ввода (движения мыши, касания, нажатия клавиш).
   Сервер по ним отличает ИИ-агентов с обычным Chrome-UA от людей.
   ============================================================ */

type VisitEventType = "pageview" | "click" | "scroll" | "gift_view" | "cart_add" | "leave" | "gift_share";

export interface VisitEvent {
  t: VisitEventType;
  path: string;
  gs?: string; // gift slug
  gn?: string; // gift name
  m?: Record<string, string | number>;
}

interface VisitEnv {
  wd: number; // navigator.webdriver — флаг автоматизации
  chrome: number; // есть ли window.chrome (сверяется с UA на сервере)
  plugins: number;
  langs: number;
  tz: string;
  touch: number; // тач-устройство (maxTouchPoints > 0)
}

interface VisitSig {
  mm: number; // движения мыши
  ts: number; // касания
  kd: number; // нажатия клавиш
}

interface FlushPayload {
  sid: string;
  screen: string;
  ref: string;
  land: string;
  env?: VisitEnv;
  sig?: VisitSig;
  events: VisitEvent[];
}

const SID_KEY = "lk_sid";
const SID_TS_KEY = "lk_sid_ts";
const REF_KEY = "lk_ref";
const LAND_KEY = "lk_land";

/** Новая сессия после 30 минут неактивности. */
const SESSION_IDLE_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 6000;
const QUEUE_LIMIT = 400;

let queue: VisitEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let currentPath = "";
let pathStartedAt = 0;
let maxScrollPct = 0;
let scrollAttached = false;
const lastGiftViewAt = new Map<string, number>();

/* Task 134: отпечаток (снимается один раз при инициализации) и
   накопленные счётчики ввода (растут всю сессию, сервер берёт максимум). */
let envSnapshot: VisitEnv | null = null;
const sigCounters: VisitSig = { mm: 0, ts: 0, kd: 0 };

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "/api";
}

function newSid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

interface SessionInfo {
  sid: string;
  ref: string;
  land: string;
}

function refreshSession(): SessionInfo {
  const now = Date.now();
  let sid = "";
  try {
    sid = localStorage.getItem(SID_KEY) ?? "";
    const ts = Number(localStorage.getItem(SID_TS_KEY) ?? "0");
    if (!sid || !ts || now - ts > SESSION_IDLE_MS) {
      sid = newSid();
      localStorage.setItem(SID_KEY, sid);
      localStorage.setItem(SID_TS_KEY, String(now));
      /* Новая сессия: запоминаем первый источник и посадочную страницу */
      const ref = (document.referrer ?? "").slice(0, 300);
      const land = location.pathname.slice(0, 300);
      localStorage.setItem(REF_KEY, ref);
      localStorage.setItem(LAND_KEY, land);
    } else {
      localStorage.setItem(SID_TS_KEY, String(now));
    }
  } catch {
    sid = sid || newSid();
  }
  let ref = "";
  let land = "";
  try {
    ref = localStorage.getItem(REF_KEY) ?? "";
    land = localStorage.getItem(LAND_KEY) ?? "";
  } catch {
    /* приватный режим без localStorage — аналитика без источника */
  }
  return { sid, ref, land };
}

function push(ev: VisitEvent): void {
  if (typeof window === "undefined") return;
  queue.push(ev);
  if (queue.length > QUEUE_LIMIT) {
    queue = queue.slice(-QUEUE_LIMIT);
  }
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

/** Обезличенный отпечаток браузера для бот-детекта (Task 134). */
function collectEnv(): VisitEnv | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  try {
    const nav = navigator as Navigator & { webdriver?: boolean; maxTouchPoints?: number };
    const plugins = nav.plugins ? nav.plugins.length : 0;
    const langs = nav.languages ? nav.languages.length : 0;
    const tz =
      typeof Intl !== "undefined"
        ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "")
        : "";
    return {
      wd: nav.webdriver === true ? 1 : 0,
      chrome: (window as unknown as { chrome?: unknown }).chrome !== undefined ? 1 : 0,
      plugins,
      langs,
      tz: tz.slice(0, 40),
      touch: (nav.maxTouchPoints ?? 0) > 0 ? 1 : 0,
    };
  } catch {
    return null;
  }
}

function buildPayload(events: VisitEvent[]): FlushPayload | null {
  if (typeof window === "undefined") return null;
  const { sid, ref, land } = refreshSession();
  const payload: FlushPayload = {
    sid,
    ref,
    land,
    screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    events,
  };
  if (envSnapshot) {
    payload.env = envSnapshot;
    payload.sig = { ...sigCounters };
  }
  return payload;
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  const payload = buildPayload(events);
  if (!payload) return;
  try {
    await fetch(`${apiBase()}/analytics/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    /* аналитика не должна влиять на работу витрины */
  }
}

function flushOnHide(): void {
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  const payload = buildPayload(events);
  if (!payload) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(`${apiBase()}/analytics/collect`, blob);
    }
  } catch {
    /* тихо: вкладка закрывается */
  }
}

/* ---------- скролл текущей страницы ---------- */

function onScroll(): void {
  const doc = document.documentElement;
  const total = doc.scrollHeight - window.innerHeight;
  if (total <= 0) {
    maxScrollPct = 100;
    return;
  }
  const pct = Math.round((Math.max(window.scrollY, 0) / total) * 100);
  if (pct > maxScrollPct) {
    maxScrollPct = Math.min(pct, 100);
  }
}

/* ---------- клики по витрине ---------- */

function onClickCapture(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target || typeof target.closest !== "function") return;
  const el = target.closest("a,button,[role='button']");
  if (!el) return;
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const m: Record<string, string | number> = { tag, text };
  if (tag === "a") {
    const href = el.getAttribute("href") ?? "";
    if (href) m.href = href.slice(0, 200);
  }
  push({ t: "click", path: currentPath || location.pathname, m });
}

/* ---------- человеческий ввод для бот-детекта (Task 134) ---------- */

function onInputSignal(kind: keyof VisitSig): void {
  sigCounters[kind] = Math.min(sigCounters[kind] + 1, 100000);
}

/* ---------- публичное API ---------- */

/** Инициализация: сессия, слушатели кликов, ввода и закрытия вкладки. */
export function initTracker(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  envSnapshot = collectEnv();
  refreshSession();
  document.addEventListener("click", onClickCapture, { capture: true });
  window.addEventListener("pagehide", flushOnHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnHide();
  });
  /* Человеческий ввод: только счётчики, без координат и содержимого. */
  window.addEventListener("mousemove", () => onInputSignal("mm"), { passive: true });
  window.addEventListener("touchstart", () => onInputSignal("ts"), { passive: true });
  window.addEventListener("keydown", () => onInputSignal("kd"), { capture: true });
}

/**
 * Смена маршрута: отправить доскролл и время предыдущей страницы,
 * затем pageview новой. Вызывается из VisitTracker.
 */
export function onRouteChange(path: string): void {
  if (typeof window === "undefined") return;
  if (currentPath === path) return;

  /* Уход с предыдущей страницы */
  if (currentPath) {
    if (maxScrollPct >= 5) {
      push({ t: "scroll", path: currentPath, m: { pct: maxScrollPct } });
    }
    const sec = Math.round((Date.now() - pathStartedAt) / 1000);
    if (sec >= 3 && sec <= 3600) {
      push({ t: "leave", path: currentPath, m: { sec } });
    }
  }

  currentPath = path;
  pathStartedAt = Date.now();
  maxScrollPct = 0;
  push({ t: "pageview", path });

  if (!scrollAttached) {
    scrollAttached = true;
    window.addEventListener("scroll", onScroll, { passive: true });
  }
}

/** Открытие карточки подарка (не чаще раза в минуту на slug). */
export function trackGiftView(slug: string, name: string): void {
  if (typeof window === "undefined" || !slug) return;
  const now = Date.now();
  const last = lastGiftViewAt.get(slug) ?? 0;
  if (now - last < 60_000) return;
  lastGiftViewAt.set(slug, now);
  push({
    t: "gift_view",
    path: currentPath || `/product/${slug}`,
    gs: slug.slice(0, 200),
    gn: name.slice(0, 200),
  });
}

/** Добавление подарка в корзину. */
export function trackCartAdd(slug: string, name: string): void {
  if (typeof window === "undefined" || !slug) return;
  push({
    t: "cart_add",
    path: currentPath || location.pathname,
    gs: slug.slice(0, 200),
    gn: name.slice(0, 200),
  });
}

/**
 * Task 141: нажатие «Поделиться» в карточке товара.
 * channel: native (системный шаринг телефона) | telegram | whatsapp | vk | copy.
 * Событие не чаще раза в минуту на slug+channel — чтобы «поделиться»
 * одним подарком пять раз подряд не считалось пятью визитами.
 */
export function trackGiftShare(
  slug: string,
  name: string,
  channel: string,
): void {
  if (typeof window === "undefined" || !slug) return;
  const key = `${slug}:${channel}`;
  const now = Date.now();
  const last = lastGiftViewAt.get(key) ?? 0;
  if (now - last < 60_000) return;
  lastGiftViewAt.set(key, now);
  push({
    t: "gift_share",
    path: currentPath || `/product/${slug}`,
    gs: slug.slice(0, 200),
    gn: name.slice(0, 200),
    m: { channel },
  });
}
