#!/bin/bash
# Task 138: видео в карточках каталога больше не грузится само,
# и картинки после загрузки страницы больше не «моргают».
#
# Симптомы владельца:
#  1) «у некоторых всё же грузится видео» — сборка запекала card_video_enabled=1
#     (dev-БД), на проде галочка выключена: до ответа /api/settings/public
#     карточки рендерили <video preload="metadata"> — браузер (Safari — особенно)
#     качал видео 165 товаров с видео-медиа, потом всё перестраивалось.
#  2) «все картинки пару раз моргают» — слайды ключевались id медиа из БД;
#     id в dev-БД сборки и на проде расходятся → приход живых данных
#     перемонтировал все слайды: скелетон + opacity-0 → повторный фейд-ин.
#
# Фиксы: дефолт и парсер card_video_enabled → false (включается ТОЛЬКО явной
# галочкой), dev-БД = 0; ключи слайдов/миниатюр по type+url; SlideVideo —
# preload="none" + poster (видео качается только когда слайд активен и играет).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Типы и линт ──"
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc138.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc138.log)"
fi

LINT_FILES="src/lib/settings.ts src/components/ui/ProductCardNew.tsx src/components/ui/ProductGallery.tsx"
if ./node_modules/.bin/eslint $LINT_FILES > /tmp/eslint138.log 2>&1; then
  ok "eslint изменённых файлов чист"
else
  bad "eslint: $(head -3 /tmp/eslint138.log)"
fi

echo "── 2. card_video_enabled: выключено по умолчанию ──"
grep -q "card_video_enabled: false," src/lib/settings.ts \
  && ok "DEFAULT_FRONT_SETTINGS.card_video_enabled = false" \
  || bad "дефолт в DEFAULT_FRONT_SETTINGS не false"
grep -q "card_video_enabled: d.card_video_enabled === true," src/lib/settings.ts \
  && ok "парсер API: true только при явной галочке (=== true)" \
  || bad "парсер card_video_enabled не === true"
! grep -q "card_video_enabled: d.card_video_enabled !== false" src/lib/settings.ts \
  && ok "старый парсер (отсутствие ключа = true) удалён" \
  || bad "в settings.ts остался старый парсер !== false"

echo "── 3. Dev-БД сборки совпадает с выбором владельца (прод = 0) ──"
DBVAL="$(python3 -c "
import sqlite3
con = sqlite3.connect('backend/storage/database.sqlite')
rows = list(con.execute(\"SELECT value FROM settings WHERE key='card_video_enabled'\"))
print(rows[0][0] if rows else 'ROW_MISSING')
")"
[ "$DBVAL" = "0" ] && ok "dev-БД card_video_enabled = 0" || bad "dev-БД card_video_enabled = $DBVAL (ожидался 0)"

echo "── 4. Стабильные ключи слайдов (без перемонтирования при живых данных) ──"
grep -q 'key={`${m.type}-${m.url}`}' src/components/ui/ProductCardNew.tsx \
  && ok "ProductCardNew: слайды ключуются type+url" \
  || bad "ProductCardNew: слайды всё ещё на m.id"
! grep -q 'key={m\.id}' src/components/ui/ProductCardNew.tsx \
  && ok "ProductCardNew: старый ключ m.id удалён" \
  || bad "ProductCardNew: остался key={m.id}"
grep -q 'key={`${item.type}-${item.url}`}' src/components/ui/ProductGallery.tsx \
  && ok "ProductGallery: миниатюры ключуются type+url" \
  || bad "ProductGallery: миниатюры на item.id"

echo "── 5. SlideVideo не качает видео до активности ──"
grep -q 'preload="none"' src/components/ui/ProductCardNew.tsx \
  && ok "SlideVideo: preload=none (загрузка стартует play())" \
  || bad "SlideVideo: preload не none"
! grep -q 'preload="metadata"' src/components/ui/ProductCardNew.tsx \
  && ok "SlideVideo: preload=metadata убран" \
  || bad "SlideVideo: preload=metadata на месте"
grep -q "poster={poster ?? undefined}" src/components/ui/ProductCardNew.tsx \
  && ok "SlideVideo: постер = фото товара (Safari не показывает чёрный кадр)" \
  || bad "SlideVideo: постер не передан"
grep -q "poster={posterUrl}" src/components/ui/ProductCardNew.tsx \
  && ok "в слайд передаётся posterUrl" \
  || bad "posterUrl не передаётся в SlideVideo"

echo "── 6. Витринные пути: классическая карточка (hover) не изменилась ──"
grep -q 'showVideo = showVideos && hover && canPlay' src/components/ui/ProductCard.tsx \
  && ok "ProductCard: видео по-прежнему только по hover" \
  || bad "ProductCard: условие hover-видео изменилось"

echo "── 7. Логика парсера настроек (пограничные случаи) ──"
node -e '
const parse = (v) => v === true; // как в settings.ts
const cases = [
  [true, true], [false, false], [undefined, false], ["1", false], [1, false], [null, false],
];
let badc = 0;
for (const [inp, want] of cases) {
  if (parse(inp) !== want) { badc++; console.error("  case", inp, "→", parse(inp), "ожидался", want); }
}
process.exit(badc ? 1 : 0);
' && ok "парсер: true пропускает только boolean true (строки/числа/null → false)" \
  || bad "парсер card_video_enabled ведёт себя неверно"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
