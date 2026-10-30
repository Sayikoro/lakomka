<?php

require_once __DIR__ . '/../ChunkedUpload.php';
require_once __DIR__ . '/../Paths.php';
require_once __DIR__ . '/../MediaOptimizer.php';

class AdminFilesController
{
    /* ============================================================
       ФАЙЛОВЫЙ МЕНЕДЖЕР (проводник)
       GET  /api/admin/files[?path=section/sub/dir] — список папки
            (без path — корень: разделы как «диски»)
       POST /api/admin/files/delete                 — {path} файл ИЛИ
            папка (рекурсивно); media — только просмотр (403)
       GET  /api/admin/files/download?path=...      — отдать файл
            (Content-Length + attachment) для разделов без публичного URL
       Путь всегда «section/относительный/путь». Защита: только
       реальные пути внутри корня раздела (realpath, traversal — 404).
       ============================================================ */

    private static function sections(): array
    {
        return [
            'exports' => [
                'title' => 'Экспортные архивы (ZIP)',
                // Paths сам разбирается с раскладкой (dev public/ vs деплой-пакет)
                // и создаёт папку при отсутствии — иначе «Раздел недоступен».
                'dir' => Paths::exportsDir(),
                'public' => '/exports',
                'deletable' => true,
                'hint' => 'Готовые ZIP из экспорта товаров. Старше 2 часов чистятся автоматически — удаляйте смело, новый соберётся заново.',
            ],
            'imports' => [
                'title' => 'Импортные архивы (загрузки)',
                // тот же каталог, куда chunked-загрузки склеивают ZIP (создаётся сам)
                'dir' => ChunkedUpload::storageDir(),
                'public' => null,
                'deletable' => true,
                'hint' => 'ZIP, загруженные для импорта. Брошенные загрузки старше 24 часов чистятся автоматически.',
            ],
            'media' => [
                'title' => 'Медиа товаров',
                'dir' => Paths::uploadsRoot(),
                'public' => '/uploads',
                'deletable' => false,
                'hint' => 'Картинки и видео товаров. Нужны сайту — удаление сломает карточки. Только контроль объёма.',
            ],
        ];
    }

    /** Разбор и защита пути: «section/rel/path» → абсолютные пути. */
    private static function resolve(string $rawPath): array
    {
        $rawPath = str_replace('\\', '/', trim($rawPath));
        $rawPath = preg_replace('#/+#', '/', $rawPath) ?? '';
        $rawPath = trim($rawPath, '/');

        $parts = $rawPath === '' ? [] : explode('/', $rawPath);
        foreach ($parts as $p) {
            if ($p === '' || $p === '.' || $p === '..') {
                jsonResponse(['error' => 'Некорректный путь'], 400);
            }
        }

        $key = $parts[0] ?? '';
        $cfg = self::sections()[$key] ?? null;
        if (!$cfg) jsonResponse(['error' => 'Неизвестный раздел'], 404);

        $root = realpath($cfg['dir']);
        if (!$root) jsonResponse(['error' => 'Раздел недоступен'], 404);

        $rel = implode('/', array_slice($parts, 1));
        $abs = $rel === '' ? $root : $root . '/' . $rel;

        // containment-проверка (на случай симлинков и т.п.)
        $real = realpath($abs);
        if ($real === false || !( $real === $root || str_starts_with($real, $root . DIRECTORY_SEPARATOR) )) {
            jsonResponse(['error' => 'Не найдено'], 404);
        }

        return [$cfg, $key, $root, $real, $rel];
    }

    /* ── СПИСОК ПАПКИ ── */

