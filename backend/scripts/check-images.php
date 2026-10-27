<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

/* ============================================================ */
echo "=== СВОДКА ПО ВСЕМ ТОВАРАМ ===\n\n";

$total = (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
$withImages = (int)$pdo->query(
    'SELECT COUNT(DISTINCT product_id) FROM product_images'
)->fetchColumn();
$withoutImages = (int)$pdo->query(
    'SELECT COUNT(*) FROM products p WHERE NOT EXISTS
       (SELECT 1 FROM product_images i WHERE i.product_id = p.id)'
)->fetchColumn();

echo "Всего товаров: $total\n";
echo "С картинками: $withImages\n";
echo "Без картинок: $withoutImages\n\n";

/* ============================================================ */
echo "=== ПО ТИПАМ КАРТИНОК (все media) ===\n\n";

$stats = $pdo->query(<<<SQL
    SELECT
        CASE
            WHEN media_type = 'video' THEN 'video'
            WHEN url LIKE '/uploads/%' THEN 'local'
            WHEN url LIKE 'http%' THEN 'external'
            ELSE 'other'
        END AS kind,
        COUNT(*) AS cnt
    FROM product_images
    GROUP BY kind
    ORDER BY kind
SQL)->fetchAll();

foreach ($stats as $s) {
    echo "  {$s['kind']}: {$s['cnt']}\n";
}
echo "\n";

/* ============================================================ */
echo "=== КОНФЕТЫ (type = simple) ===\n\n";

$candies = $pdo->query(<<<SQL
    SELECT p.id, p.name, p.sku,
           (SELECT url FROM product_images
            WHERE product_id = p.id AND media_type = 'image'
            ORDER BY sort_order LIMIT 1) AS cover_url
    FROM products p
    WHERE p.type = 'simple'
    ORDER BY p.id
SQL)->fetchAll();

$local = [];
$external = [];
$none = [];

foreach ($candies as $c) {
    $url = $c['cover_url'];
    if ($url === null || $url === '') {
        $none[] = $c;
    } elseif (str_starts_with($url, '/uploads/')) {
        $local[] = $c;
    } elseif (str_starts_with($url, 'http')) {
        $external[] = $c;
    } else {
        $external[] = $c; // неизвестный формат → считаем внешним
    }
}

echo "Конфет всего: " . count($candies) . "\n";
echo "  Локальные (/uploads/...): " . count($local) . "\n";
echo "  Внешние (http...): " . count($external) . "\n";
echo "  Без картинок: " . count($none) . "\n\n";

if (!empty($external)) {
    echo "--- ВНЕШНИЕ (нужно скачать и заменить) ---\n";
    foreach ($external as $c) {
        $host = parse_url($c['cover_url'], PHP_URL_HOST) ?? '?';
        echo "  id={$c['id']}  [{$host}]\n";
        echo "    name: {$c['name']}\n";
        echo "    url: {$c['cover_url']}\n";
    }
    echo "\n";
}

if (!empty($none)) {
    echo "--- БЕЗ КАРТИНОК ---\n";
    foreach ($none as $c) {
        echo "  id={$c['id']}  {$c['name']}  (sku: " . ($c['sku'] ?: '—') . ")\n";
    }
    echo "\n";
}

if (!empty($local)) {
    echo "--- ЛОКАЛЬНЫЕ (первые 10) ---\n";
    foreach (array_slice($local, 0, 10) as $c) {
        echo "  id={$c['id']}  {$c['name']}\n";
        echo "    {$c['cover_url']}\n";
    }
    if (count($local) > 10) {
        echo "  ... и ещё " . (count($local) - 10) . " локальных\n";
    }
    echo "\n";
}

/* ============================================================ */
echo "=== НАБОРЫ (type = bundle) ===\n\n";

$bundles = $pdo->query(<<<SQL
    SELECT p.id, p.name, p.sku,
           (SELECT url FROM product_images
            WHERE product_id = p.id AND media_type = 'image'
            ORDER BY sort_order LIMIT 1) AS cover_url
    FROM products p
    WHERE p.type = 'bundle'
    ORDER BY p.id
SQL)->fetchAll();

$bLocal = 0;
$bExternal = 0;
$bNone = 0;

foreach ($bundles as $b) {
    $url = $b['cover_url'];
    if ($url === null || $url === '') $bNone++;
    elseif (str_starts_with($url, '/uploads/')) $bLocal++;
    else $bExternal++;
}

echo "Наборов всего: " . count($bundles) . "\n";
echo "  Локальные: $bLocal\n";
echo "  Внешние:   $bExternal\n";
echo "  Без картинок: $bNone\n\n";

/* ============================================================ */
echo "=== ДОМЕНЫ ВНЕШНИХ КАРТИНОК (все media) ===\n\n";

$media = $pdo->query(
    "SELECT url FROM product_images WHERE url LIKE 'http%'"
)->fetchAll();

$hosts = [];
foreach ($media as $m) {
    $host = parse_url($m['url'], PHP_URL_HOST) ?? 'unknown';
    $hosts[$host] = ($hosts[$host] ?? 0) + 1;
}

if (empty($hosts)) {
    echo "  нет внешних картинок\n";
} else {
    arsort($hosts);
    foreach ($hosts as $host => $cnt) {
        echo "  $host : $cnt\n";
    }
}
echo "\n";

/* ============================================================ */
echo "=== ЛОКАЛЬНЫЕ ФАЙЛЫ НА ДИСКЕ ===\n\n";

$uploadsDir = __DIR__ . '/../../public/uploads/products';
if (is_dir($uploadsDir)) {
    $fileCount = 0;
    $totalSize = 0;
    $iter = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($uploadsDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    foreach ($iter as $f) {
        if ($f->isFile()) {
            $fileCount++;
            $totalSize += $f->getSize();
        }
    }
    echo "  Файлов: $fileCount\n";
    echo "  Общий размер: " . round($totalSize / 1024 / 1024, 2) . " MB\n";
} else {
    echo "  Папка $uploadsDir не существует\n";
}
echo "\n";

/* ============================================================ */
echo "=== БИТЫЕ ССЫЛКИ НА ЛОКАЛЬНЫЕ ФАЙЛЫ (БД говорит /uploads, файла нет) ===\n\n";

$localRefs = $pdo->query(
    "SELECT id, product_id, url FROM product_images WHERE url LIKE '/uploads/%'"
)->fetchAll();

$broken = [];
foreach ($localRefs as $r) {
    $path = __DIR__ . '/../../public' . $r['url'];
    if (!is_file($path)) {
        $broken[] = $r;
    }
}

if (empty($broken)) {
    echo "  Все локальные ссылки ведут на существующие файлы ✅\n";
} else {
    echo "  Битых: " . count($broken) . "\n";
    foreach (array_slice($broken, 0, 20) as $r) {
        echo "  image_id={$r['id']} product_id={$r['product_id']}  {$r['url']}\n";
    }
    if (count($broken) > 20) {
        echo "  ... и ещё " . (count($broken) - 20) . "\n";
    }
}
echo "\n";