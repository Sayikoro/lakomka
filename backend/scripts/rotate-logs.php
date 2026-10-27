<?php

$maxAgeDays = 7;
$storageDir = __DIR__ . '/../storage';

echo "Ротация логов старше $maxAgeDays дней\n\n";

$files = [
    'mail.log',
    'php-errors.log',
];

$threshold = time() - $maxAgeDays * 86400;
$totalRemoved = 0;

foreach ($files as $name) {
    $path = $storageDir . '/' . $name;
    if (!is_file($path)) {
        echo "  $name — нет файла\n";
        continue;
    }

    $size = filesize($path);
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        echo "  $name — не удалось прочитать\n";
        continue;
    }

    $kept = [];
    $removed = 0;
    // Формат строки в mail.log: "================ ISO8601 ================"
    // Формат в php-errors.log: "[27-Oct-2026 10:54:47 Europe/Moscow] PHP ..."
    $currentDate = null;

    foreach ($lines as $line) {
        if (preg_match('/================ (\d{4}-\d{2}-\d{2}T[^=]+) =+$/', $line, $m)) {
            $currentDate = strtotime($m[1]);
        } elseif (preg_match('/^\[(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2})/', $line, $m)) {
            $currentDate = strtotime($m[1]);
        }

        if ($currentDate !== null && $currentDate < $threshold) {
            $removed++;
            continue;
        }
        $kept[] = $line;
    }

    if ($removed > 0) {
        file_put_contents($path, implode("\n", $kept) . "\n");
        $totalRemoved += $removed;
        echo "  $name — удалено $removed строк (было " . round($size / 1024, 1) . " KB)\n";
    } else {
        echo "  $name — всё свежее\n";
    }
}

echo "\nГотово. Удалено строк: $totalRemoved\n";