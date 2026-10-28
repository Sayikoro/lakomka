/* ============================================================
   Миграция фото товаров: PNG → WebP.
   336 фото товаров лежат в public/uploads/products/*.png по
   0,7–1,2 МБ. Raw <img> в карточках грузит их напрямую, а PNG
   отрисовывается построчно — отсюда «половинчатые» картинки.
   WebP такого же визуального качества весит в 5–10 раз меньше
   и рендерится только целиком (частичной отрисовки не бывает).

   Скрипт: конвертирует каждый .png → .webp (q82), оригинал
   переносит в /home/z/my-project/.png-backup/ (зеркало путей).
   Файлы, у которых .webp уже есть, пропускаются.
   Запуск: node scripts/convert-png-to-webp.js
   ============================================================ */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = "/home/z/my-project";
const SRC = path.join(ROOT, "public/uploads/products");
const BACKUP = path.join(ROOT, ".png-backup");

function walk(d, acc = []) {
  if (!fs.existsSync(d)) return acc;
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

(async () => {
  const pngs = walk(SRC).filter((f) => f.toLowerCase().endsWith(".png"));
  console.log("PNG найдено:", pngs.length);
  let done = 0, skipped = 0, failed = 0;
  let srcBytes = 0, outBytes = 0;

  for (const png of pngs) {
    const webp = png.replace(/\.png$/i, ".webp");
    try {
      if (fs.existsSync(webp)) {
        skipped++;
        continue;
      }
      const buf = fs.readFileSync(png);
      srcBytes += buf.length;
      const out = await sharp(buf).webp({ quality: 82 }).toBuffer();
      outBytes += out.length;
      fs.writeFileSync(webp, out);

      // оригинал — в бэкап (зеркало относительного пути)
      const rel = path.relative(SRC, png);
      const dest = path.join(BACKUP, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(png, dest);
      done++;
      if (done % 50 === 0) console.log("  …", done);
    } catch (e) {
      failed++;
      console.error("FAIL", png, e.message);
    }
  }

  console.log("Конвертировано:", done, "| пропущено (webp уже есть):", skipped, "| ошибок:", failed);
  console.log(
    "Размер: ", (srcBytes / 1048576).toFixed(1), "МБ →", (outBytes / 1048576).toFixed(1), "МБ",
    `(-${(100 - (outBytes / srcBytes) * 100).toFixed(0)}%)`
  );
})();
