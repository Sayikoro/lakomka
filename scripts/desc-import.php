<?php
// Импорт сгенерированных описаний → products.description
// + починка старых описаний: литеральные "\n" → реальные переводы строк (фронт рендерит whitespace-pre-line)
require '/home/z/my-project/backend/src/Database.php';
$pdo = Database::get();

$resultsFile = '/home/z/my-project/scripts/desc-results.jsonl';
if (!file_exists($resultsFile)) { echo "Нет результатов\n"; exit(1); }

$stmt = $pdo->prepare("UPDATE products SET description = ? WHERE id = ? AND (description IS NULL OR description = '')");

$ok = 0; $skip = 0; $fail = 0; $failList = [];
foreach (file($resultsFile) as $line) {
    $line = trim($line);
    if (!$line) continue;
    $d = json_decode($line, true);
    if (!$d) continue;
    if (empty($d['ok'])) { $fail++; $failList[] = '#' . $d['id'] . ' ' . $d['name']; continue; }

    $text = $d['description'];
    // страховка от markdown-мусора
    $text = str_replace(['**', '##'], '', $text);
    $text = preg_replace("/\n{3,}/", "\n\n", trim($text));

    $stmt->execute([$text, $d['id']]);
    if ($stmt->rowCount() > 0) $ok++; else $skip++;
}

echo "Записано описаний: $ok\nПропущено (уже есть описание): $skip\nОшибок генерации: $fail\n";
if ($failList) echo "Не удалось: " . implode(', ', array_slice($failList, 0, 10)) . (count($failList) > 10 ? " …" : "") . "\n";

// Починка старых описаний с литеральными \n
$fixStmt = $pdo->prepare("UPDATE products SET description = REPLACE(description, '\\n', char(10)) WHERE description LIKE '%\\n%' ESCAPE '\\' AND length(description) > 0");
$fixed = 0;
foreach ($pdo->query("SELECT id FROM products WHERE description LIKE '%\\n%' ESCAPE '\\'")->fetchAll(PDO::FETCH_COLUMN) as $id) {
    $old = $pdo->query("SELECT description FROM products WHERE id = " . (int)$id)->fetchColumn();
    $new = str_replace('\\n', "\n", $old);
    $upd = $pdo->prepare("UPDATE products SET description = ? WHERE id = ?");
    $upd->execute([$new, (int)$id]);
    if ($upd->rowCount() > 0) $fixed++;
}
echo "Старых описаний починено (литеральные \\n → переводы строк): $fixed\n";

// Итог по каталогу
$left = $pdo->query("SELECT COUNT(*) FROM products WHERE type='bundle' AND (description IS NULL OR description='')")->fetchColumn();
echo "Подарков без описания осталось: $left\n";
