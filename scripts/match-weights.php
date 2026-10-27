<?php
// Сопоставление состава подарков (bundle_items) с весовыми рецептурами (weight_recipes)
$db = new PDO('sqlite:' . __DIR__ . '/../backend/storage/database.sqlite');

// карты рецептов: weight_g => [pid => qty]
$recipes = [];
foreach ($db->query('SELECT weight_g, product_id, quantity FROM weight_recipes') as $r) {
    $recipes[(int)$r['weight_g']][(int)$r['product_id']] = (int)$r['quantity'];
}

$matched = 0; $unmatched = 0; $wcount = []; $unmatchedIds = [];
$st = $db->query("SELECT id, name FROM products WHERE type='bundle'");
$bundles = $st->fetchAll();
foreach ($bundles as $b) {
    $st2 = $db->prepare('SELECT component_id, quantity FROM bundle_items WHERE product_id = ?');
    $st2->execute([$b['id']]);
    $items = [];
    foreach ($st2->fetchAll() as $it) {
        $items[(int)$it['component_id']] = (int)$it['quantity'];
    }
    $hit = null;
    foreach ($recipes as $w => $map) {
        if ($map == $items) { $hit = $w; break; }
    }
    if ($hit !== null) { $matched++; $wcount[$hit] = ($wcount[$hit] ?? 0) + 1; }
    else {
        $unmatched++;
        if (count($unmatchedIds) < 10) $unmatchedIds[] = $b['id'] . ' ' . $b['name'] . ' (позиций: ' . count($items) . ')';
    }
}
echo "bundles: " . count($bundles) . PHP_EOL;
echo "совпало с рецептом: $matched, не совпало: $unmatched" . PHP_EOL;
ksort($wcount);
foreach ($wcount as $w => $c) echo "  $w г → $c подарков" . PHP_EOL;
if ($unmatchedIds) {
    echo PHP_EOL . "примеры без совпадения:" . PHP_EOL;
    foreach ($unmatchedIds as $u) echo "  $u" . PHP_EOL;
}
// пустые составы?
$empty = 0;
foreach ($bundles as $b) {
    $st3 = $db->prepare('SELECT COUNT(*) FROM bundle_items WHERE product_id = ?');
    $st3->execute([$b['id']]);
    if (!$st3->fetchColumn()) $empty++;
}
echo PHP_EOL . "подарков с ПУСТЫМ составом: $empty" . PHP_EOL;
