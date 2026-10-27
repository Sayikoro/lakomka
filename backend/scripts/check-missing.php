<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

/* Названия, которые не нашлись */
$missing = [
    'Мармелад дЖу-дЖу-дЖув (Ju-Ju-Juv) в форме медвежат',
    'Конфеты Гранола белая',
    'Зефир жевательный',
    'Конфеты Аккондовская',
    'Мёд&Кофе',
];

/* Похожие в БД — по 2-3 значимым словам */
foreach ($missing as $name) {
    echo "=== {$name} ===\n";

    // Попытки по убыванию точности
    $parts = preg_split('/\s+/u', $name);
    $keywords = array_filter($parts, fn($w) => mb_strlen($w) >= 4);
    $keywords = array_slice(array_values($keywords), 0, 2);

    if (empty($keywords)) {
        echo "  (слишком короткое)\n\n";
        continue;
    }

    $sql = 'SELECT id, name, manufacturer FROM products WHERE ';
    $where = [];
    $params = [];
    foreach ($keywords as $k) {
        $where[] = 'name LIKE ?';
        $params[] = '%' . $k . '%';
    }
    $sql .= implode(' AND ', $where) . ' LIMIT 5';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    if (empty($rows)) {
        // Пробуем только первое слово
        $stmt = $pdo->prepare(
            'SELECT id, name, manufacturer FROM products WHERE name LIKE ? LIMIT 5'
        );
        $stmt->execute(['%' . $keywords[0] . '%']);
        $rows = $stmt->fetchAll();
    }

    if (empty($rows)) {
        echo "  НИЧЕГО НЕ НАЙДЕНО даже по первому слову\n\n";
        continue;
    }

    foreach ($rows as $r) {
        echo "  id={$r['id']}  name=[{$r['name']}]  mfr=[{$r['manufacturer']}]\n";
    }
    echo "\n";
}