<?php

class RecipeCsvParser
{
    public static function detectDelimiter(string $path): string
    {
        $fh = fopen($path, 'r');
        $first = '';
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

    public static function normalizeName(string $s): string
    {
        $s = mb_strtolower(trim($s), 'UTF-8');

        $homoglyphs = [
            'a' => 'а', 'e' => 'е', 'o' => 'о', 'c' => 'с', 'p' => 'р',
            'x' => 'х', 'y' => 'у', 'k' => 'к', 'm' => 'м', 't' => 'т',
            'h' => 'н', 'b' => 'в',
        ];
        $s = strtr($s, $homoglyphs);

        $s = str_replace(['ё', '«', '»', '"', '“', '”', '„'], ['е', '', '', '', '', '', ''], $s);
        $s = preg_replace('/\s*&\s*/u', ' и ', $s);
        $s = preg_replace('/\s*\(.*$/u', '', $s);
        $s = preg_replace(
            '/^(конфеты|конфета|шоколад|драже|мармелад|карамель|печенье|вафли|зефир|леденец|халва|козинак|набор)\s+/u',
            '',
            $s
        );
        $s = preg_replace('/\s+/u', ' ', $s);
        return trim($s, ' -&');
    }

    public static function aliases(): array
    {
        return [
            'жевательный' => 'Зефир «Marshmallows»',
            'аккондовская' => 'Конфеты Аккондовская Картошка',
            'пинки' => 'Конфеты Пинки Винки',
            'пинки винки' => 'Конфеты Пинки Винки',
        ];
    }

    /**
     * @return array{
     *   delimiter: string,
     *   weights: int[],
     *   rows: array<int, array<int, int>>,
     *   product_images: array<int, string>,  // pid => filename (базовое имя)
     *   missing: string[],
     *   rows_processed: int,
     *   resolved: int,
     *   total_entries: int
     * }
     */
    public static function parse(string $path, PDO $pdo): array
    {
        $delim = self::detectDelimiter($path);
        $handle = fopen($path, 'r');
        if (!$handle) throw new RuntimeException('Не удалось открыть CSV');

        $header = null;
        while (($row = fgetcsv($handle, 0, $delim, '"', '')) !== false) {
            if ($row === [null]) continue;
            $nonEmpty = array_filter($row, fn($v) => $v !== null && trim($v) !== '');
            if (count($nonEmpty) < 2) continue;
            $header = $row;
            break;
        }
        if (!$header) {
            fclose($handle);
            throw new RuntimeException('Не найдены заголовки в CSV');
        }

        if (isset($header[0])) $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
        $header = array_map('trim', $header);
        $idx = array_flip($header);

        $colName  = $idx['НАИМЕНОВАНИЕ'] ?? $idx['Наименование'] ?? $idx['наименование'] ?? null;
        $colImage = $idx['КАРТИНКА'] ?? $idx['Картинка'] ?? $idx['картинка'] ?? null;
        if ($colName === null) {
            fclose($handle);
            throw new RuntimeException('Нет колонки НАИМЕНОВАНИЕ');
        }

        $weightCols = [];
        foreach ($header as $i => $h) {
            if ($h !== '' && ctype_digit($h)) $weightCols[$i] = (int)$h;
        }
        if (empty($weightCols)) {
            fclose($handle);
            throw new RuntimeException('Нет колонок с граммовками (200, 400, ...)');
        }

        $allProducts = $pdo->query('SELECT id, name FROM products')->fetchAll();
        $byExact = [];
        $byNorm = [];
        foreach ($allProducts as $p) {
            $byExact[$p['name']] = (int)$p['id'];
            $byNorm[self::normalizeName($p['name'])] = (int)$p['id'];
        }
        $aliases = self::aliases();

        $recipeRows = [];
        $productImages = [];
        $missing = [];
        $rowsProcessed = 0;
        $resolved = 0;

        while (($row = fgetcsv($handle, 0, $delim, '"', '')) !== false) {
            if ($row === [null]) continue;
            if (count(array_filter($row, fn($v) => $v !== null && trim($v) !== '')) === 0) continue;
            $name = trim($row[$colName] ?? '');
            if ($name === '') continue;
            $rowsProcessed++;

            $pid = null;
            $norm = self::normalizeName($name);
            if (isset($byExact[$name])) {
                $pid = $byExact[$name];
            } elseif (isset($aliases[$norm]) && isset($byExact[$aliases[$norm]])) {
                $pid = $byExact[$aliases[$norm]];
            } elseif (isset($byNorm[$norm])) {
                $pid = $byNorm[$norm];
            } elseif (isset($aliases[$norm]) && isset($byNorm[self::normalizeName($aliases[$norm])])) {
                $pid = $byNorm[self::normalizeName($aliases[$norm])];
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

            if ($colImage !== null) {
                $imgName = trim($row[$colImage] ?? '');
                if ($imgName !== '') {
                    $productImages[$pid] = basename($imgName);
                }
            }

            foreach ($weightCols as $i => $w) {
                $val = trim($row[$i] ?? '');
                if ($val === '' || !is_numeric($val)) continue;
                $qty = (int)$val;
                if ($qty <= 0) continue;
                if (!isset($recipeRows[$w])) $recipeRows[$w] = [];
                $recipeRows[$w][$pid] = $qty;
            }
        }
        fclose($handle);

        return [
            'delimiter' => $delim,
            'weights' => array_values($weightCols),
            'rows' => $recipeRows,
            'product_images' => $productImages,
            'missing' => array_values(array_unique($missing)),
            'rows_processed' => $rowsProcessed,
            'resolved' => $resolved,
            'total_entries' => array_sum(array_map('count', $recipeRows)),
        ];
    }
}