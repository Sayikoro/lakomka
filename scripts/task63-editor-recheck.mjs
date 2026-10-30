/* Task 63 реверификация editor.html в текущей среде (после ресета workspace).
   Берёт реальный живой архив public/exports/lakomka-products.zip,
   прогоняет ядро редактора (парсер CSV + ZIP-хирургия) в Node:
   1) round-trip products.csv байт-в-байт без правок;
   2) правка цены товара 357 → пересборка ZIP;
   3) сверка: 435 записей, не-CSV записи байт-в-байт, новый CSV читается;
   4) результат пишется в /tmp/task63-edited.zip для PHP-проверки. */
import { readFileSync, writeFileSync } from "node:fs";

const HTML = "/home/z/my-project/backend/resources/product-editor.html";
const ZIP = "/home/z/my-project/public/exports/lakomka-products.zip";

const html = readFileSync(HTML, "utf8");
const s = html.indexOf("<script>");
const e = html.indexOf("</script>", s);
if (s < 0 || e < 0) throw new Error("Ядро редактора не найдено");
const coreSrc = html.slice(s + "<script>".length, e);

/* Ядро — чистые функции без DOM. eval в этой области видимости. */
const core = eval(`(function(){ "use strict";
  ${coreSrc}
  return { HEADERS, ALIASES, parseCsv, serializeCsv, csvEscape, phpTrim,
           rowToProduct, productToRow, buildColMap,
           crc32, dosDateTime, buildZip, readZipStructure, extractEntry, localBlock };
})()`);

const failures = [];
const ok = (cond, msg) => { console.log((cond ? "  OK  " : " FAIL ") + msg); if (!cond) failures.push(msg); };

/* --- 1. читаем реальный архив --- */
const zipBuf = readFileSync(ZIP);
const ab = zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength);
console.log("Архив: " + (zipBuf.length / 1024 / 1024).toFixed(1) + " МБ");
const ctx = await core.readZipStructure(ab);
ok(ctx.entries.length === 435, `записей в архиве: ${ctx.entries.length} (ожидалось 435)`);

/* целостность данных: CRC32 каждой записи по фактическому содержимому */
let crcBad = 0, csvEntry = null;
for (const en of ctx.entries) {
  if (en.isCsv) { csvEntry = en; continue; }
  if (en.isDir) continue;
  /* CRC в заголовке — по РАСПАКОВАННЫМ данным: STORE проверяем слайсом,
     DEFLATE — после inflate */
  const data = en.method === 0
    ? ctx.zipBytes.subarray(en.dataStart, en.dataEnd)
    : await core.extractEntry(ctx, en);
  if (core.crc32(data) !== en.crc) { crcBad++; console.log("  bad crc: " + en.name + " method=" + en.method); }
}
ok(crcBad === 0, `CRC всех не-CSV записей совпадает (плохих: ${crcBad})`);
ok(!!csvEntry, "products.csv найден в архиве");

/* --- 2. round-trip CSV без правок --- */
const csvBytes = await core.extractEntry(ctx, csvEntry);
const csvText = new TextDecoder("utf-8").decode(csvBytes);
const rows2d = core.parseCsv(csvText, ";");
const colMap = core.buildColMap(rows2d[0]);
ok(colMap["НАЗВАНИЕ"] !== undefined && colMap["ТИП"] !== undefined, "колонки НАЗВАНИЕ/ТИП найдены");
const rows = rows2d.slice(1)
  .filter((c) => c.some((v) => v && String(v).trim() !== ""))
  .map((c) => core.rowToProduct(c, colMap))
  .filter((p) => p.name || p.slug || p.id);
ok(rows.length === 368, `товаров распознано: ${rows.length} (ожидалось 368)`);
const rebuilt = new TextEncoder().encode(core.serializeCsv(rows));
ok(Buffer.from(rebuilt).equals(Buffer.from(csvBytes)),
  "round-trip products.csv БАЙТ-В-БАЙТ без правок");

/* --- 3. правка цены товара 357 и пересборка --- */
const p357 = rows.find((r) => r.id === "357");
ok(!!p357, "товар 357 найден (" + (p357 ? p357.name : "") + ")");
if (p357) {
  console.log("  цена 357 была: " + p357.price);
  p357.price = "350.01"; p357._changed = true;
}
const editedCsv = new TextEncoder().encode(core.serializeCsv(rows));
const blob = core.buildZip(ctx.entries, editedCsv, []);
const outBuf = Buffer.from(await blob.arrayBuffer());
writeFileSync("/tmp/task63-edited.zip", outBuf);
console.log("Пересобран: /tmp/task63-edited.zip (" + (outBuf.length / 1024 / 1024).toFixed(1) + " МБ)");

/* --- 4. проверка пересобранного архива ядром же --- */
const outAb = outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength);
const octx = await core.readZipStructure(outAb);
ok(octx.entries.length === 435, `в пересобранном: ${octx.entries.length} записей`);
ok(octx.entries[0].name === "products.csv", "products.csv — первая запись");
const oCsv = await core.extractEntry(octx, octx.entries.find((x) => x.isCsv));
ok(Buffer.from(oCsv).equals(Buffer.from(editedCsv)), "products.csv в пересобранном = отредактированному");

let diff = 0, checked = 0;
for (const en of ctx.entries) {
  if (en.isCsv) continue;
  checked++;
  const a = ctx.zipBytes.subarray(en.lhOff, en.dataEnd);
  const oe = octx.entries.find((x) => x.name === en.name);
  if (!oe) { diff++; continue; }
  const b = octx.zipBytes.subarray(oe.lhOff, oe.dataEnd);
  if (!Buffer.from(a).equals(Buffer.from(b))) diff++;
}
ok(diff === 0, `не-CSV записи скопированы байт-в-байт (проверено ${checked}, отличий ${diff})`);

const back = core.parseCsv(new TextDecoder("utf-8").decode(oCsv), ";");
const backRows = back.slice(1)
  .filter((c) => c.some((v) => v && String(v).trim() !== ""))
  .map((c) => core.rowToProduct(c, core.buildColMap(back[0])))
  .filter((p) => p.name || p.slug || p.id);
const back357 = backRows.find((r) => r.id === "357");
ok(back357 && back357.price === "350.01", "правка цены 357=350.01 читается обратно");

console.log(failures.length ? "\nПРОВАЛЕНО: " + failures.length : "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exit(failures.length ? 1 : 0);