    public static function list(): void
    {
        Auth::requireEditor();

        $path = (string)($_GET['path'] ?? '');

        // КОРЕНЬ: разделы как «диски»
        if ($path === '') {
            $entries = [];
            foreach (self::sections() as $key => $cfg) {
                $dir = $cfg['dir'];
                $total = is_dir($dir) ? self::dirSize($dir) : 0;
                $entries[] = [
                    'name' => $cfg['title'],
                    'key' => $key,
                    'type' => 'dir',
                    'size' => $total,
                    'mtime' => is_dir($dir) ? (@filemtime($dir) ?: 0) : 0,
                    'deletable' => false,
                    'public_url' => null,
                ];
            }
            jsonResponse(['data' => [
                'path' => '',
                'title' => 'Файлы',
                'hint' => 'Разделы: экспортные и импортные архивы, медиа товаров.',
                'deletable' => false,
                'entries' => $entries,
                'total_size' => array_sum(array_column($entries, 'size')),
                'files_count' => 0,
            ]]);
        }

        [$cfg, $key, $root, $abs, $rel] = self::resolve($path);
        if (!is_dir($abs)) jsonResponse(['error' => 'Это не папка'], 404);

        $entries = [];
        $totalFiles = 0;
        $totalSize = 0;
        $bigTree = ($key === 'media'); // у медиа не считаем размер каждой папки (тысячи файлов)

        foreach (scandir($abs, SCANDIR_SORT_ASCENDING) ?: [] as $name) {
            if ($name === '.' || $name === '..') continue;
            $full = $abs . '/' . $name;
            if (is_dir($full)) {
                $entries[] = [
                    'name' => $name,
                    'type' => 'dir',
                    'size' => $bigTree ? 0 : self::dirSize($full),
                    'mtime' => @filemtime($full) ?: 0,
                    'deletable' => $cfg['deletable'],
                    'public_url' => $cfg['public'] ? $cfg['public'] . '/' . ($rel === '' ? $name : $rel . '/' . $name) : null,
                ];
            } elseif (is_file($full)) {
                $size = @filesize($full) ?: 0;
                $totalFiles++;
                $totalSize += $size;
                $entries[] = [
                    'name' => $name,
                    'type' => 'file',
                    'size' => $size,
                    'mtime' => @filemtime($full) ?: 0,
                    'deletable' => $cfg['deletable'],
                    'ext' => strtolower(pathinfo($name, PATHINFO_EXTENSION)),
                    'public_url' => $cfg['public'] ? $cfg['public'] . '/' . ($rel === '' ? $name : $rel . '/' . $name) : null,
                ];
            }
        }

        // папки сверху, дальше по имени (натуральная сортировка)
        usort($entries, static function ($a, $b) {
            if ($a['type'] !== $b['type']) return $a['type'] === 'dir' ? -1 : 1;
            return strnatcasecmp((string)$a['name'], (string)$b['name']);
        });

        jsonResponse(['data' => [
            'path' => $key . ($rel === '' ? '' : '/' . $rel),
            'section' => $key,
            'title' => basename($abs),
            'hint' => $cfg['hint'],
            'deletable' => $cfg['deletable'],
            'entries' => $entries,
            'total_size' => $totalSize,
            'files_count' => $totalFiles,
        ]]);
    }

    /* ── ЗАГРУЗКА ФАЙЛА В ХРАНИЛИЩЕ (медиа и др. разделы) ──
       POST /api/admin/files/upload  JSON:
         { file_path: "up-xxxx.zip" (собранный chunk-файл из storage/chunked-uploads),
           original_name: "фото.jpg", target: "media[/подпапка]" }
       Файл переезжает из chunked-хранилища в целевую папку раздела:
       санитайз имени, дедупликация (name-1.ext), whitelist расширений,
       проверка MIME по содержимому. Ответ: {name, path, url, size}. */

    /** Разрешённые расширения → допустимые MIME (finfo) / семейства */
    private static function allowedExts(): array
    {
        return [
            'jpg'  => ['image/jpeg'],
            'jpeg' => ['image/jpeg'],
            'png'  => ['image/png'],
            'webp' => ['image/webp'],
            'gif'  => ['image/gif'],
            'avif' => ['image/avif', 'image/heif'],
            'mp4'  => ['video/mp4'],
            'webm' => ['video/webm'],
            'mov'  => ['video/quicktime', 'video/mp4'],
            'm4v'  => ['video/x-m4v', 'video/mp4'],
            'pdf'  => ['application/pdf'],
        ];
    }

    private static function maxBytesFor(string $ext): int
    {
        if (in_array($ext, ['mp4', 'webm', 'mov', 'm4v'], true)) return 512 * 1024 * 1024;
        if ($ext === 'pdf') return 64 * 1024 * 1024;
        return 32 * 1024 * 1024; // картинки
    }

    public static function upload(): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $filePath     = (string)($data['file_path'] ?? '');
        $originalName = (string)($data['original_name'] ?? '');
        $target       = (string)($data['target'] ?? '');

        // 1) источник — собранный chunk-файл
        $src = ChunkedUpload::resolveFile($filePath);
        if (!$src) {
            jsonResponse(['error' => 'Загруженный файл не найден (сессия загрузки истекла?)'], 422);
        }

