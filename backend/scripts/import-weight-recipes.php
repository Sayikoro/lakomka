<?php
require __DIR__ . '/../src/Database.php';

/* Task 62: опциональная песочница БД (argv[3]) — для учений по восстановлению
   (импорт матрицы в копию БД, не трогая живую). Без аргумента — живая БД. */
$dbOverride = $argv[3] ?? null;
if ($dbOverride !== null && $dbOverride !== '') {
    if (!file_exists($dbOverride)) {
        fwrite(STDERR, "Sandbox DB not found: $dbOverride\n");
        exit(1);
    }
    $pdo = new PDO('sqlite:' . $dbOverride);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "SANDBOX DB: $dbOverride\n";
} else {
    $pdo = Database::get();
}

/* ============ Автоопределение разделителя ============ */
function detectDelimiter(string $path): string
{
    $fh = fopen($path, 'r');
    $first = '';
    // Ищем первую непустую строку
    while (($line = fgets($fh)) !== false) {
        if (trim($line) !== '') { $first = $line; break; }
    }
    fclose($fh);

    $commas = substr_count($first, ',');
    $semis  = substr_count($first, ';');
    $tabs   = substr_count($first, "\t");
    if ($tabs > $commas && $tabs > $semis) return "\t";
    return $semis > $commas ? ';' : ',';
}

/* ============ Нормализация названий ============ */
function normalizeName(string $s): string
{
    // 1. Нижний регистр, trim
    $s = mb_strtolower(trim($s), 'UTF-8');

    // 2. Гомоглифы — ДО уборки префикса, иначе «Конфeты» с латинской e не превратится в «конфеты»
    $homoglyphs = [
        'a' => 'а', 'e' => 'е', 'o' => 'о', 'c' => 'с', 'p' => 'р',
        'x' => 'х', 'y' => 'у', 'k' => 'к', 'm' => 'м', 't' => 'т',
        'h' => 'н', 'b' => 'в',
    ];
    $s = strtr($s, $homoglyphs);

    // 3. Типографские знаки, ё → е
    $s = str_replace(['ё', '«', '»', '"', '“', '”', '„'], ['е', '', '', '', '', '', ''], $s);

    // 4. & → и
    $s = preg_replace('/\s*&\s*/u', ' и ', $s);

    // 5. Обрезка хвоста в скобках
    $s = preg_replace('/\s*\(.*$/u', '', $s);

    // 6. Убираем префиксы-типы (теперь все кириллические — гомоглифы уже применились)
    $s = preg_replace(
        '/^(конфеты|конфета|шоколад|драже|мармелад|карамель|печенье|вафли|зефир|леденец|халва|козинак|набор)\s+/u',
        '',
        $s
    );

    // 7. Схлопываем пробелы, чистим края
    $s = preg_replace('/\s+/u', ' ', $s);
    $s = trim($s, ' -&');

    return $s;
}

/* ============ Ручные алиасы ============ */
function getAliases(): array
{
    // Ключи — уже нормализованные имена из файла.
    // Значения — точное имя в БД.
    return [
        // «Зефир жевательный» → «Зефир «Marshmallows»»
        'жевательный' => 'Зефир «Marshmallows»',

        // «Конфеты Аккондовская» → «Конфеты Аккондовская Картошка»
        'аккондовская' => 'Конфеты Аккондовская Картошка',

        // На будущее — если что-то ещё вылезет
        'пинки' => 'Конфеты Пинки Винки',
        'пинки винки' => 'Конфеты Пинки Винки',
    ];
}

/* ============ Запуск ============ */
$csvPath = $argv[1] ?? null;
$mode = $argv[2] ?? '--dry-run';

if (!$csvPath || !file_exists($csvPath)) {
    fwrite(STDERR, "Ukazhi put k CSV: php scripts/import-weight-recipes.php lakomka2027.csv [--dry-run|--apply]\n");
    exit(1);
}

if (!in_array($mode, ['--dry-run', '--apply'], true)) {
    fwrite(STDERR, "Rezhim: --dry-run ili --apply\n");
    exit(1);
}

$delim = detectDelimiter($csvPath);
echo "CSV: $csvPath\n";
echo "Razdelitel: " . ($delim === "\t" ? "TAB" : $delim) . "\n";
echo "Rezhim: $mode\n\n";

$handle = fopen($csvPath, 'r');

// Пропускаем пустые строки до заголовков
$header = null;
$skipCount = 0;
while (($row = fgetcsv($handle, 0, $delim, '"', '')) !== false) {
    if ($row === [null]) { $skipCount++; continue; }
    $nonEmpty = array_filter($row, fn($v) => $v !== null && trim($v) !== '');
    if (count($nonEmpty) < 2) { $skipCount++; continue; }
    $header = $row;
    break;
}

if (!$header) {
    fwrite(STDERR, "Ne najdena stroka s zagolovkami\n");
    exit(1);
}

if (isset($header[0])) $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
$header = array_map('trim', $header);

