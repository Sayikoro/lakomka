<?php
require '/home/z/my-project/backend/src/Database.php';
$pdo = Database::get();
echo "=== Подарки (bundle) без описания ===\n";
$n = $pdo->query("SELECT COUNT(*) FROM products WHERE type='bundle' AND (description IS NULL OR description='')")->fetchColumn();
echo "Всего без описания: $n\n";
$rows = $pdo->query("SELECT p.id, p.name, p.slug, (SELECT url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort_order LIMIT 1) img FROM products p WHERE p.type='bundle' AND (p.description IS NULL OR p.description='') ORDER BY p.id LIMIT 8")->fetchAll(PDO::FETCH_ASSOC);
foreach ($rows as $r) echo "  #{$r['id']} {$r['name']} | /product/{$r['slug']} | img: " . ($r['img'] ? substr($r['img'],0,70) : 'НЕТ') . "\n";
echo "\n=== Пример существующего описания (стиль) ===\n";
$d = $pdo->query("SELECT name, description FROM products WHERE type='bundle' AND description IS NOT NULL AND description<>'' ORDER BY id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
echo $d['name'], ":\n", mb_substr($d['description'], 0, 500), "...\n";
echo "\n=== Состав одного из подарков без описания ===\n";
$c = $pdo->query("SELECT p.name, p2.name AS comp, p2.component_manufacturer, bi.quantity FROM products p JOIN bundle_items bi ON bi.bundle_id=p.id JOIN products p2 ON p2.id=bi.component_id WHERE p.type='bundle' AND (p.description IS NULL OR p.description='') ORDER BY p.id LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
foreach ($c as $r) echo "  {$r['name']} <- {$r['comp']}" . ($r['component_manufacturer'] ? " ({$r['component_manufacturer']})" : "") . " x{$r['quantity']}\n";