        // 2) целевая папка (любой раздел, корень раздела разрешён)
        if ($target === '') jsonResponse(['error' => 'Не указана папка назначения'], 400);
        [$cfg, $key, $root, $abs, $rel] = self::resolve($target);
        if (!is_dir($abs)) jsonResponse(['error' => 'Папка назначения не найдена'], 404);

        // 3) расширение и лимит
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $allowed = self::allowedExts();
        if ($ext === '' || !isset($allowed[$ext])) {
            jsonResponse(['error' => 'Формат не поддерживается: .' . $ext . ' (можно: '
                . implode(', ', array_keys($allowed)) . ')'], 422);
        }
        $size = @filesize($src) ?: 0;
        $max = self::maxBytesFor($ext);
        if ($size > $max) {
            jsonResponse(['error' => 'Файл больше ' . round($max / 1024 / 1024) . ' МБ'], 422);
        }

        // 4) MIME по содержимому (доверяем файлу, а не имени)
        $mime = @mime_content_type($src) ?: '';
        if (!in_array($mime, $allowed[$ext], true)) {
            jsonResponse(['error' => "Содержимое файла не похоже на .$ext (определено: $mime)"], 422);
        }

        // 5) санитайз имени: буквы/цифры/точка/дефис/пробел/подчёркивание (unicode)
        $base = self::sanitizeName(pathinfo($originalName, PATHINFO_FILENAME));
        if ($base === '') $base = 'file';
        $name = $base . '.' . $ext;

        // 6) дедупликация: photo.jpg → photo-1.jpg → photo-2.jpg …
        $dest = $abs . '/' . $name;
        if (is_file($dest)) {
            $n = 1;
            do {
                $name = $base . '-' . $n . '.' . $ext;
                $dest = $abs . '/' . $name;
                $n++;
            } while (is_file($dest) && $n < 1000);
        }

        // 7) переезд (тот же диск → rename; на всякий случай — копия)
        if (!@rename($src, $dest)) {
            if (!@copy($src, $dest)) {
                jsonResponse(['error' => 'Не удалось сохранить файл в хранилище'], 500);
            }
            @unlink($src);
        }
        @chmod($dest, 0644);

        /* 8) ОПТИМИЗАТОР: картинки jpg/png → webp, видео mov/m4v → mp4.
            При любой ошибке файл остаётся как есть. Имя может смениться
            (расширение/суффикс) — ответ отдаёт итоговые значения. */
        $optNote = '';
        if ($key === 'media') {
            if (in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
                $opt = MediaOptimizer::optimizeImageFile($dest);
                if ($opt['converted']) {
                    $name = $opt['name'];
                    $dest = dirname($dest) . '/' . $name;
                    $optNote = $opt['note'];
                }
            } elseif (in_array($ext, ['mov', 'm4v'], true)) {
                $opt = MediaOptimizer::optimizeVideoFile($dest);
                if ($opt['converted']) {
                    $name = $opt['name'];
                    $dest = dirname($dest) . '/' . $name;
                    $optNote = $opt['note'];
                }
            }
        }

