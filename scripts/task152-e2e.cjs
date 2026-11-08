#!/usr/bin/env node
/* Task 152 E2E: «Состав подарка» сворачивается до 2 рядов на живом стенде.
   Ожидания: ПК lg (≥1024) — 12 карточек, планшет sm (640–1023) — 8,
   телефонный список — 2 позиции; центрированный текст «показать больше»;
   клик раскрывает весь состав (счётчик = bundle_items в API); кнопка
   появляется только когда есть что скрывать; ресайз без перезагрузки
   перестраивает срез; модалка «Подробнее» работает из раскрытого списка. */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8098";
const MANY = process.argv[3];
const FEW = process.argv[4];
let PASS = 0, FAIL = 0;
const ok = (m) => { PASS++; console.log("  OK  " + m); };
const bad = (m) => { FAIL++; console.log("  FAIL " + m); };

/* Состояние блока «Состав подарка» на текущем окне */
async function compState(page) {
  return page.evaluate(() => {
    const tab = [...document.querySelectorAll("button")].find((b) =>
      (b.textContent || "").trim().toLowerCase().startsWith("состав"));
    if (!tab) return null;
    const sec = tab.closest("section");
    if (!sec) return null;
    const ul = [...sec.querySelectorAll("ul")].find((u) => (u.className || "").includes("sm:hidden"));
    const grid = [...sec.querySelectorAll("div")].find((d) => (d.className || "").includes("lg:grid-cols-6"));
    const visibleDetails = [...sec.querySelectorAll("button")].filter(
      (b) => (b.textContent || "").trim() === "Подробнее" && b.offsetParent !== null).length;
    const more = document.querySelector('[data-testid="composition-show-more"]');
    let moreBox = null;
    if (more && more.offsetParent !== null) {
      const r = more.getBoundingClientRect();
      const w = more.parentElement.getBoundingClientRect();
      moreBox = {
        text: (more.textContent || "").trim(),
        textAlign: getComputedStyle(more.parentElement).textAlign,
        dx: Math.abs(r.left + r.width / 2 - (w.left + w.width / 2)),
      };
    }
    return {
      ulRows: ul ? ul.children.length : -1,
      cards: grid ? grid.children.length : -1,
      visibleDetails,
      more: moreBox,
    };
  });
}