if ($skipCount > 0) {
    echo "Propushcheno pustyh strok: $skipCount\n";
}
echo "Zagolovki: " . implode(' | ', array_filter($header, fn($h) => $h !== '')) . "\n\n";

$idx = array_flip($header);

$colName = $idx['НАИМЕНОВАНИЕ'] ?? $idx['Наименование'] ?? $idx['наименование'] ?? null;
$colMan  = $idx['ПРОИЗВОДИТЕЛЬ'] ?? $idx['Производитель'] ?? $idx['производитель'] ?? null;

if ($colName === null) {
    fwrite(STDERR, "Ne najdena kolonka NAIMENOVANIE. Est: " . implode(', ', array_filter($header)) . "\n");
    exit(1);
}

// Колонки-граммовки
$weightCols = [];
foreach ($header as $i => $h) {
    $h = trim($h);
    if ($h !== '' && ctype_digit($h)) {
        $weightCols[$i] = (int)$h;
    }
}

if (empty($weightCols)) {
    fwrite(STDERR, "Ne najdeny kolonki-grammovki (200, 400, ...)\n");
    exit(1);
}

echo "Grammovki: " . implode(', ', array_values($weightCols)) . "\n\n";

// Индекс существующих конфет
$allProducts = $pdo->query('SELECT id, name FROM products')->fetchAll();
$byExact = [];
$byNorm  = [];

foreach ($allProducts as $p) {
    $byExact[$p['name']] = (int)$p['id'];
    $byNorm[normalizeName($p['name'])] = (int)$p['id'];
}

$aliases = getAliases();

$recipeRows = [];
$missing = [];
$totalCells = 0;
$rowsProcessed = 0;
$resolved = 0;

while (($row = fgetcsv($handle, 0, $delim, '"', '')) !== false) {
    if ($row === [null]) continue;
    if (count(array_filter($row, fn($v) => $v !== null && trim($v) !== '')) === 0) continue;

    $name = trim($row[$colName] ?? '');
    if ($name === '') continue;

    $rowsProcessed++;

    // Поиск product_id
    $pid = null;
    $norm = normalizeName($name);

    if (isset($byExact[$name])) {
        $pid = $byExact[$name];
    } elseif (isset($aliases[$norm]) && isset($byExact[$aliases[$norm]])) {
        $pid = $byExact[$aliases[$norm]];
    } elseif (isset($byNorm[$norm])) {
        $pid = $byNorm[$norm];
    } elseif (isset($aliases[$norm]) && isset($byNorm[normalizeName($aliases[$norm])])) {
        $pid = $byNorm[normalizeName($aliases[$norm])];
    }

    if (!$pid) {
        foreach ($weightCols as $i => $w) {
            $qty = trim($row[$i] ?? '');
            if ($qty === '' || $qty === '0') continue;
            $missing[] = "$name (вес $w)";
        }
        continue;
    }

    $resolved++;

    foreach ($weightCols as $i => $w) {
        $val = trim($row[$i] ?? '');
        if ($val === '' || !is_numeric($val)) continue;
        $qty = (int)$val;
        if ($qty <= 0) continue;

        if (!isset($recipeRows[$w])) $recipeRows[$w] = [];
        $recipeRows[$w][$pid] = $qty;
        $totalCells++;
    }
}
fclose($handle);

$totalWeights = count($recipeRows);
$totalEntries = array_sum(array_map('count', $recipeRows));

echo "Strok obrabotano: $rowsProcessed\n";
echo "Konfet najdeno v BD: $resolved iz $rowsProcessed\n";
echo "Grammovok: $totalWeights\n";
echo "Zapisej (konfeta x grammovka): $totalEntries\n";

if (!empty($missing)) {
    $uniqMissing = array_unique($missing);
    echo "\nNE NAJDENO v BD (" . count($uniqMissing) . " pozicij):\n";
    foreach (array_slice($uniqMissing, 0, 30) as $m) {
        echo "  - $m\n";
    }
    if (count($uniqMissing) > 30) {
        echo "  ... i eshcho " . (count($uniqMissing) - 30) . "\n";
    }
}

if ($mode === '--dry-run') {
    echo "\n[DRY-RUN] Nichem ne izmeneno. Zapusti s --apply chtoby primenit.\n";
    exit(0);
}

if ($totalEntries === 0) {
    fwrite(STDERR, "\nNichego ne zagruzheno (0 zapisej). Prover zagolovki i soderzhimoe.\n");
    exit(1);
}

echo "\nPrimenyayu...\n";
$pdo->exec('BEGIN IMMEDIATE');
try {
    $pdo->exec('DELETE FROM weight_recipes');

    $ins = $pdo->prepare('INSERT INTO weight_recipes (weight_g, product_id, quantity) VALUES (?, ?, ?)');
    foreach ($recipeRows as $w => $map) {
        foreach ($map as $pid => $qty) {
            $ins->execute([$w, $pid, $qty]);
        }
    }

    $pdo->exec('COMMIT');
    echo "OK: zagruzheno $totalEntries zapisej\n";
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}