        jsonResponse(['data' => [
            'name'   => $name,
            'path'   => $key . ($rel === '' ? '' : '/' . $rel) . '/' . $name,
            'url'    => $cfg['public'] ? $cfg['public'] . '/' . ($rel === '' ? $name : $rel . '/' . $name) : null,
            'size'   => @filesize($dest) ?: 0,
            'optimized' => $optNote,
        ]]);
    }

    /* ── СОЗДАНИЕ ПАПКИ ──
       POST /api/admin/files/mkdir  JSON: { path: "раздел[/родитель]", name: "Имя" }
       Папку можно создавать в любом разделе (в media — для организации
       медиа по папкам; удаление в media по-прежнему запрещено). */
    public static function mkdir(): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $parent = (string)($data['path'] ?? '');
        $name   = (string)($data['name'] ?? '');

        if ($parent === '') {
            jsonResponse(['error' => 'Откройте раздел — папки создаются внутри разделов'], 400);
        }

        [$cfg, $key, $root, $abs, $rel] = self::resolve($parent);
        if (!is_dir($abs)) jsonResponse(['error' => 'Родительская папка не найдена'], 404);

        $safe = self::sanitizeName($name);
        if ($safe === '') {
            jsonResponse(['error' => 'Некорректное имя папки'], 422);
        }

        $dest = $abs . '/' . $safe;
        if (file_exists($dest)) {
            jsonResponse(['error' => 'Папка или файл с таким именем уже есть'], 409);
        }
        if (!@mkdir($dest, 0755)) {
            jsonResponse(['error' => 'Не удалось создать папку (права?)'], 500);
        }

        jsonResponse(['data' => [
            'name' => $safe,
            'path' => $key . ($rel === '' ? '' : '/' . $rel) . '/' . $safe,
        ]]);
    }

    /* ── ПЕРЕИМЕНОВАНИЕ (файл или папка) ──
       POST /api/admin/files/rename  JSON: { path: "раздел/…/старое", name: "Новое имя" }
       Только в разделах, где разрешено удаление (в media переименование
       сломало бы ссылки товаров на файлы). */
    public static function rename(): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $path = (string)($data['path'] ?? '');
        $name = (string)($data['name'] ?? '');

        [$cfg, $key, $root, $abs, $rel] = self::resolve($path);

        if (!$cfg['deletable']) {
            jsonResponse(['error' => 'В этом разделе файлы трогать нельзя — переименование сломает сайт'], 403);
        }
        if ($rel === '') {
            jsonResponse(['error' => 'Нельзя переименовать сам раздел'], 400);
        }

        $safe = self::sanitizeName($name);
        if ($safe === '') {
            jsonResponse(['error' => 'Некорректное имя'], 422);
        }

        $dest = dirname($abs) . '/' . $safe;
        if ($dest !== $abs && file_exists($dest)) {
            jsonResponse(['error' => 'Папка или файл с таким именем уже есть'], 409);
        }
        if ($dest === $abs) {
            jsonResponse(['data' => ['ok' => true, 'path' => $path, 'name' => basename($abs)]]);
        }
        if (!@rename($abs, $dest)) {
            jsonResponse(['error' => 'Не удалось переименовать'], 500);
        }

        $newRel = ltrim(substr($dest, strlen($root)), '/');
        jsonResponse(['data' => [
            'ok'   => true,
            'name' => $safe,
            'path' => $key . '/' . $newRel,
        ]]);
    }

    /* ── УДАЛЕНИЕ (файл или папка рекурсивно) ── */

    public static function delete(): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $path = (string)($data['path'] ?? '');

        [$cfg, $key, $root, $abs, $rel] = self::resolve($path);

        if (!$cfg['deletable']) jsonResponse(['error' => 'Этот раздел только для просмотра'], 403);
        if ($rel === '') jsonResponse(['error' => 'Нельзя удалить сам раздел'], 400);

        if (is_dir($abs)) {
            self::rrmdir($abs);
        } elseif (is_file($abs)) {
            @unlink($abs);
        } else {
            jsonResponse(['error' => 'Не найдено'], 404);
        }

        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ── СКАЧИВАНИЕ ФАЙЛА СЕРВЕРОМ (для разделов без публичного URL) ── */

    public static function download(): void
    {
        Auth::requireEditor();

        $path = (string)($_GET['path'] ?? '');
        [$cfg, $key, $root, $abs, $rel] = self::resolve($path);

        if (!is_file($abs)) jsonResponse(['error' => 'Файл не найден'], 404);

        $size = @filesize($abs) ?: 0;
        $name = basename($abs);

        while (ob_get_level() > 0) { ob_end_clean(); }
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . $size);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');
        header('Content-Disposition: attachment; filename="' . addslashes($name) . '"');

        set_time_limit(0);
        $fh = fopen($abs, 'rb');
        if (!$fh) exit;
        while (!feof($fh)) {
            echo fread($fh, 1024 * 1024);
            flush();
        }
        fclose($fh);
        exit;
    }

    /* ── внутреннее ── */

    /** Санитайз имени файла/папки: unicode-буквы, цифры, точка, дефис,
      * пробел, подчёркивание; до 100 символов; без точек/пробелов по краям. */
    private static function sanitizeName(string $raw): string
    {
        $base = trim(preg_replace('/[^\p{L}\p{N}._\- ]+/u', '_', $raw) ?? '', " ._");
        $base = mb_substr($base, 0, 100);
        if ($base === '' || $base === '_') return '';
        return $base;
    }

    private static function dirSize(string $dir): int
    {
        $sum = 0;
        foreach (glob($dir . '/*', GLOB_NOSORT) ?: [] as $f) {
            $sum += is_dir($f) ? self::dirSize($f) : (@filesize($f) ?: 0);
        }
        return $sum;
    }

    private static function rrmdir(string $dir): void
    {
        foreach (glob($dir . '/*', GLOB_NOSORT) ?: [] as $f) {
            is_dir($f) ? self::rrmdir($f) : @unlink($f);
        }
        @rmdir($dir);
    }
}
