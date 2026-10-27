<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$cats = [
    ['nabory',    'Наборы',      1],
    ['vip',       'VIP подарки', 2],
    ['zhest',     'Жесть',       3],
    ['igrushki',  'Игрушки',     4],
    ['karton',    'Картон',      5],
    ['meshochki', 'Мешочки',     6],
    ['tekstil',   'Текстиль',    7],
    ['tuby',      'Тубы',        8],
];

$stmt = $pdo->prepare(
    'INSERT INTO categories (slug, name, sort_order)
     VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order'
);

foreach ($cats as $c) {
    $stmt->execute($c);
}

echo "OK kategorij: " . count($cats) . "`n";