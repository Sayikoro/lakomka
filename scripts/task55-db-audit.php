<?php
/* Task 55: аудит БД — все таблицы, число строк, ключевые поля. */
require_once __DIR__ . '/../backend/src/Database.php';

$pdo = Database::get();

echo "=== ТАБЛИЦЫ ===\n";
$tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
foreach ($tables as $t) {
    $n = $pdo->query("SELECT COUNT(*) FROM \"$t\"")->fetchColumn();
    printf("%-28s %d\n", $t, $n);
}

echo "\n=== ПОЛЬЗОВАТЕЛИ ===\n";
foreach ($pdo->query("SELECT id, email, role, created_at FROM users") as $u) {
    echo "  #{$u['id']} {$u['email']} [{$u['role']}] {$u['created_at']}\n";
}

echo "\n=== НАСТРОЙКИ ===\n";
foreach ($pdo->query("SELECT key, CASE WHEN key LIKE '%pass%' OR key LIKE '%secret%' OR key LIKE '%key%' THEN (CASE WHEN value IS NULL OR value='' THEN '(пусто)' ELSE '(заполнено)' END) ELSE substr(value,1,60) END AS v FROM settings ORDER BY key") as $s) {
    echo "  {$s['key']} = {$s['v']}\n";
}

echo "\n=== КАТЕГОРИИ ===\n";
foreach ($pdo->query("SELECT id, name, slug FROM categories ORDER BY id") as $c) {
    echo "  #{$c['id']} {$c['name']} ({$c['slug']})\n";
}

echo "\n=== ТОВАРЫ: итоги ===\n";
$st = $pdo->query("SELECT type, COUNT(*) n FROM products GROUP BY type");
while ($r = $st->fetch(PDO::FETCH_ASSOC)) echo "  type={$r['type']}: {$r['n']}\n";
$st = $pdo->query("SELECT is_active, COUNT(*) n FROM products GROUP BY is_active");
while ($r = $st->fetch(PDO::FETCH_ASSOC)) echo "  is_active={$r['is_active']}: {$r['n']}\n";

echo "\n=== МЕДИА ===\n";
$st = $pdo->query("SELECT kind, COUNT(*) n FROM product_images GROUP BY kind");
while ($r = $st->fetch(PDO::FETCH_ASSOC)) echo "  kind={$r['kind']}: {$r['n']}\n";
$ext = $pdo->query("SELECT COUNT(*) FROM product_images WHERE product_id NOT IN (SELECT id FROM products)")->fetchColumn();
echo "  осиротевшие media-строки: $ext\n";

echo "\n=== КОНФЕТЫ / НАБОРЫ ===\n";
try {
    $cols = $pdo->query("PRAGMA table_info(candy_sets)")->fetchAll(PDO::FETCH_COLUMN);
    echo "  candy_sets колонки: " . implode(', ', $cols) . "\n";
    foreach ($pdo->query("SELECT * FROM candy_sets LIMIT 5") as $r) {
        echo "  " . json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
    }
} catch (Throwable $e) { echo "  candy_sets: " . $e->getMessage() . "\n"; }
try {
    $cols = $pdo->query("PRAGMA table_info(candies)")->fetchAll(PDO::FETCH_COLUMN);
    echo "  candies колонки: " . implode(', ', $cols) . "\n";
    foreach ($pdo->query("SELECT * FROM candies LIMIT 5") as $r) {
        echo "  " . json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
    }
} catch (Throwable $e) { echo "  candies: " . $e->getMessage() . "\n"; }

echo "\n=== ЗАКАЗЫ ===\n";
$n = $pdo->query("SELECT COUNT(*) FROM orders")->fetchColumn();
echo "  orders: $n\n";

echo "\n=== ВЕСОВЫЕ РЕЦЕПТЫ ===\n";
try { echo "  weight_recipes: " . $pdo->query("SELECT COUNT(*) FROM weight_recipes")->fetchColumn() . "\n"; }
catch (Throwable $e) { echo "  weight_recipes: нет таблицы\n"; }
try { echo "  weight_recipe_items: " . $pdo->query("SELECT COUNT(*) FROM weight_recipe_items")->fetchColumn() . "\n"; }
catch (Throwable $e) { echo "  weight_recipe_items: нет таблицы\n"; }

echo "\n=== ТЕКСТЫ СТРАНИЦ / PDF / ФАЙЛЫ ===\n";
foreach (['page_texts','pdfs','files','pages'] as $t) {
    if (in_array($t, $tables, true)) {
        echo "  $t: " . $pdo->query("SELECT COUNT(*) FROM \"$t\"")->fetchColumn() . "\n";
    } else {
        echo "  $t: таблицы нет\n";
    }
}
