<?php
declare(strict_types=1);
// Task 61: full row-level diff live DB vs snapshot DB (clone, = Task 59 commit state)
$live = new PDO('sqlite:/home/z/my-project/backend/storage/database.sqlite');
$snap = new PDO('sqlite:/home/z/my-project/lakomka/backend/storage/database.sqlite');

$tables = $live->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);

foreach ($tables as $t) {
    $cols = array_column($live->query("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    $colsList = implode(', ', $cols);
    $pk = array_column(array_filter($live->query("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_ASSOC), fn($c) => $c['pk'] > 0), 'name');
    if (!$pk) $pk = ['rowid'];

    $dump = function (PDO $db) use ($t, $colsList) {
        $rows = [];
        foreach ($db->query("SELECT $colsList FROM $t") as $r) {
            $rows[] = $r;
        }
        return $rows;
    };
    $L = $dump($live);
    $S = $dump($snap);
    if (count($L) !== count($S)) {
        echo "TABLE $t: row count live=" . count($L) . " snap=" . count($S) . "\n";
    }
    // hash-compare row sets
    $hash = fn(array $r) => md5(json_encode($r, JSON_UNESCAPED_UNICODE));
    $ls = array_map($hash, $L);
    $ss = array_map($hash, $S);
    sort($ls); sort($ss);
    if ($ls === $ss) { echo "TABLE $t: identical\n"; continue; }

    // find differing rows by pk
    $keyOf = function (array $r) use ($pk) {
        $k = [];
        foreach ($pk as $c) $k[] = $r[$c] ?? null;
        return implode(':', $k);
    };
    $lmap = []; foreach ($L as $r) $lmap[$keyOf($r)] = $r;
    $smap = []; foreach ($S as $r) $smap[$keyOf($r)] = $r;
    $shown = 0;
    foreach ($lmap as $k => $l) {
        if (!isset($smap[$k])) { if ($shown < 12) echo "  $t [$k]: ONLY IN LIVE = " . json_encode($l, JSON_UNESCAPED_UNICODE) . "\n"; $shown++; continue; }
        $s = $smap[$k];
        $d = [];
        foreach ($l as $c => $v) if (($s[$c] ?? null) !== $v) $d[] = "$c: " . var_export($s[$c], true) . " => " . var_export($v, true);
        if ($d) { if ($shown < 12) echo "  $t [$k]: " . implode(' | ', array_slice($d, 0, 6)) . "\n"; $shown++; }
    }
    foreach ($smap as $k => $s) if (!isset($lmap[$k])) { if ($shown < 12) echo "  $t [$k]: ONLY IN SNAPSHOT\n"; $shown++; }
    echo "TABLE $t: $shown differing rows" . ($shown >= 12 ? " (показаны первые 12)" : "") . "\n";
}
