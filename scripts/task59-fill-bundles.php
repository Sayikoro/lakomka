<?php
/* Task 59: восстановление составов подарков из весовой матрицы.
 *
 * Идея пользователя: у каждого подарка (type=bundle) есть weight_g, он на 100%
 * совпадает с граммовками weight_recipes (13 весов, 728 ячеек) — подставляем
 * каждому подарку состав его веса. Семантика = AdminWeightRecipeController::
 * fillBundleByWeight (mode=replace): DELETE bundle_items → INSERT матрицы
 * → products.recipe_weight_g = вес.
 *
 * Фаза 2: фильтр «Состав» витрины читает candy_sets (is_filter=1) — создаём
 * по набору на каждую конфету (имя набора = имя конфеты), чтобы фильтр снова
 * работал гранулярно. Идемпотентно: только если candy_sets пуст.
 *
 * Запуск: --dry-run | --apply
 */

require_once '/home/z/my-project/backend/src/Database.php';

$pdo = Database::get();
$dry = in_array('--dry-run', $argv, true);
echo $dry ? "MODE: dry-run\n" : "MODE: APPLY\n";

/* ---------- Фаза 1: bundle_items по весу ---------- */

$matrix = []; // weight_g => [product_id => quantity]
foreach ($pdo->query('SELECT weight_g, product_id, quantity FROM weight_recipes') as $r) {
    $matrix[(int)$r['weight_g']][(int)$r['product_id']] = (int)$r['quantity'];
}
echo 'matrix: ' . count($matrix) . " граммовок\n";

$bundles = $pdo->query(
    "SELECT id, name, slug, weight_g FROM products WHERE type = 'bundle' ORDER BY id"
)->fetchAll();
echo 'bundles: ' . count($bundles) . "\n";

$filled = 0; $unchanged = 0; $rowsTotal = 0; $skipped = [];

$pdo->exec('BEGIN IMMEDIATE');
try {
    $del = $pdo->prepare('DELETE FROM bundle_items WHERE product_id = ?');
    $ins = $pdo->prepare(
        'INSERT INTO bundle_items (product_id, component_id, quantity) VALUES (?, ?, ?)
         ON CONFLICT(product_id, component_id) DO UPDATE SET quantity = excluded.quantity'
    );
    $upd = $pdo->prepare('UPDATE products SET recipe_weight_g = ? WHERE id = ?');
    $cur = $pdo->prepare('SELECT component_id, quantity FROM bundle_items WHERE product_id = ?');

    foreach ($bundles as $b) {
        $w = (int)$b['weight_g'];
        if (!isset($matrix[$w]) || $w <= 0) {
            $skipped[] = $b['name'] . ' [' . $w . ' г]';
            continue;
        }
        $recipe = $matrix[$w];

        // уже совпадает? (экономия записи, как в контроллере)
        $cur->execute([(int)$b['id']]);
        $current = [];
        foreach ($cur->fetchAll() as $c) {
            $current[(int)$c['component_id']] = (int)$c['quantity'];
        }
        $same = count($current) === count($recipe);
        if ($same) {
            foreach ($recipe as $pid => $q) {
                if (!isset($current[$pid]) || $current[$pid] !== $q) { $same = false; break; }
            }
        }

        $upd->execute([$w, (int)$b['id']]);
        if ($same) {
            $unchanged++;
            continue;
        }
        if (!$dry) {
            $del->execute([(int)$b['id']]);
            foreach ($recipe as $pid => $q) {
                $ins->execute([(int)$b['id'], $pid, $q]);
            }
        }
        $filled++;
        $rowsTotal += count($recipe);
    }

    $pdo->exec($dry ? 'ROLLBACK' : 'COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, 'ERROR phase1: ' . $e->getMessage() . "\n");
    exit(1);
}

echo "phase1: filled=$filled (+$rowsTotal строк), unchanged=$unchanged, skipped=" . count($skipped) . "\n";
foreach (array_slice($skipped, 0, 10) as $s) echo "  SKIP: $s\n";

/* ---------- Фаза 2: фильтры «Состав» (набор на каждую конфету) ---------- */

$existingSets = (int)$pdo->query('SELECT COUNT(*) FROM candy_sets')->fetchColumn();
if ($existingSets > 0) {
    echo "phase2: candy_sets уже содержит $existingSets наборов — создание пропущено\n";
} else {
    $candies = $pdo->query(
        "SELECT id, name FROM products WHERE type = 'recipe' ORDER BY name COLLATE NOCASE"
    )->fetchAll();
    try {
        $pdo->exec('BEGIN IMMEDIATE');
        $insSet = $pdo->prepare('INSERT INTO candy_sets (name, is_filter) VALUES (?, 1)');
        $insItem = $pdo->prepare('INSERT INTO candy_set_items (set_id, product_id, quantity) VALUES (?, ?, 1)');
        foreach ($candies as $c) {
            $insSet->execute([$c['name']]);
            $insItem->execute([(int)$pdo->lastInsertId(), (int)$c['id']]);
        }
        $pdo->exec($dry ? 'ROLLBACK' : 'COMMIT');
        echo 'phase2: создано наборов-фильтров: ' . count($candies) . " (по одному на конфету, is_filter=1)\n";
    } catch (Throwable $e) {
        $pdo->exec('ROLLBACK');
        fwrite(STDERR, 'ERROR phase2: ' . $e->getMessage() . "\n");
        exit(1);
    }
}

/* ---------- Контроль ---------- */
if (!$dry) {
    echo "---- контроль ----\n";
    echo 'bundle_items rows: ' . $pdo->query('SELECT COUNT(*) FROM bundle_items')->fetchColumn() . "\n";
    echo 'bundles with composition: ' . $pdo->query('SELECT COUNT(DISTINCT product_id) FROM bundle_items')->fetchColumn() . "\n";
    echo 'recipe_weight_g set: ' . $pdo->query("SELECT COUNT(*) FROM products WHERE type='bundle' AND recipe_weight_g > 0")->fetchColumn() . "\n";
    echo 'candy_sets: ' . $pdo->query('SELECT COUNT(*) FROM candy_sets')->fetchColumn() . "\n";
    echo 'candy_set_items: ' . $pdo->query('SELECT COUNT(*) FROM candy_set_items')->fetchColumn() . "\n";
    $check = $pdo->query('PRAGMA integrity_check')->fetchColumn();
    echo "integrity: $check\n";
}
