#!/usr/bin/env bash
# Прогрев кеша next/image-оптимизатора для всех товарных картинок.
# Рандомные картинки категорий/фильтров при каждой загрузке страницы
# запрашивают оптимизатор «вхолодную» → картинки медленно «докручивались».
# Прогреваем оба размера из srcset сетки категорий (256 и 640).
set -u
DB=/home/z/my-project/backend/storage/database.sqlite
PHP=/home/z/my-project/.ztools/php
BASE=http://localhost:3000

urls=$($PHP -r '
$db = new PDO("sqlite:'"$DB"'");
foreach ($db->query("SELECT url FROM product_images") as $r) {
  $u = $r["url"];
  if (str_starts_with($u, "/uploads/")) echo $u . "\n";
}' | sort -u)

total=$(echo "$urls" | grep -c . )
echo "images: $total"
ok=0; fail=0
i=0
for u in $urls; do
  i=$((i+1))
  enc=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$u")
  for w in 256 640; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$BASE/_next/image?url=$enc&w=$w&q=75")
    if [ "$code" = "200" ]; then ok=$((ok+1)); else fail=$((fail+1)); echo "FAIL $code $u w=$w"; fi
  done
done
echo "warmed ok=$ok fail=$fail"
