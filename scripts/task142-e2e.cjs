/* Task 142 E2E: редизайн счётчика «До Нового года» — хрониометр
 * (дни/часы/минуты/секунды) под hero с гирляндой и снегом.
 * A) Блок на главной: 4 карточки, живое тиканье секунд, значения
 *    совпадают с часами посетителя; надпись «До Нового года».
 * B) Галочка в настройках: выключение через админ-API убирает блок
 *    по F5 (живые настройки), включение возвращает.
 * C) Мобильный 390: карточки помещаются, горизонтального скролла нет.
 * D) Консоль браузера чиста (кроме штатного 401-зонда AdminToolbar).
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8097";
const ADMIN = { email: "admin@lakomka.local", password: "Lakomka2026!" };

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  OK  " + m); };
const bad = (m) => { fail++; console.log("  FAIL " + m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    /* Чистый Chrome-UA: headless-UA сам ловится бото-детектором (task139) */
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const api = async (path, opts = {}) =>
    page.evaluate(
      ({ path, opts }) =>
        fetch(path, { cache: "no-store", ...opts }).then(async (r) => ({
          status: r.status,
          json: await r.json().catch(() => null),
        })),
      { path, opts }
    );

  /* ── A. Хрониометр на главной ── */
  console.log("── A. Хрониометр «До Нового года» под hero ──");
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1500); // гидратация + живые настройки + первый тик
  const a = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="newyear-counter"]');
    if (!el) return null;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    const nums = [...el.querySelectorAll(".ny-num")].map(
      (n) => (n.textContent || "").trim()
    );
    const caps = [...el.querySelectorAll(".ny-cap")].map(
      (c) => (c.textContent || "").trim()
    );
    const rect = el.getBoundingClientRect();
    const hero = document.querySelector('section[aria-label="Новогодняя коллекция 2027"]');
    return {
      text,
      nums,
      caps,
      cards: el.querySelectorAll(".ny-card").length,
      bulbs: el.querySelectorAll(".ny-bulb").length,
      flakes: el.querySelectorAll(".ny-flake").length,
      visible: rect.height > 60,
      afterHero: hero ? rect.top >= hero.getBoundingClientRect().bottom - 60 : null,
      sr: el.querySelector(".sr-only")?.textContent || "",
    };
  });
  if (!a) bad("счётчик не найден на главной");
  else {
    a.cards === 4 ? ok(`4 карточки хронометра (числа ${a.nums.join(":")})`) : bad(`карточек ${a.cards}, ожидалось 4`);
    a.caps.join(",") === "день,час,минута,секунда" || /дн|час|мин|сек/.test(a.caps.join(","))
      ? ok(`подписи карточек: ${a.caps.join(" / ")}`)
      : bad(`подписи карточек странные: ${a.caps.join(",")}`);
    /До Нового года/i.test(a.text) ? ok("надпись «До Нового года» на месте") : bad("надписи нет");
    /осталось\s+\d+\s+(день|дня|дней)/i.test(a.sr)
      ? ok(`sr-only фраза для скрин-ридеров: «${a.sr.trim()}»`)
      : bad(`sr-only фраза без числа/плюрализации: «${a.sr.trim()}»`);
    a.bulbs >= 7 ? ok(`гирлянда: ${a.bulbs} огоньков`) : bad(`огоньков ${a.bulbs}`);
    a.flakes >= 4 ? ok(`снежинки: ${a.flakes} шт.`) : bad(`снежинок ${a.flakes}`);
    a.visible ? ok("блок отрисован с нормальной высотой") : bad("блок схлопнулся");
    a.afterHero ? ok("блок сразу под hero") : bad(`блок не под hero (afterHero=${a.afterHero})`);

    /* Значения совпадают с часами посетителя (±2 c на дрейф между тиками) */
    const live = await page.evaluate(() => {
      const now = new Date();
      const ny = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
      const diff = Math.max(0, ny - now);
      const d = Math.floor(diff / 86400000),
        h = Math.floor(diff / 3600000) % 24,
        m = Math.floor(diff / 60000) % 60,
        s = Math.floor(diff / 1000) % 60;
      return {
        d, h, m, s,
        dom: [...document.querySelectorAll('[data-testid="newyear-counter"] .ny-num')].map(
          (n) => (n.textContent || "").trim()
        ),
      };
    });
    const pad = (x) => String(x).padStart(2, "0");
    const expect = [String(live.d), pad(live.h), pad(live.m), pad(live.s)];
    const driftOk =
      Math.abs(parseInt(live.dom[0], 10) - live.d) <= 1 &&
      Math.abs(parseInt(live.dom[1], 10) - live.h) <= 1 &&
      Math.abs(parseInt(live.dom[2], 10) - live.m) <= 1 &&
      Math.abs(parseInt(live.dom[3], 10) - live.s) <= 2;
    driftOk
      ? ok(`значения совпадают с часами посетителя: DOM ${live.dom.join(":")} ≈ ${expect.join(":")}`)
      : bad(`значения разошлись с часами: DOM ${live.dom.join(":")} vs ${expect.join(":")}`);

    /* Живое тиканье: через 1.6 с секунды обязаны измениться */
    const s1 = parseInt(live.dom[3], 10);
    await page.waitForTimeout(1600);
    const s2 = await page.evaluate(() =>
      parseInt(
        (document.querySelector('[data-testid="newyear-counter"] .ny-card-sec .ny-num')?.textContent || "0").trim(),
        10
      )
    );
    s1 !== s2 || (s1 === 0 && s2 <= 2)
      ? ok(`секунды тикают: ${s1} → ${s2}`)
      : bad(`секунды не тикают: ${s1} → ${s2}`);
  }

  /* ── B. Галочка в настройках ── */
  console.log("── B. Выключение/включение галочкой в админке ──");
  const login = await api("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  });
  const token = login.json?.data?.token || "";
  if (login.status !== 200 || !token) {
    bad(`админ-логин не прошёл (${login.status})`);
  } else {
    const set = async (v) =>
      api("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newyear_counter_enabled: v ? "1" : "0" }),
      });
    await set(false);
    const pubOff = await api("/api/settings/public");
    pubOff.json?.data?.newyear_counter_enabled === false
      ? ok("настройки: newyear_counter_enabled=false отдался публично")
      : bad("выключение не применилось в настройках");
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1200);
    const gone = await page.evaluate(
      () => !document.querySelector('[data-testid="newyear-counter"]')
    );
    gone ? ok("после выключения и F5 блок исчез") : bad("блок остался после выключения");
    await set(true);
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1200);
    const back = await page.evaluate(
      () => !!document.querySelector('[data-testid="newyear-counter"]')
    );
    back ? ok("после включения и F5 блок вернулся") : bad("блок не вернулся после включения");
  }

  /* ── C. Мобильный 390 ── */
  console.log("── C. Мобильный 390: без горизонтали, карточки помещаются ──");
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 744 });
  await mob.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await mob.waitForTimeout(1200);
  const c = await mob.evaluate(() => {
    const el = document.querySelector('[data-testid="newyear-counter"]');
    const card = el?.querySelector(".ny-card");
    const bulbVisible = el
      ? [...el.querySelectorAll(".ny-bulb")].filter((b) => b.offsetParent !== null).length
      : 0;
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
      numFont: card ? getComputedStyle(card.querySelector(".ny-num")).fontSize : "",
      bulbVisible,
      h: el ? Math.round(el.getBoundingClientRect().height) : 0,
    };
  });
  c.overflow <= 1 ? ok(`горизонтального скролла нет (+${c.overflow}px)`) : bad(`горизонтальный скролл +${c.overflow}px`);
  c.cardW >= 70 && c.cardW <= 100 ? ok(`карточка ${c.cardW}px — цифры и подписи помещаются`) : bad(`карточка ${c.cardW}px подозрительная`);
  c.numFont ? ok(`размер цифр на телефоне: ${c.numFont}`) : bad("цифры не найдены на телефоне");
  c.bulbVisible === 7 ? ok(`на телефоне видно 7 огоньков гирлянды (из 12)`) : bad(`огоньков на телефоне ${c.bulbVisible}, ожидалось 7`);
  c.h >= 140 && c.h <= 400 ? ok(`высота блока на телефоне ${c.h}px`) : bad(`высота блока ${c.h}px странная`);
  await mob.close();

  /* ── D. Консоль ── */
  console.log("── D. Консоль браузера ──");
  const real = consoleErrors.filter((e) => !/401|Failed to load resource.*401/.test(e));
  real.length === 0
    ? ok("консоль чиста (штатный 401-зонд AdminToolbar отфильтрован)")
    : bad(`ошибки консоли: ${real.slice(0, 3).join(" | ")}`);

  await browser.close();
  console.log(`\nИТОГО: PASS=${pass} FAIL=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(2);
});
