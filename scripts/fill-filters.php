<?php
/**
 * Заполнение данных для фильтров каталога:
 *  1) recipe_weight_g — вес подарка (bundle) по совпадению состава с weight_recipes.
 *     Точное совпадение = вес рецепта; иначе минимальное число отличий, если <= 2 позиций.
 *  2) packaging_material — тип упаковки из категории:
 *     karton→cardboard, zhest→tin, tekstil→textile, tuby→tube, meshochki→pouch.
 *
 * Идемпотентен: можно запускать повторно (после импорта CSV рецептов/товаров).
 * Запуск: php scripts/fill-filters.php
 */

$db = new PDO('sqlite:' . __DIR__ . '/../backend/storage/database.sqlite');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

/* ---------- 1. Веса подарков по рецептам ---------- */
$recipes = [];
foreach ($db->query('SELECT weight_g, product_id, quantity FROM weight_recipes') as $r) {
    $recipes[(int)$r['weight_g']][(int)$r['product_id']] = (int)$r['quantity'];
}
if (!$recipes) {
    echo "weight_recipes пуста — веса не проставлены\n";
} else {
    $upd = $db->prepare('UPDATE products SET recipe_weight_g = ? WHERE id = ?');
    $exact = 0; $fuzzy = 0; $none = 0; $noItems = 0;
    $weightsByBundle = [];

    $bundles = $db->query("SELECT id, name FROM products WHERE type='bundle'")->fetchAll();
    foreach ($bundles as $b) {
        $st = $db->prepare('SELECT component_id, quantity FROM bundle_items WHERE product_id = ?');
        $st->execute([$b['id']]);
        $items = [];
        foreach ($st->fetchAll() as $it) {
            $items[(int)$it['component_id']] = (int)$it['quantity'];
        }
        if (!$items) { $noItems++; continue; }

        $hit = null; $bestDiff = PHP_INT_MAX; $bestW = null;
        foreach ($recipes as $w => $map) {
            if ($map == $items) { $hit = $w; break; }
            // число отличий: позиции рецепта, которых нет/с другой qty + лишние в подарке
            $diff = 0;
            foreach ($map as $pid => $q) {
                if (!isset($items[$pid]) || $items[$pid] !== $q) $diff++;
            }
            foreach ($items as $pid => $q) {
                if (!isset($map[$pid])) $diff++;
            }
            if ($diff < $bestDiff) { $bestDiff = $diff; $bestW = $w; }
        }

        if ($hit !== null) {
            $upd->execute([$hit, $b['id']]);
            $exact++; $weightsByBundle[$b['id']] = $hit;
        } elseif ($bestW !== null && $bestDiff <= 2) {
            $upd->execute([$bestW, $b['id']]);
            $fuzzy++;
            $weightsByBundle[$b['id']] = $bestW;
            echo "  ≈ [{$b['id']}] {$b['name']} → {$bestW} г (отличий: {$bestDiff})\n";
        } else {
            $none++;
            echo "  ✗ [{$b['id']}] {$b['name']} — рецепт не подобран (ближайший diff: {$bestDiff})\n";
        }
    }
    echo "Веса: точно={$exact}, с допуском≤2={$fuzzy}, не подобрано={$none}, без состава={$noItems}\n";

    // сводка по весам
    $summary = array_count_values($weightsByBundle);
    ksort($summary);
    foreach ($summary as $w => $c) echo "  {$w} г → {$c} шт.\n";
}

/* ---------- 2. Тип упаковки из категории ---------- */
$map = [
    'karton'    => 'cardboard',
    'zhest'     => 'tin',
    'tekstil'   => 'textile',
    'tuby'      => 'tube',
    'meshochki' => 'pouch',
];
$filled = 0;
$stmt = $db->query("
    SELECT p.id, c.slug AS cat
    FROM products p
    JOIN categories c ON c.id = p.category_id
");
$up = $db->prepare('UPDATE products SET packaging_material = ? WHERE id = ?');
foreach ($stmt as $row) {
    $cat = $row['cat'];
    if (!isset($map[$cat])) continue;
    $up->execute([$map[$cat], $row['id']]);
    $filled++;
}
echo "packaging_material заполнен: {$filled} товаров\n";

/* ---------- Итог ---------- */
echo "\n=== Проверка ===\n";
foreach ($db->query("
    SELECT packaging_material, COUNT(*) c FROM products
    WHERE type='bundle' AND show_in_catalog=1
    GROUP BY packaging_material
") as $r) {
    echo "  упаковка [" . ($r['packaging_material'] ?? 'NULL') . "] = {$r['c']}\n";
}
foreach ($db->query("
    SELECT recipe_weight_g, COUNT(*) c FROM products
    WHERE type='bundle' AND show_in_catalog=1
    GROUP BY recipe_weight_g ORDER BY recipe_weight_g
") as $r) {
    echo "  вес " . ($r['recipe_weight_g'] ?? 'NULL') . " г = {$r['c']}\n";
}
