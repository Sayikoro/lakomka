#!/usr/bin/env python3
"""Синк публичных данных продакшена lakomkakhv.ru → dev-БД песочницы.

Зачем: витрина собирается статически — next build запекает страницы товаров,
категории, sitemap и настройки из dev-БД (через PHP-API :8000). Закоммиченная
backend/storage/database.sqlite — урезанная dev-фикстура (товары max id 489),
продакшен живёт в другом наборе (slug'и 49xx–53xx). Сборка на фикстуре
испортила бы каталог продакшена (запечённые карточки/страницы чужих товаров).
Скрипт тянет ТОЛЬКО публичные данные (магазин/категории/настройки/галерея
фабрик) через публичный API и вливает их в dev-БД. Заказы, пользователи,
SMTP и прочее приватное не трогаются.

Перед запуском: PHP-сервер :8000 остановить (он открывает sqlite на каждый
запрос — подмена файла под живым процессом в прошлый раз дала «франкенштейна»).
После: проверить /api/products (:8000) и запустить MODE=both сборку.
"""
import json
import os
import shutil
import sqlite3
import sys
import urllib.request

PROD = "https://lakomkakhv.ru"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "backend", "storage", "database.sqlite")
GAL_ROOT = os.path.join(ROOT, "backend", "public", "uploads", "galleries")

PRODUCT_COLS = [
    "id", "legacy_wc_id", "sku", "slug", "name", "description", "manufacturer",
    "type", "price_kopecks", "old_price_kopecks", "category_id",
    "packaging_material", "video_url", "legacy_slug", "weight_g", "length_cm",
    "width_cm", "height_cm", "recipe_weight_g", "show_in_catalog",
    "is_published", "stock_qty", "created_at", "deleted_at",
]
CATEGORY_COLS = ["id", "slug", "name", "sort_order", "meta_title",
                 "meta_description", "seo_text"]


def fetch(path):
    req = urllib.request.Request(PROD + path, headers={"User-Agent": "lakomka-sync/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def j(v):
    """None → NULL, остальное как есть (строки/числа)."""
    return v


def main():
    print("— тяну продакшен…")
    products = fetch("/api/products?limit=500")["data"]
    categories = fetch("/api/categories")["data"]
    settings = fetch("/api/settings/public")["data"]
    texts = settings.pop("texts", {}) or {}
    snow = settings.pop("snow", {}) or {}
    gal_slug = "fabriki"  # brands_gallery на проде пуст → DEFAULT_BRANDS_GALLERY
    gallery = fetch(f"/api/galleries/{gal_slug}")["data"]

    print(f"  товаров: {len(products)}, категорий: {len(categories)}, "
          f"текстов-переопределений: {len(texts)}, картинок фабрики: {len(gallery['items'])}")

    if not products or not categories:
        sys.exit("пустой ответ API — прерываю, БД не трогаю")

    db = sqlite3.connect(DB)
    c = db.cursor()

    # --- товары + медиа (полная замена публичного набора) ---
    c.execute("DELETE FROM product_images")
    c.execute("DELETE FROM products")
    img_seen = set()
    for p in products:
        row = [j(p.get(col)) for col in PRODUCT_COLS]
        c.execute(
            f"INSERT INTO products ({', '.join(PRODUCT_COLS)}) "
            f"VALUES ({', '.join('?' * len(PRODUCT_COLS))})", row)
        for m in (p.get("media") or []):
            if m["url"] in img_seen:
                continue
            img_seen.add(m["url"])
            c.execute(
                "INSERT INTO product_images (id, product_id, url, alt, media_type, sort_order) "
                "VALUES (?,?,?,?,?,?)",
                (m.get("id"), p["id"], m["url"], m.get("alt") or "",
                 m.get("type") or "image", m.get("sort_order") or 0))

    # --- категории (полная замена: у фикстуры те же id 1–8, но чужие тексты) ---
    c.execute("DELETE FROM categories")
    for cat in categories:
        c.execute(
            f"INSERT INTO categories ({', '.join(CATEGORY_COLS)}) "
            f"VALUES ({', '.join('?' * len(CATEGORY_COLS))})",
            [j(cat.get(col)) for col in CATEGORY_COLS])

    # --- настройки: только публичные ключи витрины ---
    bool_keys = {"hero_slider_enabled", "card_video_enabled",
                 "newyear_counter_enabled", "quick_view_enabled"}
    json_keys = {"hero_slides"}
    snow_map = {  # ответ snow{} → отдельные строки snow_* (формат AdminSettingsController)
        "enabled": ("snow_enabled", lambda v: "1" if v else "0"),
        "count": ("snow_count", str),
        "count_mobile": ("snow_count_mobile", str),
        "speed": ("snow_speed", str),
        "size": ("snow_size", str),
        "color": ("snow_color", str),
        "flake": ("snow_flake", str),
    }
    upserts = []
    for k, v in settings.items():
        if k in bool_keys:
            upserts.append((k, "1" if v else "0"))
        elif k in json_keys:
            upserts.append((k, json.dumps(v, ensure_ascii=False)))
        else:
            upserts.append((k, "" if v is None else str(v)))
    for src, (dst, conv) in snow_map.items():
        if src in snow:
            upserts.append((dst, conv(snow[src])))
    for k, v in texts.items():
        upserts.append(("text_" + k, str(v)))
    for k, v in upserts:
        c.execute(
            "INSERT INTO settings (key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v))

    db.commit()

    # --- галерея фабрик: имена файлов + порядок; файлы-пустышки (медиа живёт
    #     на проде, локально нужны только имена/порядок для запекания) ---
    gal_dir = os.path.join(GAL_ROOT, gal_slug)
    if os.path.isdir(gal_dir):
        shutil.rmtree(gal_dir)
    os.makedirs(gal_dir)
    names = [os.path.basename(it["url"]) for it in gallery["items"]]
    for name in names:
        open(os.path.join(gal_dir, name), "wb").close()
    with open(os.path.join(gal_dir, ".order.json"), "w", encoding="utf-8") as f:
        json.dump({"title": gallery.get("title") or gal_slug, "order": names},
                  f, ensure_ascii=False)

    # --- верификация ---
    n_prod = c.execute("SELECT count(*) FROM products").fetchone()[0]
    n_img = c.execute("SELECT count(*) FROM product_images").fetchone()[0]
    n_cat = c.execute("SELECT count(*) FROM categories").fetchone()[0]
    n_txt = c.execute("SELECT count(*) FROM settings WHERE key LIKE 'text\\_%' ESCAPE '\\'").fetchone()[0]
    sample = c.execute(
        "SELECT slug, name, price_kopecks FROM products WHERE slug='lakomka-5305'"
    ).fetchone()
    print(f"— в dev-БД: товаров {n_prod}, медиа {n_img}, категорий {n_cat}, "
          f"текстов {n_txt}")
    print(f"— контроль (lakomka-5305): {sample}")
    if n_prod != len(products) or not sample:
        sys.exit("СИНК НЕ СОШЁЛСЯ — проверить API")
    print("OK: синк завершён")
    db.close()


if __name__ == "__main__":
    main()
