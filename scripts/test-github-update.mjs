#!/usr/bin/env node
/**
 * Task «Обновление с GitHub»: e2e-тесты API /api/admin/site-update/github-*.
 *
 *   BASE_URL=http://127.0.0.1:8000 \
 *   ADMIN_TOKEN=... EDITOR_TOKEN=... \
 *   TAG=v2026.10.30-0354 ASSET=lakomka-update-2026.10.30-0354.zip VERSION=2026.10.30-0354 \
 *   node scripts/test-github-update.mjs
 *
 * Требует, чтобы релиз с ассетом уже был опубликован на GitHub.
 * Проверяет: 401 без токена, 403 не-админу, отказ кривых имён (422),
 * отказ несуществующего тега (502), полный цикл check → download → apply
 * (архив применяется к стенду из backend/UPDATE_ROOT), затем check
 * показывает «установлена последняя версия».
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const ADMIN = process.env.ADMIN_TOKEN ?? "";
const EDITOR = process.env.EDITOR_TOKEN ?? "";
const TAG = process.env.TAG ?? "";
const ASSET = process.env.ASSET ?? "";
const VERSION = process.env.VERSION ?? "";

let failures = 0;

function check(name, cond, extra = "") {
  const ok = cond ? "PASS" : "FAIL";
  console.log(`[${ok}] ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

async function api(path, { method = "GET", token, body } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (body) h["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  if (!TAG || !ASSET || !VERSION) {
    console.error("Нужны TAG, ASSET, VERSION (релиз должен быть опубликован)");
    process.exit(2);
  }

  /* A: без токена — 401 */
  const a = await api("/api/admin/site-update/github-check?fresh=1");
  check("A: github-check без токена → 401", a.status === 401, `got ${a.status}`);

  /* B: editor может проверять релиз (read-only) */
  const b = await api("/api/admin/site-update/github-check?fresh=1", { token: EDITOR });
  check("B1: github-check под editor → 200", b.status === 200, `got ${b.status}`);
  check("B2: релиз и ассет найдены", b.json?.data?.release?.tag === TAG && b.json?.data?.asset?.name === ASSET,
    `tag=${b.json?.data?.release?.tag} asset=${b.json?.data?.asset?.name}`);
  check("B3: обнаружено обновление", b.json?.data?.update_available === true,
    `available=${b.json?.data?.update_available} current=${b.json?.data?.current_version}`);

  /* C: download без токена — 401 */
  const c = await api("/api/admin/site-update/github-download", {
    method: "POST", body: { tag: TAG, asset: ASSET },
  });
  check("C: github-download без токена → 401", c.status === 401, `got ${c.status}`);

  /* D: download под editor — 403 */
  const d = await api("/api/admin/site-update/github-download", {
    method: "POST", token: EDITOR, body: { tag: TAG, asset: ASSET },
  });
  check("D: github-download под editor → 403", d.status === 403, `got ${d.status}`);

  /* E: кривые имена — 422 */
  const e1 = await api("/api/admin/site-update/github-download", {
    method: "POST", token: ADMIN, body: { tag: TAG, asset: "lakomka-update-..zip" },
  });
  check("E1: asset с «..» → 422", e1.status === 422, `got ${e1.status}`);
  const e2 = await api("/api/admin/site-update/github-download", {
    method: "POST", token: ADMIN, body: { tag: "../evil", asset: ASSET },
  });
  check("E2: tag с «../» → 422", e2.status === 422, `got ${e2.status}`);
  const e3 = await api("/api/admin/site-update/github-download", {
    method: "POST", token: ADMIN, body: { tag: TAG, asset: "random-file.zip" },
  });
  check("E3: не lakomka-update-*.zip → 422", e3.status === 422, `got ${e3.status}`);

  /* F: несуществующий тег — 502 с понятной ошибкой */
  const f = await api("/api/admin/site-update/github-download", {
    method: "POST", token: ADMIN, body: { tag: "v1999.01.01-0000", asset: "lakomka-update-1999.01.01-0000.zip" },
  });
  check("F: несуществующий релиз → 502", f.status === 502, `got ${f.status} ${JSON.stringify(f.json).slice(0, 120)}`);

  /* G: скачанный заранее неверный sha256 — 502 */
  const g = await api("/api/admin/site-update/github-download", {
    method: "POST", token: ADMIN, body: { tag: TAG, asset: ASSET, sha256: "0".repeat(64) },
  });
  check("G: несовпавший sha256 → 502", g.status === 502, `got ${g.status}`);

  /* H: полный цикл — download + apply */
  const h = await api("/api/admin/site-update/github-download", {
    method: "POST", token: ADMIN, body: { tag: TAG, asset: ASSET },
  });
  check("H1: github-download → 200", h.status === 200 && h.json?.data?.ok === true,
    `got ${h.status} ${JSON.stringify(h.json).slice(0, 160)}`);
  const dl = h.json?.data;
  check("H2: имя файла github-*.zip", /^github-[a-z0-9\-]+\.zip$/.test(dl?.file_name ?? ""), dl?.file_name);
  check("H3: версия и размер", dl?.version === VERSION && dl?.size > 1000, `version=${dl?.version} size=${dl?.size}`);
  check("H4: sha256 отдан", typeof dl?.sha256 === "string" && dl.sha256.length === 64, dl?.sha256?.slice(0, 16));

  const i = await api("/api/admin/site-update/apply", {
    method: "POST", token: ADMIN, body: { file_name: dl.file_name },
  });
  check("H5: apply скачанного архива → 200", i.status === 200 && i.json?.data?.ok === true,
    `got ${i.status} ${JSON.stringify(i.json).slice(0, 200)}`);
  check("H6: версия применилась", i.json?.data?.version === VERSION, `version=${i.json?.data?.version}`);
  check("H7: файлы применены", (i.json?.data?.files ?? 0) > 100, `files=${i.json?.data?.files}`);

  /* I: повторная проверка — обновление больше не нужно */
  const k = await api("/api/admin/site-update/github-check?fresh=1", { token: ADMIN });
  check("I: после применения — «последняя версия»", k.json?.data?.update_available === false,
    `available=${k.json?.data?.update_available} current=${k.json?.data?.current_version}`);

  console.log(failures === 0 ? "\nВСЕ ТЕСТЫ ПРОЙДЕНЫ" : `\nПРОВАЛОВ: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
