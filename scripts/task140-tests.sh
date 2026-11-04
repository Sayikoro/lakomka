#!/bin/bash
# Task 140 тесты: круглая кнопка с иконкой корзины в карточках товаров.
# 1) tsc --noEmit чист; 2) в запечённом HTML карточек товара блок
#    «Похожие подарки» содержит круглые кнопки добавления (rounded-full +
#    aria-label «Добавить … в корзину»), старой текстовой кнопки там нет;
#    3) иконка корзины (тот же svg-путь, что в шапке и каталоге) на месте.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. TypeScript ──"
if npx tsc --noEmit >/tmp/t140-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t140-tsc.log)"; fi

echo "── 2. Компонент ProductCard ──"
SRC="$ROOT/src/components/ui/ProductCard.tsx"
grep -q 'group/cart' "$SRC" && grep -q 'rounded-full' "$SRC" && \
  grep -q 'M2.5 3.5h2.2l2.5 12h11.2l2.1-8.6H6.1' "$SRC" && \
  grep -q 'bg-\[#2e9e5b\]' "$SRC" && \
  ! grep -q '>В корзину<' "$SRC" \
  && ok "круглая кнопка с иконкой корзины + зелёная галочка, текстовой кнопки нет" \
  || bad "компонент ProductCard не соответствует ожиданиям"
grep -q 'quickAdd' "$SRC" && ok "добавление через quickAdd (add из стора корзины)" || bad "нет quickAdd"

echo "── 3. Запечённый HTML (.deploy-package) ──"
[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; exit 1; }
FOUND=0; CHECKED=0
for F in "$ROOT"/.deploy-package/product/*/index.html; do
  [ -f "$F" ] || continue
  CHECKED=$((CHECKED+1))
  SEG="$(python3 - "$F" <<'EOF'
import re, sys
html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
m = re.search(r'data-testid="product-similar"(.*?)</section>', html, re.S)
print(m.group(1) if m else "")
EOF
)"
  [ -z "$SEG" ] && continue
  FOUND=1
  SLUG="$(basename "$(dirname "$F")")"
  echo "$SEG" | grep -q 'aria-label="Добавить' && echo "$SEG" | grep -q 'rounded-full' \
    && ok "$SLUG: в похожих есть круглая кнопка добавления" \
    || bad "$SLUG: круглой кнопки в похожих нет"
  echo "$SEG" | grep -q 'M2.5 3.5h2.2l2.5 12h11.2l2.1-8.6H6.1' \
    && ok "$SLUG: иконка корзины в запечённом HTML" \
    || bad "$SLUG: иконки корзины нет в HTML"
  echo "$SEG" | grep -q '>В корзину<' \
    && bad "$SLUG: в блоке осталась текстовая кнопка «В корзину»" \
    || ok "$SLUG: текстовой кнопки «В корзину» в блоке нет"
  break # достаточно одной страницы с блоком
done
[ "$FOUND" = "1" ] && ok "запечённая страница с похожими найдена (из $CHECKED страниц)" || { [ "$CHECKED" = "0" ] && bad "нет запечённых страниц товара"; }

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
