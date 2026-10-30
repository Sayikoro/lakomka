<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../ProductCsvParser.php';
require_once __DIR__ . '/../ChunkedUpload.php';
require_once __DIR__ . '/../Paths.php';

class AdminProductsImportExportController
{
    private const COVER_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    private const VIDEO_EXT = ['mp4', 'webm', 'mov'];

    /* ============================================================
       ИМПОРТ
       POST /api/admin/products/import-zip
       body: { file_path: "xxx.zip" }
       ============================================================ */
    public static function importZip(PDO $pdo): void
    {
        Auth::requireEditor();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $fileName = (string)($data['file_path'] ?? '');

        $zipPath = ChunkedUpload::resolveFile($fileName);
        if (!$zipPath) jsonResponse(['error' => 'ZIP не найден. Загрузите заново.'], 404);

        if (!class_exists('ZipArchive')) {
            jsonResponse(['error' => 'Расширение zip не установлено в PHP'], 500);
        }

        $zip = new ZipArchive();
        $openResult = @$zip->open($zipPath);
        if ($openResult !== true) {
            ChunkedUpload::removeFile($fileName);
            jsonResponse(['error' => "Не удалось открыть ZIP (код: $openResult)"], 422);
        }

        // CSV
        $csvContent = null;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $n = $zip->getNameIndex($i);
            if (preg_match('/\.csv$/i', $n) && !str_ends_with($n, '/')) {
                $csvContent = $zip->getFromIndex($i);
                break;
            }
        }
        if ($csvContent === null) {
            $zip->close();
            ChunkedUpload::removeFile($fileName);
            jsonResponse(['error' => 'В ZIP нет CSV'], 422);
        }

        // Распаковка во временные папки
        $tmpDir = sys_get_temp_dir() . '/products-import-' . bin2hex(random_bytes(4));
        @mkdir($tmpDir, 0755, true);
        @mkdir($tmpDir . '/videos', 0755, true);

        $imageFiles = [];  // lowercase basename => path
        $videoFiles = [];  // lowercase basename => path

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $n = $zip->getNameIndex($i);
            if (str_ends_with($n, '/')) continue;

