<?php

class ProductCsvParser
{
    public const VALID_TYPES = ['simple', 'bundle', 'recipe'];
    public const VALID_PACKAGING = ['cardboard', 'tin', 'textile', 'tube', 'pouch'];

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

    public static function parse(string $path): array
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

        if (!isset($idx['НАЗВАНИЕ'])) {
            fclose($handle);
            throw new RuntimeException('Нет колонки НАЗВАНИЕ');
        }
        if (!isset($idx['ТИП'])) {
            fclose($handle);
            throw new RuntimeException('Нет колонки ТИП (simple / bundle / recipe)');
        }

        $col = fn(string ...$names): ?int => (function () use ($idx, $names) {
            foreach ($names as $n) if (isset($idx[$n])) return $idx[$n];
            return null;
        })();

        $cId       = $col('ID', 'id');
        $cName     = $col('НАЗВАНИЕ', 'Название', 'название');
        $cType     = $col('ТИП', 'Тип', 'тип');
        $cSlug     = $col('SLUG', 'Slug', 'slug');
        $cSku      = $col('SKU', 'Артикул', 'sku');
        $cPrice    = $col('ЦЕНА', 'Цена', 'цена');
        $cOldPrice = $col('СТАРАЯ_ЦЕНА', 'Старая цена');
        $cStock    = $col('ОСТАТОК', 'Остаток');
        $cWeight   = $col('ВЕС', 'Вес');
        $cLength   = $col('ДЛИНА', 'Длина');
        $cWidth    = $col('ШИРИНА', 'Ширина');
        $cHeight   = $col('ВЫСОТА', 'Высота');
        $cManuf    = $col('ПРОИЗВОДИТЕЛЬ', 'Производитель');
        $cCategory = $col('КАТЕГОРИЯ', 'Категория');
        $cDesc     = $col('ОПИСАНИЕ', 'Описание');
        $cImages   = $col('КАРТИНКИ', 'Картинки');
        $cVideo    = $col('ВИДЕО', 'Видео');
        $cRecipe   = $col('РЕЦЕПТ_ВЕС', 'Рецепт вес');
        $cPack     = $col('УПАКОВКА', 'Упаковка');
        $cShow     = $col('ПОКАЗЫВАТЬ', 'Показывать');
        $cPub      = $col('ОПУБЛИКОВАН', 'Опубликован');
        $cLegacy   = $col('LEGACY_SLUG', 'Legacy slug');

        $rows = [];
        $errors = [];
        $rowNumber = 1;
        $processed = 0;

        while (($row = fgetcsv($handle, 0, $delim, '"', '')) !== false) {
            $rowNumber++;
            if ($row === [null]) continue;
            if (count(array_filter($row, fn($v) => $v !== null && trim($v) !== '')) === 0) continue;
            $processed++;

            $get = fn(?int $c) => $c !== null ? trim($row[$c] ?? '') : '';
            $name = $get($cName);
            if ($name === '') {
                $errors[] = "Строка $rowNumber: пустое НАЗВАНИЕ";
                continue;
            }

            $type = strtolower($get($cType)) ?: 'simple';
            if (!in_array($type, self::VALID_TYPES, true)) {
                $errors[] = "Строка $rowNumber: неверный ТИП '$type'";
                continue;
            }

            $priceRub = str_replace([' ', ','], ['', '.'], $get($cPrice));
            $priceK = $priceRub !== '' && is_numeric($priceRub)
                ? (int)round((float)$priceRub * 100) : 0;
            if ($priceK < 0) {
                $errors[] = "Строка $rowNumber: отрицательная цена";
                continue;
            }

            $oldRub = str_replace([' ', ','], ['', '.'], $get($cOldPrice));
            $oldK = $oldRub !== '' && is_numeric($oldRub)
                ? (int)round((float)$oldRub * 100) : null;

            $stock = (int)($get($cStock) ?: 0);
            if ($stock < 0) $stock = 0;

            $idRaw = $get($cId);
            $id = ctype_digit($idRaw) ? (int)$idRaw : null;

            // Картинки
            $imgRaw = $get($cImages);
            $imgFiles = [];
            if ($imgRaw !== '') {
                foreach (explode(',', $imgRaw) as $f) {
                    $f = trim($f);
                    if ($f !== '') $imgFiles[] = basename($f);
                }
            }

            // Видео (через запятую — URL или имя файла)
            $videoRaw = $get($cVideo);
            $videoItems = [];
            if ($videoRaw !== '') {
                foreach (explode(',', $videoRaw) as $v) {
                    $v = trim($v);
                    if ($v === '') continue;
                    if (str_starts_with($v, 'http://') || str_starts_with($v, 'https://')) {
                        $videoItems[] = $v;
                    } else {
                        $videoItems[] = basename($v);
                    }
                }
            }

            $packing = strtolower($get($cPack));
            if ($packing !== '' && !in_array($packing, self::VALID_PACKAGING, true)) {
                $packing = '';
            }

            $recipeWeightRaw = $get($cRecipe);
            $recipeWeight = ctype_digit($recipeWeightRaw) ? (int)$recipeWeightRaw : null;

            $showRaw = $get($cShow);
            $show = $showRaw === '' ? 1 : (int)$showRaw;
            $pubRaw = $get($cPub);
            $pub = $pubRaw === '' ? 1 : (int)$pubRaw;

            $rows[] = [
                'id'                 => $id,
                'name'               => $name,
                'type'               => $type,
                'slug'               => $get($cSlug) ?: null,
                'sku'                => $get($cSku) ?: null,
                'price_kopecks'      => $priceK,
                'old_price_kopecks'  => $oldK,
                'stock_qty'          => $stock,
                'weight_g'           => $get($cWeight) !== '' ? (int)$get($cWeight) : null,
                'length_cm'          => $get($cLength) !== '' ? (float)$get($cLength) : null,
                'width_cm'           => $get($cWidth) !== '' ? (float)$get($cWidth) : null,
                'height_cm'          => $get($cHeight) !== '' ? (float)$get($cHeight) : null,
                'manufacturer'       => $get($cManuf) ?: null,
                'category_slug'      => $get($cCategory) ?: null,
                'description'        => $get($cDesc) ?: null,
                'image_files'        => $imgFiles,
                'video_items'        => $videoItems,
                'recipe_weight_g'    => $recipeWeight,
                'packaging_material' => $packing ?: null,
                'show_in_catalog'    => $show,
                'is_published'       => $pub,
                'legacy_slug'        => $get($cLegacy) ?: null,
                '_row_number'        => $rowNumber,
            ];
        }
        fclose($handle);

        return [
            'delimiter' => $delim,
            'headers' => $header,
            'rows' => $rows,
            'errors' => $errors,
            'rows_processed' => $processed,
        ];
    }
}