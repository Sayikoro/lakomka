<?php
require '/home/z/my-project/backend/src/Database.php';
$pdo = Database::get();
echo "bundle_items columns: ";
foreach ($pdo->query("PRAGMA table_info(bundle_items)")->fetchAll(PDO::FETCH_ASSOC) as $c) echo $c['name'], ' ';
echo "\n\nПолный пример описания №1:\n";
$d = $pdo->query("SELECT description FROM products WHERE type='bundle' AND description<>'' ORDER BY id LIMIT 1")->fetchColumn();
echo $d, "\n";
echo "\nСколько подарков без описания имеют фото: ";
echo $pdo->query("SELECT COUNT(*) FROM products p WHERE p.type='bundle' AND (p.description IS NULL OR p.description='') AND EXISTS(SELECT 1 FROM product_images pi WHERE pi.product_id=p.id)")->fetchColumn();
echo "\nСколько без описания и без состава: ";
echo $pdo->query("SELECT COUNT(*) FROM products p WHERE p.type='bundle' AND (p.description IS NULL OR p.description='') AND NOT EXISTS(SELECT 1 FROM bundle_items bi WHERE bi.bundle_id=p.id)")->fetchColumn();
echo "\n";