            if (preg_match('#(^|/)images/(.+)$#i', $n, $m)) {
                $base = basename($m[2]);
                $base = preg_replace('/[^\p{L}\p{N}._\- ]/u', '_', $base);
                $target = $tmpDir . '/' . $base;
                file_put_contents($target, $zip->getFromIndex($i));
                $imageFiles[strtolower($base)] = $target;
            } elseif (preg_match('#(^|/)videos/(.+)$#i', $n, $m)) {
                $base = basename($m[2]);
                $base = preg_replace('/[^\p{L}\p{N}._\- ]/u', '_', $base);
                $target = $tmpDir . '/videos/' . $base;
                file_put_contents($target, $zip->getFromIndex($i));
                $videoFiles[strtolower($base)] = $target;
            }
        }
        $zip->close();

        $csvPath = $tmpDir . '/__data.csv';
        file_put_contents($csvPath, $csvContent);

        try {
            $parsed = ProductCsvParser::parse($csvPath);
        } catch (Throwable $e) {
            self::cleanupTmp($tmpDir);
            ChunkedUpload::removeFile($fileName);
            jsonResponse(['error' => $e->getMessage()], 422);
        }

        if (empty($parsed['rows'])) {
            self::cleanupTmp($tmpDir);
            ChunkedUpload::removeFile($fileName);
            jsonResponse([
                'error' => 'Нет валидных строк для импорта',
                'parse_errors' => $parsed['errors'],
            ], 422);
        }

        $stats = self::applyImport($pdo, $parsed, $imageFiles, $videoFiles);

        self::cleanupTmp($tmpDir);
        ChunkedUpload::removeFile($fileName);

        // «Живой архив» (Task 63): правки пользователя сразу попадают
        // в lakomka-products.zip — отдельный экспорт не нужен
        $archiveSync = null;
        try {
            $archiveSync = self::syncLivingArchive($pdo);
        } catch (Throwable $e) {
            $archiveSync = ['error' => 'Не удалось синхронизировать архив: ' . $e->getMessage()];
        }

        jsonResponse([
            'data' => [
                'rows_processed' => $parsed['rows_processed'],
                'created' => $stats['created'],
                'updated' => $stats['updated'],
                'images_copied' => $stats['images_copied'],
                'videos_copied' => $stats['videos_copied'],
                'videos_external' => $stats['videos_external'],
                'images_attached' => $stats['images_attached'],
                'videos_attached' => $stats['videos_attached'],
                'parse_errors' => $parsed['errors'],
                'import_errors' => $stats['errors'],
                'images_missing' => array_values(array_unique($stats['images_missing'])),
                'videos_missing' => array_values(array_unique($stats['videos_missing'])),
                'archive' => $archiveSync,
            ],
        ]);
    }

    /* ============================================================
       ЭКСПОРТ — «живой архив» (Task 63).
       Один постоянный файл: public/exports/lakomka-products.zip.
       POST /api/admin/products/export-zip — ОБНОВЛЯЕТ архив на месте:
       внутри ZIP переписываются только изменившиеся файлы (CSV,
       картинки, видео, editor.html), ничего в браузер не скачивается.
       Скачивание — отдельная кнопка: GET /export-zip-download/<файл>.
       Изменения определяются по CRC32 записей (ZIP хранит CRC каждой
       записи), поэтому манифест-файл не нужен и рассинхрон невозможен:
       CRC считается из фактического содержимого архива.
       ============================================================ */
    public static function exportZip(PDO $pdo): void
    {
        Auth::requireEditor();
        set_time_limit(0);

        if (!class_exists('ZipArchive')) {
            jsonResponse(['error' => 'Расширение zip не установлено'], 500);
        }

        jsonResponse(['data' => self::syncLivingArchive($pdo)]);
    }

    /* Статус живого архива для UI: GET /api/admin/products/export-zip-status */
    public static function exportZipStatus(): void
    {
        Auth::requireEditor();

        $path = self::archivePath();
        if (!is_file($path)) {
            jsonResponse(['data' => ['exists' => false, 'file' => 'exports/lakomka-products.zip']]);
        }

        jsonResponse(['data' => [
            'exists' => true,
            'file' => 'exports/lakomka-products.zip',
            'download_url' => '/api/admin/products/export-zip-download/lakomka-products.zip',
            'size' => filesize($path),
            'updated_at' => date('Y-m-d H:i', (int)filemtime($path)),
            'entries' => self::countZipEntries($path),
        ]]);
    }

    private static function archivePath(): string
    {
        return Paths::exportsDir() . '/lakomka-products.zip';
    }

    private static function countZipEntries(string $path): int
    {
        if (!class_exists('ZipArchive') || !is_file($path)) return 0;
        $z = new ZipArchive();
        if (@$z->open($path) !== true) return 0;
        $n = 0;
        for ($i = 0; $i < $z->numFiles; $i++) {
            $name = $z->getNameIndex($i);
            if ($name !== false && !str_ends_with($name, '/')) $n++;
        }
        $z->close();
        return $n;
    }

    /* Ядро «живого архива»: приводит lakomka-products.zip к текущему состоянию
       БД, переписывая ТОЛЬКО изменившиеся записи. Также вызывается после
       импорта ZIP — правки пользователя сразу попадают в архив. */
    private static function syncLivingArchive(PDO $pdo): array
    {
        $exportsDir = Paths::exportsDir();
        if (!is_dir($exportsDir) && !@mkdir($exportsDir, 0755, true)) {
            jsonResponse(['error' => 'Не удалось создать папку для экспорта'], 500);
        }

        // Уборка старых копий с датой в имени — остаётся один постоянный архив
        foreach (glob($exportsDir . '/lakomka-*.zip') ?: [] as $old) {
            $base = basename((string)$old);
            if ($base !== 'lakomka-products.zip' && is_file($old)) @unlink($old);
        }

        $archivePath = self::archivePath();
        $firstBuild = !is_file($archivePath);

        // Работаем над временной копией и подменяем атомарно:
        // сбой в середине не оставит битый ZIP
        $tmpPath = tempnam(sys_get_temp_dir(), 'lakomka-arc-');
        if ($tmpPath === false) {
            jsonResponse(['error' => 'Не удалось создать temp'], 500);
        }

        $zip = new ZipArchive();
        $currentCrc = [];
        if ($firstBuild) {
            @unlink($tmpPath); // tempnam создаёт пустой файл — это не ZIP
            $openOk = $zip->open($tmpPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        } else {
            if (!@copy($archivePath, $tmpPath)) {
                @unlink($tmpPath);
                jsonResponse(['error' => 'Не удалось скопировать текущий архив'], 500);
            }
            $openOk = @$zip->open($tmpPath);
            if ($openOk !== true) {
                // Архив повреждён — молча пересобираем с нуля
                @unlink($tmpPath);
                $firstBuild = true;
                $openOk = $zip->open($tmpPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
            }
        }
        if ($openOk !== true) {
            @unlink($tmpPath);
            jsonResponse(['error' => 'Не удалось открыть ZIP для обновления'], 500);
        }

        // CRC32 (hex) всех записей текущего архива — по ним решаем, менять ли файл
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if ($name === false || str_ends_with($name, '/')) continue;
            $st = $zip->statIndex($i);
            $currentCrc[$name] = is_array($st) && isset($st['crc'])
                ? sprintf('%08x', $st['crc'])
                : null;
        }

        $cnt = ['added' => 0, 'updated' => 0, 'removed' => 0, 'unchanged' => 0];
        $desired = [];

        try {
            $catMap = [];
            foreach ($pdo->query('SELECT id, slug FROM categories')->fetchAll() as $c) {
                $catMap[(int)$c['id']] = $c['slug'];
            }

            $products = $pdo->query('SELECT * FROM products ORDER BY id')->fetchAll();
            $totalProducts = count($products);

            $totalImages = (int)$pdo->query(
                "SELECT COUNT(*) FROM product_images WHERE media_type = 'image'"
            )->fetchColumn();
            $totalVideos = (int)$pdo->query(
                "SELECT COUNT(*) FROM product_images WHERE media_type = 'video'"
            )->fetchColumn();
            $totalItems = $totalProducts + $totalImages + $totalVideos;

            $imgStmt = $pdo->prepare(
                "SELECT id, url, alt, media_type, sort_order
                 FROM product_images
                 WHERE product_id = ?
                 ORDER BY media_type DESC, sort_order, id"
            );

            /* Локальные копии картинок из импорта: public/uploads/products/{slug}/.
               Если копия есть на диске — берём её мгновенно, сеть не трогаем. */
            $productsRoot = Paths::uploadsRoot() . '/products';
            $localImagesFor = function (array $prod) use ($productsRoot): array {
                $dir = $productsRoot . '/' . (preg_replace('/[^a-z0-9\-]/', '', strtolower((string)$prod['slug'])) ?: 'p' . $prod['id']);
                if (!is_dir($dir)) return [];
                $found = glob($dir . '/*.*') ?: [];
                usort($found, static function ($a, $b) {
                    $na = (int)preg_replace('/\D/', '', basename($a));
                    $nb = (int)preg_replace('/\D/', '', basename($b));
                    return $na <=> $nb;
                });
                return $found;
            };

            $headers = [
                'ID', 'НАЗВАНИЕ', 'ТИП', 'SLUG', 'SKU',
                'ЦЕНА', 'СТАРАЯ_ЦЕНА', 'ОСТАТОК',
                'ВЕС', 'ДЛИНА', 'ШИРИНА', 'ВЫСОТА',
                'ПРОИЗВОДИТЕЛЬ', 'КАТЕГОРИЯ', 'ОПИСАНИЕ',
                'КАРТИНКИ', 'ВИДЕО', 'РЕЦЕПТ_ВЕС', 'УПАКОВКА',
                'ПОКАЗЫВАТЬ', 'ОПУБЛИКОВАН', 'LEGACY_SLUG',
            ];

            $csv = "\xEF\xBB\xBF";
            $csv .= implode(';', array_map([self::class, 'csvEscape'], $headers)) . "\n";

            $stats = [
                'images_packed' => 0,
                'images_downloaded' => 0,
                'images_skipped' => 0,
                'videos_packed' => 0,
                'videos_skipped' => 0,
            ];
            $counter = 0;

            foreach ($products as $idx => $p) {
                $imgStmt->execute([$p['id']]);
                $media = $imgStmt->fetchAll();
                $localImages = $localImagesFor($p);

                $imageNames = [];
                $videoNames = [];
                $imageCounter = 0;
                $videoCounter = 0;

                foreach ($media as $m) {
                    $url = $m['url'];

                    if ($m['media_type'] === 'video') {
                        if (str_starts_with($url, '/uploads/')) {
                            // локальное — упаковать файл в videos/
                            $srcPath = Paths::publicRoot() . $url;
                            if (!is_file($srcPath)) {
                                // Файл пропал — всё равно перечисляем ссылку в CSV,
                                // чтобы экспорт учитывал все медиа товара
                                $videoNames[] = $url;
                                $videoCounter++;
                                $stats['videos_skipped']++;
                                $counter++;
                                continue;
                            }
                            $ext = strtolower(pathinfo($srcPath, PATHINFO_EXTENSION)) ?: 'mp4';
                            $zipName = $p['id'] . '-v' . $videoCounter . '.' . $ext;
                            self::zipUpsert($zip, $currentCrc, $desired, 'videos/' . $zipName, $srcPath, null, $cnt, true); // mp4 уже сжат, STORE — в разы быстрее
                            $videoNames[] = $zipName;
                            $videoCounter++;
                            $stats['videos_packed']++;
                            $counter++;
                        } elseif (str_starts_with($url, 'http')) {
                            // YouTube/VK/RuTube/внешний URL — как есть в CSV
                            $videoNames[] = $url;
                            $counter++;
                        }
                        continue;
                    }

                    // картинка
                    if (str_starts_with($url, '/uploads/')) {
                        $srcPath = Paths::publicRoot() . $url;
                        if (!is_file($srcPath)) { $stats['images_skipped']++; $counter++; continue; }
                        $ext = strtolower(pathinfo($srcPath, PATHINFO_EXTENSION)) ?: 'jpg';
                        if ($ext === 'jpeg') $ext = 'jpg';
                        $zipName = $p['id'] . '-' . $imageCounter . '.' . $ext;
                        self::zipUpsert($zip, $currentCrc, $desired, 'images/' . $zipName, $srcPath, null, $cnt, true); // jpg/png не сжимаются повторно — скорость
                        $imageNames[] = $zipName;
                        $imageCounter++;
                        $stats['images_packed']++;
                        $counter++;
                    } elseif (str_starts_with($url, 'http')) {
                        // 1) Локальная копия из импорта — если есть, сеть не трогаем
                        $localFile = $localImages[$imageCounter] ?? null;
                        if ($localFile !== null && is_file($localFile)) {
                            $ext = strtolower(pathinfo($localFile, PATHINFO_EXTENSION)) ?: 'jpg';
                            if ($ext === 'jpeg') $ext = 'jpg';
                            $zipName = $p['id'] . '-' . $imageCounter . '.' . $ext;
                            self::zipUpsert($zip, $currentCrc, $desired, 'images/' . $zipName, $localFile, null, $cnt, true);
                            $imageNames[] = $zipName;
                            $imageCounter++;
                            $stats['images_packed']++;
                            $counter++;
                            continue;
                        }
                        // 2) Локальной нет — качаем с внешнего хоста (timeout 4 с); при неудаче
                        //    картинка всё равно попадает в CSV своим URL (см. ниже)
                        $ctx = stream_context_create(['http' => ['timeout' => 4]]);
                        $blob = @file_get_contents($url, false, $ctx);
                        if ($blob === false) {
                            // Ни локальной копии, ни сети — всё равно перечисляем картинку в CSV (её URL),
                            // чтобы экспорт учитывал ВСЕ доп. картинки товара
                            $imageNames[] = $url;
                            $imageCounter++;
                            $stats['images_skipped']++;
                            $counter++;
                            continue;
                        }
                        $urlPath = parse_url($url, PHP_URL_PATH) ?? '';
                        $ext = strtolower(pathinfo($urlPath, PATHINFO_EXTENSION)) ?: 'jpg';
                        if ($ext === 'jpeg') $ext = 'jpg';
                        if (!in_array($ext, self::COVER_EXT, true)) $ext = 'jpg';
                        $zipName = $p['id'] . '-' . $imageCounter . '.' . $ext;
                        self::zipUpsert($zip, $currentCrc, $desired, 'images/' . $zipName, null, $blob, $cnt);
                        $imageNames[] = $zipName;
                        $imageCounter++;
                        $stats['images_downloaded']++;
                        $counter++;
                    }
                }

                $catSlug = $p['category_id'] ? ($catMap[(int)$p['category_id']] ?? '') : '';

                $row = [
                    $p['id'], $p['name'], $p['type'], $p['slug'], $p['sku'] ?? '',
                    $p['price_kopecks'] > 0 ? number_format($p['price_kopecks'] / 100, 2, '.', '') : '0',
                    $p['old_price_kopecks'] ? number_format($p['old_price_kopecks'] / 100, 2, '.', '') : '',
                    $p['stock_qty'], $p['weight_g'] ?? '', $p['length_cm'] ?? '',
                    $p['width_cm'] ?? '', $p['height_cm'] ?? '',
                    $p['manufacturer'] ?? '', $catSlug, $p['description'] ?? '',
                    implode(',', $imageNames),
                    implode(',', $videoNames),
                    $p['recipe_weight_g'] ?? '', $p['packaging_material'] ?? '',
                    $p['show_in_catalog'], $p['is_published'], $p['legacy_slug'] ?? '',
                ];
                $csv .= implode(';', array_map([self::class, 'csvEscape'], $row)) . "\n";
            }

            self::zipUpsert($zip, $currentCrc, $desired, 'products.csv', null, $csv, $cnt);

            // Task 51: офлайн-редактор каталога внутри архива.
            // Пользователь открывает editor.html, перетаскивает ZIP (или products.csv),
            // правит таблицу и сохраняет готовый ZIP обратно — всё на стороне клиента.
            // __DIR__ = backend/src/Controllers → ../../resources = backend/resources
            $editorPath = __DIR__ . '/../../resources/product-editor.html';
            if (is_file($editorPath)) {
                self::zipUpsert($zip, $currentCrc, $desired, 'editor.html', $editorPath, null, $cnt);
            }

            // Записи, которых больше нет в БД (удалённые/заменённые медиа), убираем
            foreach (array_keys($currentCrc) as $name) {
                if (isset($desired[$name])) continue;
                // deleteName вместо deleteEntry: в сборке PHP на хостинге нет deleteEntry
                while (@$zip->locateName((string)$name) !== false) {
                    if (!@$zip->deleteName((string)$name)) break;
                    $cnt['removed']++;
                }
            }

            $zip->close();

            // Ничего не изменилось — не переписываем архив: mtime (и «обновлён»
            // в UI) остаются честными, лишней записи на диск нет
            if ($cnt['added'] + $cnt['updated'] + $cnt['removed'] > 0) {
                if (!@rename($tmpPath, $archivePath)) {
                    if (!@copy($tmpPath, $archivePath)) {
                        @unlink($tmpPath);
                        jsonResponse(['error' => 'Не удалось сохранить ZIP'], 500);
                    }
                    @unlink($tmpPath);
                }
                @chmod($archivePath, 0644);
            } else {
                @unlink($tmpPath);
            }
            clearstatcache();

            return [
                'file' => 'exports/lakomka-products.zip',
                'download_url' => '/api/admin/products/export-zip-download/lakomka-products.zip',
                'first_build' => $firstBuild,
                'added' => $cnt['added'],
                'updated' => $cnt['updated'],
                'removed' => $cnt['removed'],
                'unchanged' => $cnt['unchanged'],
                'total_entries' => count($desired),
                'media_missing' => (int)$stats['images_skipped'] + (int)$stats['videos_skipped'],
                'images_downloaded' => (int)$stats['images_downloaded'],
                'size' => filesize($archivePath),
                'updated_at' => date('Y-m-d H:i', (int)@filemtime($archivePath)),
            ];
        } catch (Throwable $e) {
            @$zip->close();
            @unlink($tmpPath);
            jsonResponse(['error' => $e->getMessage()], 500);
        }
    }

    /* Добавить/заменить запись в ZIP, только если содержимое изменилось.
       $currentCrc — карта «имя => CRC32 (hex)» существующих записей архива,
       $desired — имена, которые должны остаться в архиве после сборки. */
    private static function zipUpsert(
        ZipArchive $zip,
        array &$currentCrc,
        array &$desired,
        string $name,
        ?string $srcPath,
        ?string $content,
        array &$cnt,
        bool $store = false
    ): void {
        $desired[$name] = true;

        if ($srcPath !== null) {
            $crc = @hash_file('crc32b', $srcPath); // стриминг — большие видео не грузим в память
            if ($crc === false) $crc = null;
        } else {
            $crc = hash('crc32b', (string)$content);
        }

        if ($crc !== null && isset($currentCrc[$name]) && $currentCrc[$name] === $crc) {
            $cnt['unchanged']++; // запись уже актуальна — не трогаем
            return;
        }

        if (isset($currentCrc[$name])) {
            // deleteName вместо deleteEntry: в сборке PHP на хостинге нет deleteEntry;
            // удаляем все записи с этим именем (дубликаты тоже)
            while (@$zip->locateName($name) !== false) {
                if (!@$zip->deleteName($name)) break;
            }
            $cnt['updated']++;
        } else {
            $cnt['added']++;
        }

        if ($srcPath !== null) {
            $zip->addFile($srcPath, $name);
        } else {
            $zip->addFromString($name, (string)$content);
        }
        if ($store) $zip->setCompressionName($name, ZipArchive::CM_STORE);
        $currentCrc[$name] = $crc;
    }

    public static function exportZipDownload(string $fileName): void
    {
        Auth::requireEditor();

        $fileName = basename($fileName);
        if (!preg_match('/^[a-z0-9\-]+\.zip$/i', $fileName)) {
            jsonResponse(['error' => 'Некорректное имя файла'], 400);
        }

        $path = Paths::exportsDir() . '/' . $fileName;
        if (!is_file($path)) {
            jsonResponse(['error' => 'Файл не найден (возможно истёк срок хранения)'], 404);
        }

        header_remove('Content-Type');
        header('Content-Type: application/zip');
        header("Content-Disposition: attachment; filename=\"$fileName\"");
        header('Cache-Control: no-store');
        header('Accept-Ranges: bytes'); // нативная докачка браузером + будущая параллельная загрузка

        $size = filesize($path);
        if ($size === false) {
            jsonResponse(['error' => 'Не удалось прочитать файл'], 500);
        }

        // ── Range-запрос (один диапазон) → 206: докачка/перемотка ──
        // Учение Task 66: без Range прерванное скачивание 75МБ начиналось с нуля.
        $range = $_SERVER['HTTP_RANGE'] ?? '';
        if ($range !== '' && preg_match('/^bytes=(\d*)-(\d*)$/i', trim($range), $m) === 1
            && ($m[1] !== '' || $m[2] !== '')) {
            $start = $m[1] === '' ? null : (int) $m[1];
            $end = $m[2] === '' ? null : (int) $m[2];

            if ($start === null) {
                // суффиксный формат bytes=-N: последние N байт
                $len = min((int) $m[2], $size);
                $start = $size - $len;
                $end = $size - 1;
            } else {
                if ($start >= $size) {
                    http_response_code(416);
                    header('Content-Range: bytes */' . $size);
                    exit;
                }
                $end = ($end === null || $end >= $size) ? $size - 1 : $end;
            }

            $length = $end - $start + 1;
            http_response_code(206);
            header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
            header('Content-Length: ' . $length);

            // readfile не умеет seek — отдаём слайс кусками по 8МБ
            $fh = fopen($path, 'rb');
            if ($fh === false) {
                jsonResponse(['error' => 'Не удалось открыть файл'], 500);
            }
            try {
                fseek($fh, $start);
                $chunkSize = 8 * 1024 * 1024;
                $remaining = $length;
                while ($remaining > 0 && !feof($fh)) {
                    $chunk = fread($fh, (int) min($chunkSize, $remaining));
                    if ($chunk === false || $chunk === '') {
                        break;
                    }
                    echo $chunk;
                    $remaining -= strlen($chunk);
                    flush();
                }
            } finally {
                fclose($fh);
            }
            exit;
        }

        header('Content-Length: ' . $size);

        readfile($path);
        exit;
    }

    /* ============================================================
       ВНУТРЕННЕЕ
       ============================================================ */
    /* $uploadsRoot — корень файловой системы для медиа. По умолчанию — реальный
       public/. Тесты с копией БД ОБЯЗАНЫ передавать песочницу (напр. /tmp/fs),
       иначе импорт удалит/перезапишет файлы живого сайта (урок Task 51:
       no-op-тест на копии БД вытер 432 файла в public/uploads/products). */
    private static function applyImport(PDO $pdo, array $parsed, array $imageFiles, array $videoFiles, ?string $uploadsRoot = null): array
    {
        $stats = [
            'created' => 0,
            'updated' => 0,
            'images_copied' => 0,
            'videos_copied' => 0,
            'videos_external' => 0,
            'images_external' => 0,
            'images_attached' => 0,
            'videos_attached' => 0,
            'images_missing' => [],
            'videos_missing' => [],
            'errors' => [],
        ];

        /* Индекс файлов на сервере (ленивый): basename (ниж. регистр) → [абс. пути].
           Строится один раз за импорт при ПЕРВОМ промахе по ZIP — если в архиве
           есть все файлы, сканирования не будет вовсе. */
        $serverIndex = null;

        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $findById    = $pdo->prepare('SELECT id, slug FROM products WHERE id = ?');
            $findBySlug  = $pdo->prepare('SELECT id, slug FROM products WHERE slug = ?');
            $catStmt     = $pdo->prepare('SELECT id FROM categories WHERE slug = ?');
            $recipeStmt  = $pdo->prepare('SELECT product_id, quantity FROM weight_recipes WHERE weight_g = ?');
            $clearBundle = $pdo->prepare('DELETE FROM bundle_items WHERE product_id = ?');
            $insertBundle = $pdo->prepare(
                'INSERT INTO bundle_items (product_id, component_id, quantity) VALUES (?, ?, ?)'
            );
            $clearMedia  = $pdo->prepare('DELETE FROM product_images WHERE product_id = ?');
            $insertMedia = $pdo->prepare(
                "INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
                 VALUES (?, ?, ?, ?, ?)"
            );

            foreach ($parsed['rows'] as $r) {
                try {
                    $existing = null;
                    if ($r['id'] !== null) {
                        $findById->execute([$r['id']]);
                        $existing = $findById->fetch() ?: null;
                    }
                    if (!$existing && $r['slug'] !== null) {
                        $findBySlug->execute([$r['slug']]);
                        $existing = $findBySlug->fetch() ?: null;
                    }

                    $categoryId = null;
                    if ($r['category_slug'] !== null) {
                        $catStmt->execute([$r['category_slug']]);
                        $categoryId = $catStmt->fetchColumn() ?: null;
                    }

                    $showInCatalog = $r['type'] === 'recipe' ? 0 : $r['show_in_catalog'];

                    $slug = $r['slug'];
                    if ($slug === null) {
                        $slug = self::slugify($r['name']);
                    }
                    if ($existing) {
                        $checkSlug = $pdo->prepare('SELECT id FROM products WHERE slug = ? AND id <> ?');
                        $checkSlug->execute([$slug, $existing['id']]);
                        if ($checkSlug->fetchColumn()) $slug .= '-' . $existing['id'];
                    } else {
                        $checkSlug = $pdo->prepare('SELECT id FROM products WHERE slug = ?');
                        $checkSlug->execute([$slug]);
                        if ($checkSlug->fetchColumn()) $slug .= '-' . substr((string)time(), -5);
                    }

                    if ($existing) {
                        $upd = $pdo->prepare(
                            'UPDATE products SET
                                name = ?, type = ?, slug = ?, sku = ?,
                                price_kopecks = ?, old_price_kopecks = ?, stock_qty = ?,
                                weight_g = ?, length_cm = ?, width_cm = ?, height_cm = ?,
                                manufacturer = ?, category_id = ?, description = ?,
                                recipe_weight_g = ?, packaging_material = ?,
                                show_in_catalog = ?, is_published = ?, legacy_slug = ?
                             WHERE id = ?'
                        );
                        $upd->execute([
                            $r['name'], $r['type'], $slug, $r['sku'],
                            $r['price_kopecks'], $r['old_price_kopecks'], $r['stock_qty'],
                            $r['weight_g'], $r['length_cm'], $r['width_cm'], $r['height_cm'],
                            $r['manufacturer'], $categoryId, $r['description'],
                            $r['recipe_weight_g'], $r['packaging_material'],
                            $showInCatalog, $r['is_published'], $r['legacy_slug'],
                            $existing['id'],
                        ]);
                        $productId = (int)$existing['id'];
                        $stats['updated']++;
                    } else {
                        $ins = $pdo->prepare(
                            'INSERT INTO products
                                (name, type, slug, sku,
                                 price_kopecks, old_price_kopecks, stock_qty,
                                 weight_g, length_cm, width_cm, height_cm,
                                 manufacturer, category_id, description,
                                 recipe_weight_g, packaging_material,
                                 show_in_catalog, is_published, legacy_slug)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                        );
                        $ins->execute([
                            $r['name'], $r['type'], $slug, $r['sku'],
                            $r['price_kopecks'], $r['old_price_kopecks'], $r['stock_qty'],
                            $r['weight_g'], $r['length_cm'], $r['width_cm'], $r['height_cm'],
                            $r['manufacturer'], $categoryId, $r['description'],
                            $r['recipe_weight_g'], $r['packaging_material'],
                            $showInCatalog, $r['is_published'], $r['legacy_slug'],
                        ]);
                        $productId = (int)$pdo->lastInsertId();
                        $stats['created']++;
                    }

                    if ($r['type'] === 'bundle' && $r['recipe_weight_g'] !== null) {
                        $clearBundle->execute([$productId]);
                        $recipeStmt->execute([$r['recipe_weight_g']]);
                        foreach ($recipeStmt->fetchAll() as $rec) {
                            $insertBundle->execute([$productId, (int)$rec['product_id'], (int)$rec['quantity']]);
                        }
                    }

                    // Медиа: чистим и вставляем заново.
                    // Порядок канонический, как в экспорте (media_type DESC, sort_order):
                    // сначала видео (sort 0..v-1), потом картинки (sort v..v+i-1) —
                    // так round-trip экспорт→импорт не меняет порядок на сайте.
                    $clearMedia->execute([$productId]);
                    $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower($slug)) ?: "p$productId";
                    $fsRoot = $uploadsRoot ?? Paths::publicRoot();
                    $dir = $fsRoot . '/uploads/products/' . $safeSlug;
                    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
                        $stats['errors'][] = "Строка {$r['_row_number']}: не удалось создать папку";
                        continue;
                    }

                    /* ФАЙЛ, КОТОРОГО НЕТ В ZIP, ИЩЕМ НА СЕРВЕРЕ (Task 85).
                     * План составляется ДО удаления старых файлов: если ссылка
                     * указывает на файл в СВОЕЙ папке товара (напр. «лёгкий» архив
                     * без папок media) — файл защищается от удаления и просто
                     * перепривязывается. Иначе файл был бы стёрт глобами ниже
                     * до того, как мы успели бы его найти. */
                    if ($serverIndex === null) {
                        $serverIndex = self::buildUploadsIndex($fsRoot . '/uploads');
                    }
                    $videoPlan = self::resolveMediaPlan(
                        $r['video_items'], $videoFiles, $serverIndex,
                        $fsRoot . '/uploads', $dir, self::VIDEO_EXT, true
                    );
                    $imagePlan = self::resolveMediaPlan(
                        $r['image_files'], $imageFiles, $serverIndex,
                        $fsRoot . '/uploads', $dir, self::COVER_EXT, false
                    );

                    $protect = [];
                    $dirReal = realpath($dir) ?: $dir;
                    foreach ([$videoPlan, $imagePlan] as $pl) {
                        foreach ($pl as $p) {
                            if (($p['kind'] ?? '') === 'server'
                                && str_starts_with($p['abs'], rtrim($dirReal, '/') . '/')) {
                                $protect[$p['abs']] = true;
                            }
                        }
                    }

                    // Удаляем старые файлы (кроме защищённых — они перепривязываются)
                    foreach (['cover.*', '[0-9]*.*', 'ext-*.*', 'video-*.*'] as $pattern) {
                        foreach (glob($dir . '/' . $pattern) as $old) {
                            $real = realpath($old) ?: $old;
                            if (isset($protect[$real])) continue;
                            @unlink($old);
                        }
                    }

                    // Видео: план (external | zip | server | missing)
                    $vidSort = 0;
                    foreach ($videoPlan as $p) {
                        if ($p['kind'] === 'external') {
                            $insertMedia->execute([$productId, $p['url'], 'Видео', 'video', $vidSort]);
                            $vidSort++;
                            $stats['videos_external']++;
                        } elseif ($p['kind'] === 'zip') {
                            $ext = $p['ext'];
                            if (!in_array($ext, self::VIDEO_EXT, true)) continue;
                            $destName = 'video-' . $vidSort . '.' . $ext;
                            $dest = $dir . '/' . $destName;
                            if (!@copy($p['src'], $dest)) continue;

                            $relUrl = '/uploads/products/' . $safeSlug . '/' . $destName;
                            $insertMedia->execute([$productId, $relUrl, 'Видео', 'video', $vidSort]);
                            $vidSort++;
                            $stats['videos_copied']++;
                        } elseif ($p['kind'] === 'server') {
                            // файл уже лежит на сервере (/uploads/video и т.п.) —
                            // привязываем его существующий URL, без копии
                            $insertMedia->execute([$productId, $p['url'], 'Видео', 'video', $vidSort]);
                            $vidSort++;
                            $stats['videos_attached']++;
                        } else {
                            $stats['videos_missing'][] = $p['item'];
                        }
                    }

                    // Картинки: план (external | zip | server | missing)
                    $imgSort = $vidSort; // продолжаем сортировку после видео
                    foreach ($imagePlan as $p) {
                        if ($p['kind'] === 'external') {
                            $insertMedia->execute([$productId, $p['url'], $r['name'], 'image', $imgSort]);
                            $imgSort++;
                            $stats['images_external']++;
                        } elseif ($p['kind'] === 'zip') {
                            $ext = $p['ext'];
                            if (!in_array($ext, self::COVER_EXT, true)) continue;
                            $destName = $imgSort . '.' . $ext;
                            $dest = $dir . '/' . $destName;
                            if (!@copy($p['src'], $dest)) continue;

                            $relUrl = '/uploads/products/' . $safeSlug . '/' . $destName;
                            $insertMedia->execute([$productId, $relUrl, $r['name'], 'image', $imgSort]);
                            $imgSort++;
                            $stats['images_copied']++;
                        } elseif ($p['kind'] === 'server') {
                            $insertMedia->execute([$productId, $p['url'], $r['name'], 'image', $imgSort]);
                            $imgSort++;
                            $stats['images_attached']++;
                        } else {
                            $stats['images_missing'][] = $p['item'];
                        }
                    }
                } catch (Throwable $e) {
                    $stats['errors'][] = "Строка {$r['_row_number']}: " . $e->getMessage();
                }
            }

            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }

        return $stats;
    }

    /* ──────────────────────────────────────────────────────────────
       ПОИСК МЕДИА НА СЕРВЕРЕ (Task 85)
       В ZIP файла нет → ищем в /uploads (видео — в первую очередь в
       /uploads/video). Нашли — привязываем существующий файл без
       копии; не нашли нигде — только тогда «не найдено».
       ────────────────────────────────────────────────────────────── */

    /** Индекс всех файлов /uploads: basename (ниж. регистр) → [абс. пути]. */
    private static function buildUploadsIndex(string $uploadsBase): array
    {
        $index = [];
        $baseReal = realpath($uploadsBase);
        if ($baseReal === false || !is_dir($baseReal)) return $index;
        try {
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($baseReal, FilesystemIterator::SKIP_DOTS),
                RecursiveIteratorIterator::LEAVES_ONLY
            );
            foreach ($it as $f) {
                /** @var SplFileInfo $f */
                if (!$f->isFile()) continue;
                $index[strtolower($f->getFilename())][] = $f->getPathname();
            }
        } catch (Throwable) {
            // недоступная папка — индекс неполный, поиск просто не найдёт
        }
        return $index;
    }

    /**
     * Канонические имена раздаёт сам импорт (0.jpg, video-0.mp4, cover.jpg,
     * ext-*.*): они одинаковы в КАЖДОЙ папке товара, поэтому по ним ищем
     * только в СВОЕЙ папке — иначе привяжем чужой файл. Оригинальные имена
     * (клип.mp4, фото.jpg) ищем по всему /uploads.
     */
    private static function isCanonicalMediaName(string $basename): bool
    {
        return (bool)preg_match('/^(\d+\.[a-z0-9]+|cover\..*|video-\d+\..*|ext-.*)$/i', $basename);
    }

    /**
     * План вставки медиа для одной строки CSV.
     * kind: external — URL как есть; zip — файл из архива (src=tmp, ext);
     *       server — файл уже на сервере (abs, url); missing — нигде нет.
     * Поиск на сервере: (1) точный путь, если в элементе есть «/»;
     * (2) по имени из индекса — своя папка → video (для видео) → media →
     * остальные папки по алфавиту; канонические имена — только своя папка.
     */
    private static function resolveMediaPlan(
        array $items, array $zipFiles, array $serverIndex,
        string $uploadsBase, string $ownDir, array $allowedExt, bool $isVideo
    ): array {
        $plan = [];
        foreach ($items as $item) {
            if (preg_match('#^https?://#i', $item)) {
                $plan[] = ['kind' => 'external', 'url' => $item];
                continue;
            }
            $key = strtolower(basename($item));
            if (isset($zipFiles[$key])) {
                $plan[] = ['kind' => 'zip', 'src' => $zipFiles[$key], 'ext' => strtolower(pathinfo($key, PATHINFO_EXTENSION))];
                continue;
            }
            $found = self::findOnServer($item, $serverIndex, $uploadsBase, $ownDir, $allowedExt, $isVideo);
            if ($found !== null) {
                $plan[] = ['kind' => 'server', 'abs' => $found['abs'], 'url' => $found['url']];
            } else {
                $plan[] = ['kind' => 'missing', 'item' => $item];
            }
        }
        return $plan;
    }

    /** Найти файл на сервере: abs-путь + URL, или null. */
    private static function findOnServer(
        string $item, array $serverIndex, string $uploadsBase,
        string $ownDir, array $allowedExt, bool $isVideo
    ): ?array {
        $baseReal = realpath($uploadsBase);
        if ($baseReal === false) return null;

        $extOk = function (string $abs) use ($allowedExt): bool {
            return in_array(strtolower(pathinfo($abs, PATHINFO_EXTENSION)), $allowedExt, true);
        };
        $mkUrl = function (string $abs) use ($baseReal): ?string {
            $rel = substr($abs, strlen($baseReal));
            if ($rel === false || $rel === '') return null;
            return '/uploads/' . str_replace(DIRECTORY_SEPARATOR, '/', ltrim($rel, '/\\'));
        };

        // 1) Прямой путь из CSV: "/uploads/video/клип.mp4" или "video/клип.mp4"
        if (str_contains($item, '/')) {
            $abs = null;
            if (str_starts_with($item, '/uploads/')) {
                $abs = $baseReal . substr($item, strlen('/uploads/'));
            } elseif (!str_starts_with($item, '/')) {
                // относительный путь от корня uploads (./ и ../ срезаем,
                // containment ниже всё равно проверяет realpath)
                $abs = $baseReal . '/' . ltrim($item, './');
            }
            if ($abs !== null) {
                $real = realpath($abs); // realpath заодно отсекает ../-traversal
                if ($real !== false && is_file($real) && $extOk($real)
                    && str_starts_with($real, $baseReal . DIRECTORY_SEPARATOR)) {
                    $url = $mkUrl($real);
                    if ($url !== null) return ['abs' => $real, 'url' => $url];
                }
            }
        }

        // 2) По имени из индекса
        $key = strtolower(basename($item));
        $matches = $serverIndex[$key] ?? [];
        if ($matches === []) return null;

        $ownReal = realpath($ownDir) ?: null;
        $rank = function (string $abs) use ($ownReal, $baseReal): int {
            if ($ownReal !== null && str_starts_with($abs, rtrim($ownReal, '/') . '/')) return 0; // своя папка
            return str_starts_with($abs, $baseReal . '/video/') ? 1   // папка видео пользователя
                : (str_starts_with($abs, $baseReal . '/media/') ? 2 : 3);
        };
        usort($matches, fn($a, $b) => $rank($a) <=> $rank($b) ?: strcmp($a, $b));

        $onlyOwn = self::isCanonicalMediaName(basename($item));
        foreach ($matches as $abs) {
            if ($onlyOwn && ($ownReal === null || !str_starts_with($abs, rtrim($ownReal, '/') . '/'))) continue;
            if (!$extOk($abs)) continue;
            $url = $mkUrl($abs);
            if ($url !== null) return ['abs' => $abs, 'url' => $url];
        }
        return null;
    }

    private static function csvEscape(string|int|float|null $v): string
    {
        if ($v === null) return '';
        $s = (string)$v;
        if ($s === '') return '';
        if (strpbrk($s, ";,\"\n\r") !== false) {
            return '"' . str_replace('"', '""', $s) . '"';
        }
        return $s;
    }

    private static function cleanupTmp(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (glob($dir . '/*') as $f) {
            if (is_dir($f)) {
                foreach (glob($f . '/*') as $sub) @unlink($sub);
                @rmdir($f);
            } else {
                @unlink($f);
            }
        }
        @rmdir($dir);
    }

    private static function slugify(string $s): string
    {
        $map = [
            'а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'yo','ж'=>'zh',
            'з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o',
            'п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'ts',
            'ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya',
        ];
        $s = mb_strtolower($s, 'UTF-8');
        $s = strtr($s, $map);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s);
        $s = trim($s, '-');
        return ($s !== '' ? $s : 'product') . '-' . substr((string)time(), -5);
    }
}