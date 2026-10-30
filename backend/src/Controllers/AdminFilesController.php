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
            'backups' => [
                'title' => 'Дампы базы данных',
                'dir' => Paths::backupsDir(),
                'public' => null,
                'deletable' => true,
                'hint' => 'Автоматические копии базы SQLite: снимок создаётся перед каждой миграцией схемы. Скачивайте кнопкой «Скачать», старые можно удалять — хранятся последние 10.',
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

    /* ── ПОИСК ВСЕХ ВИДЕО (медиа-галерея, режим «Видео») ──
       GET /api/admin/files/videos[?folder=видео/май]
       Рекурсивно ищет видео (mp4/webm/mov/m4v) под /uploads — или только
       в заданной подпапке. Папка берётся из ?folder= (мгновенный отклик
       в UI) или из настройки gallery_video_folder (пусто = искать везде).
       Плоский список, новее сверху. Ошибок «папка не найдена» НЕТ:
       нет папки — просто пустой список; при пустой настройке видео
       ищутся по всему /uploads в любом случае. */
    public static function videos(PDO $pdo): void
    {
        Auth::requireEditor();

        $param = $_GET['folder'] ?? null;
        if ($param === null) {
            $stmt = $pdo->prepare("SELECT value FROM settings WHERE key = 'gallery_video_folder'");
            $stmt->execute();
            $param = (string)($stmt->fetchColumn() ?: '');
        }
        $folder = trim(str_replace('\\', '/', (string)$param), " /\t\n\r\0\x0B");
        $folder = preg_replace('#/+#', '/', $folder) ?? '';
        if ($folder !== '' && preg_match('#(^|/)\.\.(/|$)#', $folder)) {
            jsonResponse(['error' => 'Путь к папке видео: внутри /uploads, без «..»'], 422);
        }

        $root = realpath(Paths::uploadsRoot());
        $base = $root === false ? false : ($folder === '' ? $root : realpath($root . '/' . $folder));
        $entries = [];
        if ($root !== false && $base !== false && is_dir($base)
            && ($base === $root || str_starts_with($base, $root . DIRECTORY_SEPARATOR))) {
            $exts = ['mp4', 'webm', 'mov', 'm4v'];
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator(
                    $base,
                    FilesystemIterator::SKIP_DOTS | FilesystemIterator::CURRENT_AS_PATHNAME
                ),
                RecursiveIteratorIterator::LEAVES_ONLY
            );
            foreach ($it as $file) {
                $ext = strtolower(pathinfo((string)$file, PATHINFO_EXTENSION));
                if (!in_array($ext, $exts, true)) continue;
                $rel = ltrim(substr((string)$file, strlen($root)), '/\\');
                $dir = dirname($rel);
                $entries[] = [
                    'name'   => basename((string)$file),
                    'folder' => $dir === '.' ? '' : $dir,
                    'path'   => 'media/' . $rel,
                    'url'    => '/uploads/' . $rel,
                    'size'   => @filesize((string)$file) ?: 0,
                    'mtime'  => @filemtime((string)$file) ?: 0,
                ];
            }
            usort($entries, static fn (array $a, array $b): int => $b['mtime'] <=> $a['mtime']);
            if (count($entries) > 1000) $entries = array_slice($entries, 0, 1000);
        }

        jsonResponse(['data' => [
            'folder'  => $folder,
            'count'   => count($entries),
            'entries' => $entries,
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

    /* ── СЖАТИЕ ВИДЕО (кнопка «Сжать» в редакторе товара) ──
       POST /api/admin/files/compress  body: { url: "/uploads/…/file.mov" }
       mov/m4v → mp4 (remux без потери качества, иначе перекодирование),
       mp4 → перекодирование с усилением сжатия. Файл заменяется на диске,
       все привязки (product_images.url, products.video_url) переписываются
       на новый URL — видео остаётся подключённым к тем же товарам. */

    public static function compress(PDO $pdo): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $url = trim((string)($data['url'] ?? ''));

        if ($url === '') jsonResponse(['error' => 'Укажите URL файла'], 422);

        // Только файлы из /uploads/; защита от traversal — как в attach:
        // realpath обязан лежать внутри uploads-корня.
        $rel = str_starts_with($url, '/uploads/') ? substr($url, strlen('/uploads/')) : null;
        if ($rel === null || $rel === '' || str_contains($rel, '..')) {
            jsonResponse(['error' => 'Сжимать можно только файлы из /uploads/'], 422);
        }

        $uploadsRoot = realpath(Paths::uploadsRoot());
        $realFile = $uploadsRoot === false ? false : realpath(Paths::publicRoot() . $url);
        $locatedUrl = $url; // URL, под которым файл реально лежит (для переписывания ссылок)

        /* Файла по точному пути нет — ЖИЗНЕННАЯ ситуация (Task 87):
            файл переместили по FTP, удалили, либо он уже был перекодирован
            параллельным запросом («Сжать» нажали дважды). Раньше отсюда
            уходил 404 или техношум ffmpeg «uploads//file.mov: No such
            file or directory». Теперь ищем файл по всему uploads-дереву. */
        if ($uploadsRoot === false || $realFile === false || !is_file($realFile)) {
            $found = self::locateUploaded($url);
            if ($found === null) {
                jsonResponse(['error' => 'Файл ' . basename($url)
                    . ' не найден в /uploads — возможно, он удалён или уже перекодирован'], 404);
            }
            if (strcasecmp(pathinfo($found['url'], PATHINFO_EXTENSION), 'mp4') === 0
                && strcasecmp(pathinfo($url, PATHINFO_EXTENSION), 'mp4') !== 0) {
                /* Просили mov, а на диске уже лежит mp4 с тем же именем —
                    видео было перекодировано ранее, осталось обновить ссылки. */
                $refs = self::retargetRefs($pdo, $url, $found['url']);
                $size = @filesize($found['abs']) ?: 0;
                jsonResponse(['data' => [
                    'ok'           => true,
                    'url'          => $found['url'],
                    'old_url'      => $url,
                    'before'       => $size,
                    'after'        => $size,
                    'note'         => 'видео уже было перекодировано ранее — найден готовый '
                        . basename($found['url']) . ', ссылки товаров обновлены',
                    'refs_updated' => $refs,
                ]]);
            }
            $realFile = $found['abs'];
            $locatedUrl = $found['url'];
        }
        if (!is_file($realFile)
            || !str_starts_with($realFile, $uploadsRoot . DIRECTORY_SEPARATOR)) {
            jsonResponse(['error' => 'Файл не найден на сервере'], 404);
        }

        $ext = strtolower(pathinfo($realFile, PATHINFO_EXTENSION));
        if (!in_array($ext, ['mov', 'm4v', 'mp4'], true)) {
            jsonResponse(['error' => 'Сжимать можно видео mov, m4v и mp4'], 422);
        }

        $opt = $ext === 'mp4'
            ? MediaOptimizer::recompressMp4File($realFile)
            : MediaOptimizer::optimizeVideoFile($realFile);

        if (!$opt['converted']) {
            // Честная причина: ffmpeg недоступен / уже сжато / кодек не взялся
            jsonResponse(['error' => $opt['note'] ?: 'Не удалось сжать видео'], 422);
        }

        $newUrl = rtrim(dirname($locatedUrl), '/') . '/' . $opt['name'];

        // Переписываем привязки, чтобы видео осталось у тех же товаров
        // (WHERE — по URL из запроса: именно он записан в базе, даже если
        // файл на диске нашёлся в другой папке и ссылка в базе устарела)
        $refs = self::retargetRefs($pdo, $url, $newUrl);

        jsonResponse(['data' => [
            'ok'           => true,
            'url'          => $newUrl,
            'old_url'      => $url,
            'before'       => $opt['before'],
            'after'        => $opt['after'],
            'note'         => $opt['note'],
            'refs_updated' => $refs,
        ]]);
    }

    /** Переписать ссылки на файл у товаров (product_images + products.video_url).
        Возвращает число обновлённых строк. */
    private static function retargetRefs(PDO $pdo, string $fromUrl, string $toUrl): int
    {
        $refs = 0;
        $upd = $pdo->prepare('UPDATE product_images SET url = ? WHERE url = ?');
        $upd->execute([$toUrl, $fromUrl]);
        $refs += $upd->rowCount();

        try {
            $upd2 = $pdo->prepare('UPDATE products SET video_url = ? WHERE video_url = ?');
            $upd2->execute([$toUrl, $fromUrl]);
            $refs += $upd2->rowCount();
        } catch (PDOException) {
            // старая схема без products.video_url — пропускаем
        }
        return $refs;
    }

    /** Поиск файла по всему /uploads, когда точный URL не существует.
        Приоритет: 1) то же имя в любой папке; 2) то же имя без учёта
        регистра; 3) тот же ствол с .mp4 — файл уже был перекодирован.
        Совпадений несколько → берём самый свежий по mtime.
        Возвращает ['url' => '/uploads/…', 'abs' => '…'] или null. */
    private static function locateUploaded(string $url): ?array
    {
        $root = realpath(Paths::uploadsRoot());
        if ($root === false || !is_dir($root)) return null;

        $name = basename($url);                        // KAM_v012.mov
        $stem = pathinfo($name, PATHINFO_FILENAME);    // KAM_v012
        if ($name === '' || $name === '.' || $name === '..') return null;

        $same = [];    // то же имя (KAM_v012.mov в другой папке)
        $ci = [];      // то же имя, регистр отличается (kam_V012.MOV)
        $mp4 = [];     // тот же ствол с .mp4 (уже перекодирован ранее)
        try {
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS | FilesystemIterator::CURRENT_AS_PATHNAME),
                RecursiveIteratorIterator::LEAVES_ONLY
            );
            foreach ($it as $file) {
                $f = (string)$file;
                $b = basename($f);
                if ($b === $name) $same[] = $f;
                elseif (strcasecmp($b, $name) === 0) $ci[] = $f;
                elseif (strcasecmp(pathinfo($b, PATHINFO_FILENAME), $stem) === 0
                        && strcasecmp(pathinfo($b, PATHINFO_EXTENSION), 'mp4') === 0) {
                    $mp4[] = $f;
                }
            }
        } catch (UnexpectedValueException) {
            return null; // дерево не прочиталось (права и т.п.)
        }

        $pick = static function (array $list) use ($root): ?string {
            if ($list === []) return null;
            $best = null; $bestM = -1;
            foreach ($list as $f) {
                $m = @filemtime($f) ?: 0;
                if ($m > $bestM) { $bestM = $m; $best = $f; }
            }
            return $best;
        };
        $abs = $pick($same) ?? $pick($ci) ?? $pick($mp4);
        if ($abs === null) return null;

        $rel = ltrim(substr($abs, strlen($root)), '/\\');
        return [
            'abs' => $abs,
            'url' => '/uploads/' . str_replace(DIRECTORY_SEPARATOR, '/', $rel),
        ];
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
