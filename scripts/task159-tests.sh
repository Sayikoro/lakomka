#!/bin/bash
# Task 159: каталог — клик «Тубы» на главной показывал ВСЕ товары, а плитки
# «Тубы» не было в фильтрах каталога.
#
# Причина (двойная):
#   1) выбранная категория резолвилась из списка категорий «с товарами»
#      (categoryOptions): у пустой категории («Тубы», 0 товаров в БД)
#      find давал undefined → фильтр молча не применялся → весь каталог;
#   2) плитки фильтра рисовали только категории с товарами — у «Туб»
#      плитки не было вовсе.
#
# Фикс в CatalogClient.tsx (блок Task 159):
#   - selectedCategory ищется в ПОЛНОМ справочнике categories → фильтр
#     применяется всегда; пустая категория = честный пустой результат;
#   - плитки фильтра — все категории из справочника;
#   - пустое состояние называет категорию: catalog_category_empty {name}.
# Новый текст catalog_category_empty — в реестре page-texts.ts.
#
# Состав:
#  1. Типы (tsc).
#  2. Маркеры фикса в CatalogClient.tsx + отсутствие старого categoryOptions.
#  3. Ключ catalog_category_empty в реестре текстов (с подстановкой {name}).
#  4. Регресс-маркеры: css-блоки Task 155/156 на месте; `?category=` с главной жив.
#  5. Computed/e2e — отдельно: task159-e2e.sh (стенд :8096).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Типы ──"
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc159.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc159.log)"
fi

echo "── 2. Маркеры фикса (CatalogClient.tsx) ──"
F="src/app/(shop)/catalog/CatalogClient.tsx"

grep -q "Task 159: выбранная категория резолвится из ПОЛНОГО списка" "$F" \
  && ok "комментарий Task 159 на месте" || bad "нет комментария Task 159"

grep -q '() => categories.find((c) => c.slug === category) ?? null' "$F" \
  && ok "selectedCategory резолвится из полного справочника categories" \
  || bad "selectedCategory не из полного справочника"

! grep -q "categoryOptions" "$F" \
  && ok "старый categoryOptions из витринного каталога удалён" \
  || bad "categoryOptions ещё жив в CatalogClient"

grep -q "const cat = selectedCategory;" "$F" \
  && ok "фильтр товаров использует выбранную категорию (пустая фильтрует, а не пропускает)" \
  || bad "фильтр не использует selectedCategory"

grep -q "{categories.length > 0 && (" "$F" \
  && ok "блок фильтров показывается при наличии категорий в справочнике" \
  || bad "блок фильтров всё ещё гейтится наличием товаров"

grep -q "{categories.map((c) => (" "$F" \
  && ok "плитки фильтров — все категории (включая пустые «Тубы»)" \
  || bad "плитки не из полного списка"

grep -q 'data-testid="catalog-empty"' "$F" \
  && ok "пустое состояние помечено data-testid" || bad "нет data-testid= catalog-empty"

grep -q 't("catalog_category_empty", { name: selectedCategory.name })' "$F" \
  && ok "пустая категория называет себя ({name})" || bad "нет catalog_category_empty с {name}"

grep -q '{ name: selectedCategory.name }' "$F" && grep -c "catalog_empty_result" "$F" | grep -q "^1$" \
  && ok "старый текст catalog_empty_result остался только для фильтров без категории" \
  || bad "catalog_empty_result потерян или размножен"

echo "── 3. Ключ текста (page-texts.ts) ──"
P="src/lib/page-texts.ts"
grep -q 'key: "catalog_category_empty"' "$P" \
  && ok "ключ catalog_category_empty зарегистрирован в реестре" || bad "ключ не зарегистрирован"
grep -q 'def: "В категории «{name}» пока нет подарков. Посмотрите другие разделы каталога."' "$P" \
  && ok "дефолт с подстановкой {name}" || bad "дефолт не содержит {name}"

echo "── 4. Регресс-маркеры ──"
G="src/app/globals.css"
grep -q "Курсор (Task 155)" "$G" \
  && ok "css-блок Task 155 (курсор) на месте" || bad "потерян блок Task 155"
grep -q "Каретка (Task 156)" "$G" \
  && ok "css-блок Task 156 (каретка) на месте" || bad "потерян блок Task 156"
grep -q 'new URLSearchParams(window.location.search).get("category")' "$F" \
  && ok "старые ссылки с главной ?category=slug по-прежнему подхватываются" \
  || bad "чтение ?category= из URL потеряно"
grep -q 'href={`/catalog/${cat.slug}`}' src/components/home/CategoryGrid.tsx \
  && ok "плитки главной ведут на SEO-лендинги категорий (Task 141 жив)" \
  || bad "ссылки главной на категории сломаны"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
