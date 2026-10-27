<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

/* Слова для проверки — ищем по одному, без AND */
$words = ['Гранола', 'гранола', 'Мёд', 'Мед', 'Кофе', 'Marshmallow', 'Marshmallow', 'Marshmallow'];

foreach ($words as $w) {
    echo "=== Поиск: '{$w}' ===\n";
    $stmt = $pdo->prepare(
        'SELECT id, name, manufacturer FROM products WHERE name LIKE ? LIMIT 10'
    );
    $stmt->execute(['%' . $w . '%']);
    $rows = $stmt->fetchAll();

    if (empty($rows)) {
        echo "  нет совпадений\n\n";
        continue;
    }

    foreach ($rows as $r) {
        echo "  id={$r['id']}  name=[{$r['name']}]  mfr=[{$r['manufacturer']}]\n";
    }
    echo "\n";
}

/* Дополнительно: все конфеты, где в имени есть латинские буквы — это опечатки импорта */
echo "=== Все конфеты с латиницей в названии ===\n";
$stmt = $pdo->query(
    "SELECT id, name FROM products
     WHERE type = 'simple' AND name GLOB '*[A-Za-z]*'
     ORDER BY id LIMIT 30"
);
foreach ($stmt->fetchAll() as $r) {
    echo "  id={$r['id']}  name=[{$r['name']}]\n";
}
