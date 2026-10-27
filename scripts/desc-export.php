<?php
// Экспорт подарков без описания → desc-batch.json (для Node-генератора описаний)
require '/home/z/my-project/backend/src/Database.php';
$pdo = Database::get();

// Стилевой пример (реальное описание из каталога), \n-литералы → реальные переводы строк
$styleExample = $pdo->query("SELECT description FROM products WHERE type='bundle' AND description<>'' ORDER BY id LIMIT 1")->fetchColumn();
$styleExample = str_replace('\n', "\n", $styleExample);
$styleExample = trim($styleExample);
file_put_contents(__DIR__ . '/desc-style-example.txt', $styleExample);

$rows = $pdo->query(
    "SELECT p.id, p.name, p.slug,
        (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS img
     FROM products p
     WHERE p.type='bundle' AND (p.description IS NULL OR p.description='')
     ORDER BY p.id"
)->fetchAll(PDO::FETCH_ASSOC);

// Состав: bundle_items.product_id → products (имена компонентов)
$compStmt = $pdo->prepare(
    "SELECT p2.name AS comp, bi.quantity
     FROM bundle_items bi JOIN products p2 ON p2.id = bi.component_id
     WHERE bi.product_id = ? ORDER BY bi.id"
);

$out = [];
$withComp = 0; $noComp = 0;
foreach ($rows as $r) {
    $items = $compStmt->execute([$r['id']]) ? $compStmt->fetchAll(PDO::FETCH_ASSOC) : [];
    $comp = [];
    foreach ($items as $it) {
        $q = (int)$it['quantity'];
        $comp[] = $it['comp'] . ($q > 1 ? ' — ' . $q . ' шт.' : '');
    }
    if ($comp) $withComp++; else $noComp++;
    $out[] = [
        'id' => (int)$r['id'],
        'name' => $r['name'],
        'slug' => $r['slug'],
        'img' => $r['img'] ?: '',
        'composition' => $comp,
    ];
}

file_put_contents(__DIR__ . '/desc-batch.json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
echo "Экспортировано: " . count($out) . " подарков (с составом: $withComp, без состава: $noComp)\n";
echo "Стилевой пример: " . mb_strlen($styleExample) . " знаков\n";
echo "Пример записи: " . json_encode($out[0], JSON_UNESCAPED_UNICODE) . "\n";
