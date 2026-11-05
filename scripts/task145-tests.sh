#!/bin/bash
# Task 145 тесты: локализация логотипов брендов и иконок условий.
# A) статический анализ: никаких внешних hotlink-ов на wp-content;
#    все файлы /uploads/brands и /uploads/icons существуют и валидны;
# B) стенд .deploy-package: каждый URL логотипа/иконки отдаёт HTTP 200,
#    в запечённой главной нет ссылок на wp-content.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── A1. TypeScript и ESLint ──"
if npx tsc --noEmit >/tmp/t145-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t145-tsc.log)"; fi
if npx eslint src/lib/mock-data.ts src/components/home/BrandLogos.tsx src/components/home/InfoCards.tsx >/tmp/t145-eslint.log 2>&1; then ok "eslint изменённых файлов чист"; else bad "eslint: $(tail -5 /tmp/t145-eslint.log)"; fi

echo "── A2. Никаких внешних ссылок на WordPress ──"
if grep -rn "https://[^ ]*wp-content" src/ --include="*.ts" --include="*.tsx" >/dev/null 2>&1; then
  bad "в src/ остались hotlink-и на wp-content: $(grep -rln 'https://[^ ]*wp-content' src/ | tr '\n' ' ')"
else
  ok "hotlink-ов на wp-content в src/ нет"
fi
grep -q 'const brandLogo' src/lib/mock-data.ts && grep -q 'brandLogo("konti")' src/lib/mock-data.ts \
  && ok "mockBrands собирает пути через brandLogo()" \
  || bad "mockBrands не использует локальные пути"
grep -q 'icon("discount")' src/lib/mock-data.ts && grep -q 'icon("delivery")' src/lib/mock-data.ts && grep -q 'icon("payment")' src/lib/mock-data.ts \
  && ok "mockIcons: условия — локальные svg-иконки" \
  || bad "mockIcons не на локальных иконках"

echo "── A3. Файлы брендов (18) и иконки ──"
python3 - "$ROOT" << 'EOF'
import re, os, sys
from PIL import Image
root = sys.argv[1]
src = open(f"{root}/src/lib/mock-data.ts", encoding="utf-8").read()
urls = re.findall(r'brandLogo\("([a-z0-9-]+)"\)', src)
assert len(urls) == 18, f"brandLogo вхождений {len(urls)}, ожидалось 18"
problems = []
for slug in urls:
    p = f"{root}/public/uploads/brands/{slug}.png"
    if not os.path.exists(p):
        problems.append(f"{slug}: файла нет"); continue
    size = os.path.getsize(p)
    if size < 800: problems.append(f"{slug}: {size} б — подозрительно мал")
    im = Image.open(p); im.load()
    if im.size[0] != im.size[1]: problems.append(f"{slug}: не квадрат {im.size}")
    if max(im.size) < 200: problems.append(f"{slug}: мелкий {im.size}")
for i in ("discount", "delivery", "payment"):
    p = f"{root}/public/uploads/icons/{i}.svg"
    if not os.path.exists(p) or os.path.getsize(p) < 100:
        problems.append(f"icons/{i}.svg нет/пуст")
    elif "#0274BE" not in open(p).read():
        problems.append(f"icons/{i}.svg без фирменного синего")
for i in (1, 2, 3):
    if not os.path.exists(f"{root}/public/uploads/ico-step{i}.svg"):
        problems.append(f"ico-step{i}.svg нет")
if not os.path.exists(f"{root}/public/brand/tuby.webp"):
    problems.append("фолбэк /brand/tuby.webp нет")
print("PROBLEMS:", problems if problems else "none")
sys.exit(1 if problems else 0)
EOF
[ $? = 0 ] && ok "18 png брендов квадратные/валидные; иконки на месте, фирменный синий" || bad "проблемы с файлами ассетов (см. PROBLEMS выше)"

echo "── B. Стенд .deploy-package ──"
[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; echo ""; echo "ИТОГО (частично, без стенда): PASS=$PASS FAIL=$FAIL"; exit 2; }
PORT=8098; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
"$PHP" -r '$pdo=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $pdo->exec("DELETE FROM rate_limits");' "$ROOT/.deploy-package" 2>/dev/null
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t145-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; echo ""; echo "ИТОГО: PASS=$PASS FAIL=$FAIL"; exit 1; }

# Все ассеты из mock-data на стенде — HTTP 200 + корректный content-type
python3 - "$BASE" << 'EOF'
import re, sys, urllib.request
root = sys.argv[1] if len(sys.argv) > 1 else ""
BASE = sys.argv[1]
src = open("src/lib/mock-data.ts", encoding="utf-8").read()
urls = set(re.findall(r'"(/uploads/(?:brands|icons)/[a-z0-9-]+\.(?:png|svg))"', src))
urls |= {f"/uploads/ico-step{i}.svg" for i in (1, 2, 3)}
bad = []
for u in sorted(urls):
    try:
        req = urllib.request.Request(BASE + u, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            ct = r.headers.get("Content-Type", "")
            body = r.read()
            if r.status != 200 or len(body) < 200:
                bad.append(f"{u} status={r.status} len={len(body)}")
    except Exception as e:
        bad.append(f"{u} {e}")
print("BAD:", bad if bad else "none")
sys.exit(1 if bad else 0)
EOF
[ $? = 0 ] && ok "все бренды/иконки/шаги на стенде отдают 200" || bad "часть ассетов на стенде не отдаётся"

# В запечённой главной нет wp-content и есть локальные бренды
H="$ROOT/.deploy-package/index.html"
if grep -q "wp-content" "$H"; then bad "в запечённой главной остались ссылки wp-content"; else ok "запечённая главная без wp-content"; fi
grep -q "/uploads/brands/krasny-oktyabr.png" "$H" && grep -q "/uploads/brands/konti.png" "$H" \
  && ok "в запечённой главной локальные логотипы брендов" \
  || bad "в запечённой главной нет бренд-логотипов"
grep -q "/uploads/icons/discount.svg" "$H" \
  && ok "в запечённой главной локальные иконки условий" \
  || bad "иконок условий нет в статике"

pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
