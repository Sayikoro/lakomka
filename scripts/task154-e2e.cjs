/* Task 154 E2E: количество можно ввести с клавиатуры.
 *
 * Стенд :8096 (.deploy-package, собран MODE=both). Сценарии:
 * A) Карточка товара (AddToCart): поле количества принимает ввод с
 *    клавиатуры — печатаем «100», Enter, жмём «В корзину» → в шапке
 *    бейдж корзины «100».
 * B) Страница /cart: ввод «7» — сумма и бейдж обновились; «0» → зажалось
 *    в 1; пустое поле → вернулось прежнее значение; кнопка «−» работает.
 * C) Корзина-шторка: ввод «25» — значение применилось, сумма позиции
 *    изменилась, бейдж в шапке «25».
 * Консоль без ошибок (штатный 401-зонд AdminToolbar фильтруется).
 *
 * Запуск: node scripts/task154-e2e.cjs http://127.0.0.1:8096
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8096";
let PASS = 0, FAIL = 0;
const ok = (s) => { PASS++; console.log("  OK  " + s); };
const bad = (s) => { FAIL++; console.log("  FAIL " + s); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (t.includes("401") || t.includes("Failed to load resource")) return; // штатный зонд сессии
    consoleErrors.push(t);
  });

  try {
    /* ── A. Карточка товара: ввод количества с клавиатуры ── */
    console.log("── A. AddToCart: печатаем 100 и добавляем ──");
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
    const firstSlug = await page.evaluate(async () => {
      const r = await fetch("/api/products", { cache: "no-store" });
      const j = await r.json();
      return (j.data ?? []).find((p) => p.show_in_catalog === 1)?.slug ?? "";
    });
    if (!firstSlug) {
      bad("не получили первый slug из /api/products");
      await browser.close();
      process.exit(1);
    }
    await page.goto(`${BASE}/product/${firstSlug}/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1500); // гидратация + живые похожие

    const qtyInput = page.locator('input[aria-label="Количество"]');
    if ((await qtyInput.count()) !== 1) {
      bad(`A: на карточке товара ожидался 1 инпут количества, найдено ${await qtyInput.count()}`);
    } else {
      ok("A: на карточке товара есть инпут количества (aria-label «Количество»)");

      await qtyInput.fill("100");
      await qtyInput.press("Enter");
      await page.waitForTimeout(300);
      const val = await qtyInput.inputValue();
      val === "100" ? ok("A: напечатанное «100» принято (Enter — коммит)")
                    : bad(`A: в поле «${val}», ожидалось «100»`);

      // Кнопка «В корзину» — следующий сосед контейнера степпера
      const addBtn = qtyInput.locator("xpath=ancestor::div[1]/following-sibling::button[1]");
      await addBtn.click();
      await page.waitForTimeout(800);
      const badge = await page.evaluate(() => {
        const el = document.querySelector('header button[aria-label="Корзина"] span');
        return el ? el.textContent.trim() : "";
      });
      badge === "100" ? ok("A: после «В корзину» бейдж корзины «100»")
                      : bad(`A: бейдж корзины «${badge}», ожидалось «100»`);
    }

    /* ── B. Страница корзины: нормализация ввода ── */
    console.log("── B. /cart: ввод, зажим в 1, откат пустого ──");
    await page.goto(`${BASE}/cart/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(800);

    const cartInput = page.locator(
      'xpath=//input[starts-with(@aria-label,"Количество")][not(ancestor::aside)]'
    );
    if ((await cartInput.count()) < 1) {
      bad("B: на /cart нет инпута количества");
    } else {
      const before = (await cartInput.inputValue()) || "";
      before === "100" ? ok("B: /cart показывает 100 из корзины")
                       : bad(`B: в /cart поле «${before}», ожидалось «100»`);

      // сумма позиции до/после (последний span с ₽ в строке — сумма, не цена за шт)
      const rowSum = () =>
        page.evaluate(() => {
          const inp = Array.from(
            document.querySelectorAll('input[aria-label^="Количество"]')
          ).find((i) => !i.closest("aside"));
          if (!inp) return "";
          const row = inp.closest("div.flex") || document;
          const sums = Array.from(row.querySelectorAll("span"))
            .map((s) => s.textContent.trim())
            .filter((t) => /₽/.test(t));
          return sums.length ? sums[sums.length - 1] : "";
        });

      const sumBefore = await rowSum();
      await cartInput.fill("7");
      await cartInput.press("Enter");
      await page.waitForTimeout(300);
      const badge7 = await page.evaluate(() => {
        const el = document.querySelector('header button[aria-label="Корзина"] span');
        return el ? el.textContent.trim() : "";
      });
      const sumAfter7 = await rowSum();
      (badge7 === "7" && sumAfter7 !== sumBefore)
        ? ok("B: ввод «7» применился — бейдж «7», сумма строки изменилась")
        : bad(`B: после «7» бейдж «${badge7}», сумма ${sumBefore} → ${sumAfter7}`);

      // 0 → зажим в 1
      await cartInput.fill("0");
      await cartInput.press("Enter");
      await page.waitForTimeout(300);
      const v0 = await cartInput.inputValue();
      v0 === "1" ? ok("B: «0» зажался в минимум (1), строка не удалилась")
                 : bad(`B: после «0» в поле «${v0}», ожидалось «1»`);

      // пустое поле → откат к прежнему
      await cartInput.fill("3");
      await cartInput.press("Enter");
      await page.waitForTimeout(200);
      await cartInput.fill("");
      await cartInput.press("Enter");
      await page.waitForTimeout(300);
      const vEmpty = await cartInput.inputValue();
      vEmpty === "3" ? ok("B: пустое поле вернуло прежнее значение (3)")
                     : bad(`B: после очистки в поле «${vEmpty}», ожидалось «3»`);

      // буквы не проходят
      await cartInput.fill("5abc");
      await page.waitForTimeout(100);
      const vLetters = await cartInput.inputValue();
      vLetters === "5" ? ok("B: нецифровые символы отсекаются («5abc» → «5»)")
                       : bad(`B: после ввода «5abc» в поле «${vLetters}»`);

      // кнопка «−» по-прежнему работает
      await cartInput.fill("100");
      await cartInput.press("Enter");
      await page.waitForTimeout(200);
      const minusBtn = cartInput.locator("xpath=preceding-sibling::button[1]");
      await minusBtn.click();
      await page.waitForTimeout(300);
      const vMinus = await cartInput.inputValue();
      vMinus === "99" ? ok("B: кнопка «−» уменьшила 100 → 99")
                      : bad(`B: после «−» в поле «${vMinus}», ожидалось «99»`);
    }

    /* ── C. Корзина-шторка: ввод с клавиатуры ── */
    console.log("── C. Шторка: печатаем 25 ──");
    await page.click('header button[aria-label="Корзина"]');
    await page.waitForTimeout(600);
    const drawer = page.locator('aside[aria-label="Корзина"]');
    if (!(await drawer.isVisible())) {
      bad("C: шторка корзины не открылась");
    } else {
      const drawerInput = drawer.locator('input[aria-label^="Количество"]');
      if ((await drawerInput.count()) < 1) {
        bad("C: в шторке нет инпута количества");
      } else {
        const drawerSum = () =>
          drawer.evaluate((d) => {
            const inp = d.querySelector('input[aria-label^="Количество"]');
            if (!inp) return "";
            const li = inp.closest("li") || d;
            return Array.from(li.querySelectorAll("span"))
              .map((s) => s.textContent.trim())
              .find((t) => /₽/.test(t)) || "";
          });

        const sBefore = await drawerSum();
        await drawerInput.fill("25");
        await drawerInput.press("Enter");
        await page.waitForTimeout(400);
        const vDrawer = await drawerInput.inputValue();
        const sAfter = await drawerSum();
        const badgeC = await page.evaluate(() => {
          const el = document.querySelector('header button[aria-label="Корзина"] span');
          return el ? el.textContent.trim() : "";
        });
        (vDrawer === "25" && sAfter !== sBefore && badgeC === "25")
          ? ok("C: в шторке «25» применился — сумма и бейдж обновились")
          : bad(`C: поле «${vDrawer}», сумма ${sBefore} → ${sAfter}, бейдж «${badgeC}»`);
      }
    }

    /* ── Консоль ── */
    consoleErrors.length === 0
      ? ok("консоль браузера без ошибок")
      : bad(`ошибки консоли: ${consoleErrors.slice(0, 3).join(" | ")}`);
  } catch (e) {
    bad(`исключение: ${e.message}`);
  }

  await browser.close();
  console.log(`\nИТОГО: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL === 0 ? 0 : 1);
})();
