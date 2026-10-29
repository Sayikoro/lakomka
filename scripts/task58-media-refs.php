<?php
/* Task 58: сканер ссылок на media-файлы.
 * Для каждого файла в public/uploads проверяем, встречается ли его путь
 * в ЛЮБОЙ текстовой колонке ЛЮБОЙ таблицы БД (включая описания товаров,
 * settings, pdf-метаданные). Цель: отличить используемые файлы (коммитим
 * как бэкап) от мусора, оставшегося после WebP-миграции и старых импортов.
 */

require_once '/home/z/my-project/backend/src/Database.php';

$pdo = Database::get();

$publicRoot = '/home/z/my-project/public';
$uploadsRoot = $publicRoot . '/uploads';

// 1. Собираем все файлы uploads
$files = []; // rel (от public/) => size
$rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploadsRoot, FilesystemIterator::SKIP_DOTS));
foreach ($rii as $f) {
    if ($f->isFile()) {
        $rel = ltrim(substr($f->getPathname(), strlen($publicRoot)), '/');
        $files[$rel] = $f->getSize();
    }
}
echo "FILES_TOTAL\t" . count($files) . "\t" . array_sum($files) . " bytes\n";

// 2. Собираем «стог сена» — все текстовые значения всех таблиц
$tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);
$haystack = '';
foreach ($tables as $t) {
    $safe = str_replace('"', '""', $t);
    $cols = $pdo->query("PRAGMA table_info(\"$safe\")")->fetchAll(PDO::FETCH_ASSOC);
    $textCols = array_column(array_filter($cols, function ($c) {
        return preg_match('/TEXT|CHAR|CLOB|VARCHAR/i', (string) $c['type']);
    }), 'name');
    foreach ($textCols as $c) {
        $cs = str_replace('"', '""', $c);
        try {
            $vals = $pdo->query("SELECT \"$cs\" FROM \"$safe\" WHERE \"$cs\" IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
        } catch (Throwable $e) { continue; }
        foreach ($vals as $v) {
            if (is_string($v) && $v !== '') {
                $haystack .= "\n" . $v;
            }
        }
    }
}
echo "HAYSTACK_BYTES\t" . strlen($haystack) . "\n";

// 3. Формат url — сэмплы для отладки
foreach ($pdo->query("SELECT url FROM product_images LIMIT 3")->fetchAll(PDO::FETCH_COLUMN) as $u) {
    echo "SAMPLE_URL\t$u\n";
}

// 4. Классификация: файл считается используемым, если в стоге сена есть
//    его путь в любом из распространённых форматов записи
$unref = [];
$refCnt = 0; $refBytes = 0; $unrefBytes = 0;
foreach ($files as $rel => $size) {
    $noUp = preg_replace('#^uploads/#', '', $rel);
    $hit = strpos($haystack, $rel) !== false          // uploads/products/x/0.webp
        || strpos($haystack, '/' . $rel) !== false    // /uploads/...
        || strpos($haystack, $noUp) !== false;        // products/x/0.webp
    if ($hit) {
        $refCnt++;
        $refBytes += $size;
    } else {
        $unref[] = $rel;
        $unrefBytes += $size;
    }
}
printf("REFERENCED\t%d\t%d bytes\n", $refCnt, $refBytes);
printf("UNREFERENCED\t%d\t%d bytes\n", count($unref), $unrefBytes);

// 5. Группировка ненужных по каталогу
$groups = [];
foreach ($unref as $rel) {
    $parts = explode('/', $rel);
    $g = count($parts) > 2 ? $parts[0] . '/' . $parts[1] : $parts[0];
    $groups[$g] = ($groups[$g] ?? 0) + 1;
}
ksort($groups);
echo "=== UNREF GROUPS ===\n";
foreach ($groups as $g => $n) {
    echo "$g\t$n\n";
}

// 6. Полный список (для возможного удаления) — в файл рядом
file_put_contents(__DIR__ . '/task58-unref-files.txt', implode("\n", $unref) . "\n");
echo "LIST_SAVED\ttask58-unref-files.txt\n";

// 7. Сани-каунты БД для контекста
foreach (['products', 'product_images', 'categories', 'candy_sets', 'candy_set_items', 'users', 'settings'] as $t) {
    try {
        echo "DB_$t\t" . $pdo->query("SELECT COUNT(*) FROM \"$t\"")->fetchColumn() . "\n";
    } catch (Throwable $e) {
        echo "DB_$t\tMISSING\n";
    }
}
