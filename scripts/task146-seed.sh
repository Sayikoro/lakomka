#!/usr/bin/env bash
# Task 146: посев галереи fabriki — текущие логотипы фабрик из
# public/uploads/brands с говорящими (русскими) именами + манифест
# .order.json (заголовок + порядок как в mockBrands).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=public/uploads/brands
DST=public/uploads/galleries/fabriki
mkdir -p "$DST"

copy_logo() { # $1 = src file, $2 = nice name
  [ -f "$SRC/$1" ] || { echo "НЕТ ФАЙЛА: $1" >&2; exit 1; }
  cp "$SRC/$1" "$DST/$2.png"
}

copy_logo konti.png            "Конти"
copy_logo mishkino.png         "Мишкино"
copy_logo krasny-oktyabr.png   "Красный Октябрь"
copy_logo nevskiy-konditer.png "Невский кондитер"
copy_logo atag.png             "Атаг"
copy_logo sladonezh.png        "Сладонеж"
copy_logo rot-front.png        "Рот Фронт"
copy_logo babaevskiy.png       "Бабаевский"
copy_logo shok-mag.png         "Шок-Маг"
copy_logo kfs.png              "КФС"
copy_logo jako.png             "Жако"
copy_logo kdv.png              "KDV"
copy_logo akkond.png           "АККонд"
copy_logo sladunitsa.png       "Сладуница"
copy_logo mars.png             "Mars"
copy_logo sweetlife.png        "SweetLife"
copy_logo biskvit.png          "Бисквит"
copy_logo sibbelka.png         "СибБелка"

cat > "$DST/.order.json" <<'JSON'
{
  "title": "Наши фабрики",
  "order": [
    "Конти.png",
    "Мишкино.png",
    "Красный Октябрь.png",
    "Невский кондитер.png",
    "Атаг.png",
    "Сладонеж.png",
    "Рот Фронт.png",
    "Бабаевский.png",
    "Шок-Маг.png",
    "КФС.png",
    "Жако.png",
    "KDV.png",
    "АККонд.png",
    "Сладуница.png",
    "Mars.png",
    "SweetLife.png",
    "Бисквит.png",
    "СибБелка.png"
  ]
}
JSON

echo "Посеяно: $(ls -A "$DST" | wc -l) файлов (18 png + .order.json) в $DST"