async function openProduct(page, slug) {
  await page.goto(`${BASE}/product/${slug}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").trim().toLowerCase().startsWith("состав")),
    null,
    { timeout: 20000 },
  );
  /* Клик по вкладке мог прийтись ДО гидратации (кнопка уже в DOM, слушателя
     ещё нет) — кликаем с ретраями, пока не появится состав */
  let opened = false;
  for (let i = 0; i < 12 && !opened; i++) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        (x.textContent || "").trim().toLowerCase().startsWith("состав"));
      b.click();
    });
    try {
      await page.waitForFunction(
        () => {
          const tab = [...document.querySelectorAll("button")].find((b) =>
            (b.textContent || "").trim().toLowerCase().startsWith("состав"));
          const sec = tab && tab.closest("section");
          return !!sec && [...sec.querySelectorAll("button")]
            .some((b) => (b.textContent || "").trim() === "Подробнее");
        },
        null,
        { timeout: 2500 },
      );
      opened = true;
    } catch {
      /* гидратация ещё не готова — повторить клик */
    }
  }
  if (!opened) throw new Error("вкладка «Состав» не раскрылась (гидратация?)");
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const consoleErrors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url || "";
    if (/\/uploads\//.test(url)) return;
    /* страница тестового простого товара намеренно отсутствует в статике (спасение) */
    if (/test152-simple/.test(url) && /404|Failed/.test(msg.text())) return;
    if (/\/api\/auth\//.test(url) && /401|Unauthorized/.test(msg.text())) return;
    if (/favicon|\.webp|\.png|\.jpe?g|\.svg/i.test(url) && /404|Failed/.test(msg.text())) return;
    if (/ERR_CERT_AUTHORITY_INVALID/.test(msg.text())) return;
    consoleErrors.push(`${msg.text()} @ ${url}`);
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  /* Ожидаемое полное число позиций — из API (то, что витрина должна показать после раскрытия) */
  const apiItems = {};
  for (const slug of [MANY, FEW]) {
    const res = await page.request.get(`${BASE}/api/products/${encodeURIComponent(slug)}`);
    const json = await res.json();
    apiItems[slug] = (json.data?.bundle_items ?? []).length;
  }
  apiItems[MANY] >= 20
    ? ok(`API: у ${MANY} ${apiItems[MANY]} позиций (больше 2 рядов ПК)`)
    : bad(`API: у ${MANY} всего ${apiItems[MANY]} позиций`);
  apiItems[FEW] > 0 && apiItems[FEW] < 12
    ? ok(`API: у ${FEW} ${apiItems[FEW]} позиций (меньше 2 рядов ПК)`)
    : bad(`API: у ${FEW} ${apiItems[FEW]} позиций — вне диапазона`);

  /* A. ПК 1440: свёрнуто 12 карточек (2 ряда × 6 колонок), «показать больше» по центру */
  await openProduct(page, MANY);
  let st = await compState(page);
  st && st.cards === 12
    ? ok(`ПК: свёрнуто 12 карточек (2 ряда × 6 колонок), всего в DOM карточек ${st.cards}`)
    : bad(`ПК: карточек ${st ? st.cards : "нет данных"}, ожидалось 12`);
  st && st.ulRows === 12
    ? ok("ПК: телефонный список (скрытый) держит тот же срез — DOM согласован")
    : bad(`ПК: строк скрытого списка ${st ? st.ulRows : "?"}, ожидалось 12`);
  st && st.visibleDetails === 12
    ? ok("ПК: видимых «Подробнее» ровно 12 (скрытых позиций в DOM нет)")
    : bad(`ПК: видимых «Подробнее» ${st ? st.visibleDetails : "?"}, ожидалось 12`);
  st && st.more && st.more.text === "показать больше"
    ? ok("ПК: текст «показать больше» на месте")
    : bad(`ПК: кнопка/текст: ${st && st.more ? st.more.text : "нет"}`);
  st && st.more && st.more.textAlign === "center" && st.more.dx < 4
    ? ok(`ПК: «показать больше» выровнен по центру (text-align=center, смещение ${st.more.dx.toFixed(1)}px)`)
    : bad(`ПК: выравнивание: ${st && st.more ? st.more.textAlign + "/" + st.more.dx : "нет кнопки"}`);

  /* B. ПК: клик раскрывает весь состав, кнопка исчезает */
  await page.click('[data-testid="composition-show-more"]');
  await page.waitForTimeout(400);
  st = await compState(page);
  st && st.cards === apiItems[MANY]
    ? ok(`ПК: после клика все ${apiItems[MANY]} карточек на месте`)
    : bad(`ПК: после клика карточек ${st ? st.cards : "?"}, ожидалось ${apiItems[MANY]}`);
  st && !st.more
    ? ok("ПК: после раскрытия кнопка «показать больше» исчезла")
    : bad("ПК: кнопка осталась после раскрытия");

  /* C. Планшет 800: свёрнуто 8 карточек (2 ряда × 4 колонки) */
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await openProduct(page, MANY);
  st = await compState(page);
  st && st.cards === 8 && st.more
    ? ok("Планшет: свёрнуто 8 карточек (2 ряда × 4 колонки), кнопка на месте")
    : bad(`Планшет: cards=${st ? st.cards : "?"}, more=${st && st.more ? "есть" : "нет"}`);
  await page.click('[data-testid="composition-show-more"]');
  await page.waitForTimeout(400);
  st = await compState(page);
  st && st.cards === apiItems[MANY]
    ? ok(`Планшет: после клика все ${apiItems[MANY]} карточек`)
    : bad(`Планшет: после клика ${st ? st.cards : "?"}`);

  /* D. Телефон 375: свёрнуто 2 позиции списка, раскрытие, модалка «Подробнее» */
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await openProduct(page, MANY);
  st = await compState(page);
  st && st.ulRows === 2 && st.visibleDetails === 2 && st.more
    ? ok("Телефон: свёрнуто 2 позиции списка, «показать больше» на месте")
    : bad(`Телефон: rows=${st ? st.ulRows : "?"}, visible=${st ? st.visibleDetails : "?"}, more=${st && st.more ? "есть" : "нет"}`);
  await page.click('[data-testid="composition-show-more"]');
  await page.waitForTimeout(400);
  st = await compState(page);
  st && st.ulRows === apiItems[MANY]
    ? ok(`Телефон: после клика все ${apiItems[MANY]} позиций списка`)
    : bad(`Телефон: после клика ${st ? st.ulRows : "?"}, ожидалось ${apiItems[MANY]}`);
  const dlgBefore = await page.evaluate(() =>
    document.querySelectorAll('div[role="dialog"][aria-modal="true"]').length);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Подробнее" && x.offsetParent !== null);
    b.click();
  });
  await page.waitForTimeout(400);
  const dlgAfter = await page.evaluate(() =>
    document.querySelectorAll('div[role="dialog"][aria-modal="true"]').length);
  dlgAfter === dlgBefore + 1
    ? ok("Телефон: «Подробнее» из раскрытого списка открывает модалку")
    : bad(`Телефон: модалка не открылась (${dlgBefore} → ${dlgAfter})`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const dlgClosed = await page.evaluate(() =>
    document.querySelectorAll('div[role="dialog"][aria-modal="true"]').length);
  dlgClosed === dlgBefore
    ? ok("Телефон: модалка закрывается по Escape")
    : bad(`Телефон: модалка не закрылась (${dlgClosed} осталось)`);

  /* E. Короткий набор (11 позиций ≤ 12 на ПК): кнопки нет, состав целиком */
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProduct(page, FEW);
  st = await compState(page);
  st && st.cards === apiItems[FEW] && !st.more
    ? ok(`ПК: короткий набор (${apiItems[FEW]} ≤ 12) показан целиком, кнопки нет`)
    : bad(`ПК: короткий набор cards=${st ? st.cards : "?"}, more=${st && st.more ? "лишняя" : "нет"}`);

  /* F. Ресайз без перезагрузки: ПК (12) → телефон (2 позиции) */
  await openProduct(page, MANY);
  st = await compState(page);
  st && st.cards === 12 ? ok("Ресайз: исходно 12 карточек на ПК") : bad(`Ресайз: до — ${st ? st.cards : "?"}`);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  st = await compState(page);
  st && st.ulRows === 2 && st.visibleDetails === 2 && st.more
    ? ok("Ресайз: без перезагрузки срез перестроился до 2 позиций списка, кнопка появилась")
    : bad(`Ресайз: после — rows=${st ? st.ulRows : "?"}, visible=${st ? st.visibleDetails : "?"}, more=${st && st.more ? "есть" : "нет"}`);

  /* G. Простой товар (не-набор): страница жива, вкладки «Состав» нет.
     Регресс: bundle_items у не-наборов undefined — раньше .length ронял
     карточку (pageerror "reading 'length'"). */
  await page.goto(`${BASE}/product/test152-simple/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector("h1");
        return !!h1 && (h1.textContent || "").includes("Тестовый простой товар 152");
      },
      null,
      { timeout: 15000 },
    );
    ok("простой товар: карточка отрисовалась, h1 на месте (не упал на .length)");
  } catch {
    bad("простой товар: карточка не отрисовалась (краш ProductTabs?)");
  }
  const stH = await page.evaluate(() => ({
    compTab: [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").trim().toLowerCase().startsWith("состав")),
  }));
  !stH.compTab
    ? ok("простой товар: вкладки «Состав подарка» нет")
    : bad("простой товар: у не-набора есть вкладка «Состав»");

  /* H. Консоль чиста */
  consoleErrors.length === 0
    ? ok("консоль браузера чиста (без ошибок JS)")
    : bad("ошибки консоли: " + consoleErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\nИТОГО: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => { console.error("e2e упал:", e.message); process.exit(1); });
