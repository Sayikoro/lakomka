/* ============================================================
   Шаг 2 ремонта: конвертация докачанных оригиналов (.bin —
   полные PNG, скачанные repair-png-download.php с проверкой
   Content-Length) → WebP q82 в public/uploads/products/<dir>/<n>.webp.
   Битый .png переносится в .png-backup/. После конвертации .bin
   удаляется (свой .url остаётся как журнал).
   Запуск: node scripts/repair-png-convert.js
   ============================================================ */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = "/home/z/my-project";
const REPAIR = path.join(ROOT, ".png-repair");
const PRODUCTS = path.join(ROOT, "public/uploads/products");
const BACKUP = path.join(ROOT, ".png-backup");

(async () => {
  const bins = fs
    .readdirSync(REPAIR)
    .flatMap((dir) =>
      fs.readdirSync(path.join(REPAIR, dir))
        .filter((f) => f.endsWith(".bin"))
        .map((f) => path.join(REPAIR, dir, f))
    );

  console.log("Докачанных оригиналов:", bins.length);
  let done = 0, failed = 0;

  for (const bin of bins) {
    const rel = path.relative(REPAIR, bin);           // <dir>/0.bin
    const dir = path.dirname(rel);
    const base = path.basename(bin, ".bin");          // «0»
    const webpDest = path.join(PRODUCTS, dir, base + ".webp");
    const pngSrc = path.join(PRODUCTS, dir, base + ".png");
    try {
      if (fs.existsSync(webpDest)) {
        // уже сконвертирован ранее — только убрать мусор
        fs.rmSync(bin, { force: true });
        continue;
      }
      const buf = fs.readFileSync(bin);
      const out = await sharp(buf).webp({ quality: 82 }).toBuffer();
      const meta = await sharp(out).metadata();
      if (!meta.width || meta.width < 10) throw new Error("пустой результат");
      fs.writeFileSync(webpDest, out);

      if (fs.existsSync(pngSrc)) {
        const dest = path.join(BACKUP, path.relative(PRODUCTS, pngSrc));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(pngSrc, dest);
      }
      fs.rmSync(bin, { force: true });
      done++;
      console.log(`OK ${dir}/${base}.webp (${(out.length / 1024).toFixed(0)} КБ, ${meta.width}x${meta.height})`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${rel}:`, e.message);
    }
  }
  console.log(`\nКонвертировано: ${done}, ошибок: ${failed}`);
  console.log("Осталось битых PNG (без webp):");
  let left = 0;
  for (const d of fs.readdirSync(PRODUCTS)) {
    const dp = path.join(PRODUCTS, d);
    if (!fs.statSync(dp).isDirectory()) continue;
    for (const f of fs.readdirSync(dp)) {
      if (f.endsWith(".png") && !fs.existsSync(path.join(dp, f.replace(/\.png$/, ".webp")))) {
        left++;
        console.log("  -", d + "/" + f);
      }
    }
  }
  if (!left) console.log("  (нет — всё в webp)");
})();
