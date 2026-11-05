<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../Paths.php';
require_once __DIR__ . '/../AdminLog.php';

/**
 * Task 146: ГАЛЕРЕИ КАРТИНОК (вкладка «Галерея» в разделе «Файлы»).
 *
 * Галерея = подпапка в …/uploads/galleries. Имя папки = слаг шорткода
 * [gallery слаг], которым галерея ставится в нужный блок витрины
 * (первый потребитель — блок «логотипы фабрик» на главной).
 * Внутри папки лежат картинки; заголовок и порядок файлов хранит
 * манифест .order.json (скрыт из листинга проводника и из отдачи).
 *
 * БД не используется намеренно: галерея самодостаточна (папка = всё
 * содержимое), бэкапится копированием, переживает перенос сайта, а
 * порядок нужен только в UI (стрелки ← → переписывают манифест).
 *
 * Админские маршруты (Auth::requireEditor):
 *   GET  /api/admin/galleries                — список галерей
 *   POST /api/admin/galleries                — создать {title, slug?}
 *   GET  /api/admin/galleries/items?slug=    — содержимое галереи
 *   POST /api/admin/galleries/title          — переименовать {slug, title}
 *   POST /api/admin/galleries/move           — сдвинуть картинку {slug, name, dir: left|right}
 *   POST /api/admin/galleries/item-delete    — удалить картинку {slug, name}
 *   POST /api/admin/galleries/delete         — удалить галерею целиком {slug}
 *
 * Публичный маршрут (витрина, без авторизации):
 *   GET  /api/galleries/{slug}               — {slug, title, items:[{url, alt}]}
 *
 * Файлы загружаются штатной загрузкой проводника: target «galleries/<слаг>»
 * (раздел galleries добавлен в AdminFilesController::sections), там же
 * работают удаление/переименование/скачивание — вкладка «Галерея» лишь
 * удобная обёртка над тем же хранилищем.
 */
class AdminGalleriesController
{
    /** Расширения картинок, которые считаются содержимым галереи */
    private const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

    private const MANIFEST = '.order.json';

    /* ============================================================
       ХЕЛПЕРЫ
       ============================================================ */

    private static function root(): string
    {
        $root = realpath(Paths::galleriesDir());
        if ($root === false) {
            jsonResponse(['error' => 'Хранилище галерей недоступно'], 500);
        }
        return $root;
    }

    /** Слаг галереи: латиница/цифры/дефис, 1–64, без «--» в начале/конце.
     *  Это одновременно имя папки и кусок публичного URL. */
    private static function normalizeSlug(string $slug): string
    {
        $slug = strtolower(trim($slug));
        $slug = preg_replace('/[^a-z0-9-]+/', '-', $slug) ?? '';
        $slug = trim(preg_replace('/-+/', '-', $slug) ?? '', '-');
        return mb_substr($slug, 0, 64);
    }

    /** Папка галереи по слагу (с containment-проверкой) */
    private static function galleryDir(string $slug): string
    {
        $slug = self::normalizeSlug($slug);
        if ($slug === '') {
            jsonResponse(['error' => 'Укажите слаг галереи'], 422);
        }
        $root = self::root();
        $dir = $root . '/' . $slug;
        $real = realpath($dir);
        if ($real === false || !is_dir($real)
            || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) {
            jsonResponse(['error' => 'Галерея не найдена: ' . $slug], 404);
        }
        return $real;
    }

    /** Манифест галереи: {title, order:[имена файлов]}. Отсутствующий
     *  или битый = пустой (заголовком станет слаг). */
    private static function manifest(string $dir): array
    {
        $raw = @file_get_contents($dir . '/' . self::MANIFEST);
        if ($raw !== false) {
            $j = json_decode($raw, true);
            if (is_array($j)) {
                return [
                    'title' => (string)($j['title'] ?? ''),
                    'order' => is_array($j['order'] ?? null)
                        ? array_values(array_filter(array_map('strval', $j['order'])))
                        : [],
                ];
            }
        }
        return ['title' => '', 'order' => []];
    }

    private static function saveManifest(string $dir, array $m): void
    {
        @file_put_contents(
            $dir . '/' . self::MANIFEST,
            json_encode(
                ['title' => (string)$m['title'], 'order' => array_values($m['order'])],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
            )
        );
        @chmod($dir . '/' . self::MANIFEST, 0644);
    }

    /** Картинки галереи по факту файловой системы (только имена) */
    private static function files(string $dir): array
    {
        $out = [];
        foreach (scandir($dir, SCANDIR_SORT_ASCENDING) ?: [] as $name) {
            if ($name === '.' || $name === '..') continue;
            if ($name[0] === '.') continue; // манифест и прочие служебные
            $full = $dir . '/' . $name;
            if (!is_file($full)) continue;
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            if (in_array($ext, self::IMAGE_EXTS, true)) {
                $out[] = $name;
            }
        }
        return $out;
    }

    /** Порядок картинок: манифест (только существующие файлы) + новые
     *  файлы в конце (по имени). Вызов после каждой загрузки/удаления
     *  синхронизирует манифест с диском — рассинхрона не бывает. */
    private static function orderedFiles(string $dir): array
    {
        $m = self::manifest($dir);
        $actual = self::files($dir);
        $map = array_fill_keys($actual, true);
        $ordered = [];
        foreach ($m['order'] as $name) {
            if (isset($map[$name])) {
                $ordered[] = $name;
                unset($map[$name]);
            }
        }
        foreach (array_keys($map) as $rest) {
            $ordered[] = $rest; // новое — в конец
        }
        if ($ordered !== $m['order']) {
            self::saveManifest($dir, ['title' => $m['title'], 'order' => $ordered]);
        }
        return $ordered;
    }

    /** Красивый alt по умолчанию: имя файла без расширения,
     *  дефисы/подчёркивания → пробелы */
    private static function altFromName(string $name): string
    {
        return trim(str_replace(['-', '_'], ' ', pathinfo($name, PATHINFO_FILENAME)));
    }

    /* ============================================================
       СПИСОК ГАЛЕРЕЙ
       ============================================================ */

    public static function list(PDO $pdo): void
    {
        Auth::requireEditor();
        $root = self::root();

        $galleries = [];
        foreach (scandir($root, SCANDIR_SORT_ASCENDING) ?: [] as $slug) {
            if ($slug === '.' || $slug === '..' || $slug[0] === '.') continue;
            $dir = $root . '/' . $slug;
            if (!is_dir($dir)) continue;
            $m = self::manifest($dir);
            $ordered = self::orderedFiles($dir);
            $cover = null;
            foreach ($ordered as $name) {
                $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'], true)) {
                    $cover = '/uploads/galleries/' . rawurlencode($slug) . '/' . rawurlencode($name);
                    break;
                }
            }
            $size = 0;
            foreach ($ordered as $name) {
                $size += (int)(@filesize($dir . '/' . $name) ?: 0);
            }
            $galleries[] = [
                'slug' => $slug,
                'title' => $m['title'] !== '' ? $m['title'] : $slug,
                'count' => count($ordered),
                'cover' => $cover,
                'size' => $size,
                'mtime' => @filemtime($dir) ?: 0,
                'shortcode' => '[gallery ' . $slug . ']',
            ];
        }

        jsonResponse(['data' => ['galleries' => $galleries]]);
    }

    /* ============================================================
       СОЗДАНИЕ ГАЛЕРЕИ
       ============================================================ */

    public static function create(PDO $pdo): void
    {
        $payload = Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }

        $title = trim((string)($data['title'] ?? ''));
        $slug = self::normalizeSlug((string)($data['slug'] ?? ''));
        if ($slug === '') {
            // слаг не задан — собираем из названия (латиница останется,
            // кириллица уйдёт в дефисы; тогда требуем слаг явно)
            $slug = self::normalizeSlug($title);
        }
        if ($title === '') {
            jsonResponse(['error' => 'Укажите название галереи'], 422);
        }
        if ($slug === '' || strlen($slug) < 2) {
            jsonResponse(['error' => 'Слаг галереи: латиница, цифры и дефис, минимум 2 знака (например «fabriki»)'], 422);
        }

        $root = self::root();
        $dir = $root . '/' . $slug;
        if (file_exists($dir)) {
            jsonResponse(['error' => 'Галерея с таким слагом уже существует'], 409);
        }
        if (!@mkdir($dir, 0755, true)) {
            jsonResponse(['error' => 'Не удалось создать папку галереи'], 500);
        }
        self::saveManifest($dir, ['title' => $title, 'order' => []]);

        AdminLog::add($pdo, AdminLog::actor($payload), 'galleries.create', $slug);
        jsonResponse(['data' => ['slug' => $slug, 'title' => $title, 'shortcode' => '[gallery ' . $slug . ']']]);
    }

    /* ============================================================
       СОДЕРЖИМОЕ ГАЛЕРЕИ (админ: с размерами и временем)
       ============================================================ */

    public static function items(PDO $pdo): void
    {
        Auth::requireEditor();
        $dir = self::galleryDir((string)($_GET['slug'] ?? ''));
        $slug = basename($dir);
        $m = self::manifest($dir);

        $items = [];
        foreach (self::orderedFiles($dir) as $i => $name) {
            $full = $dir . '/' . $name;
            $items[] = [
                'name' => $name,
                'url' => '/uploads/galleries/' . rawurlencode($slug) . '/' . rawurlencode($name),
                'size' => (int)(@filesize($full) ?: 0),
                'mtime' => @filemtime($full) ?: 0,
                'pos' => $i,
            ];
        }

        jsonResponse(['data' => [
            'slug' => $slug,
            'title' => $m['title'] !== '' ? $m['title'] : $slug,
            'shortcode' => '[gallery ' . $slug . ']',
            'items' => $items,
        ]]);
    }

    /* ============================================================
       ПЕРЕИМЕНОВАНИЕ (заголовок; слаг менять нельзя — сломает шорткоды)
       ============================================================ */

    public static function setTitle(PDO $pdo): void
    {
        $payload = Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }
        $dir = self::galleryDir((string)($data['slug'] ?? ''));
        $title = trim((string)($data['title'] ?? ''));
        if ($title === '') {
            jsonResponse(['error' => 'Название не может быть пустым'], 422);
        }
        $m = self::manifest($dir);
        self::saveManifest($dir, ['title' => mb_substr($title, 0, 120), 'order' => $m['order']]);
        AdminLog::add($pdo, AdminLog::actor($payload), 'galleries.title', basename($dir));
        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ============================================================
       ПОРЯДОК КАРТИНОК: сдвиг влево/вправо
       ============================================================ */

    public static function move(PDO $pdo): void
    {
        $payload = Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }
        $dir = self::galleryDir((string)($data['slug'] ?? ''));
        $name = (string)($data['name'] ?? '');
        $dirMove = (string)($data['dir'] ?? '');
        if (!in_array($dirMove, ['left', 'right'], true)) {
            jsonResponse(['error' => 'dir: left | right'], 422);
        }

        $ordered = self::orderedFiles($dir);
        $i = array_search($name, $ordered, true);
        if ($i === false) {
            jsonResponse(['error' => 'Файл не найден в галерее'], 404);
        }
        $j = $dirMove === 'left' ? $i - 1 : $i + 1;
        if ($j < 0 || $j >= count($ordered)) {
            jsonResponse(['data' => ['order' => $ordered]]); // край — уже и так
        }
        [$ordered[$i], $ordered[$j]] = [$ordered[$j], $ordered[$i]];
        $m = self::manifest($dir);
        self::saveManifest($dir, ['title' => $m['title'], 'order' => $ordered]);
        AdminLog::add($pdo, AdminLog::actor($payload), 'galleries.move', basename($dir) . '/' . $name . ' ' . $dirMove);
        jsonResponse(['data' => ['order' => $ordered]]);
    }

    /* ============================================================
       УДАЛЕНИЕ ОДНОЙ КАРТИНКИ
       ============================================================ */

    public static function removeItem(PDO $pdo): void
    {
        $payload = Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }
        $dir = self::galleryDir((string)($data['slug'] ?? ''));
        $name = (string)($data['name'] ?? '');
        if ($name === '' || $name[0] === '.' || str_contains($name, '/') || str_contains($name, '\\')) {
            jsonResponse(['error' => 'Некорректное имя файла'], 422);
        }
        $full = $dir . '/' . $name;
        if (!is_file($full)) {
            jsonResponse(['error' => 'Файл не найден'], 404);
        }
        if (!@unlink($full)) {
            jsonResponse(['error' => 'Не удалось удалить файл'], 500);
        }
        self::orderedFiles($dir); // синхронизирует манифест
        AdminLog::add($pdo, AdminLog::actor($payload), 'galleries.item-delete', basename($dir) . '/' . $name);
        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ============================================================
       УДАЛЕНИЕ ГАЛЕРЕИ ЦЕЛИКОМ (папка со всем содержимым)
       ============================================================ */

    public static function delete(PDO $pdo): void
    {
        $payload = Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }
        $dir = self::galleryDir((string)($data['slug'] ?? ''));
        $slug = basename($dir);

        // вызовем существующую логику проводника? Она знает про корзину media.
        // У галерей своя простая модель: удаляем рекурсивно безвозвратно —
        // владелец подтверждает это отдельной галочкой в UI.
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $f) {
            $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
        }
        if (!@rmdir($dir)) {
            jsonResponse(['error' => 'Не удалось удалить папку галереи'], 500);
        }
        AdminLog::add($pdo, AdminLog::actor($payload), 'galleries.delete', $slug);
        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ============================================================
       ПУБЛИЧНАЯ ОТДАЧА (витрина): GET /api/galleries/{slug}
       Картинки в порядке манифеста; alt — из манифеста либо из имени.
       ============================================================ */

    public static function publicShow(PDO $pdo, string $slug): void
    {
        /* Несуществующая галерея — честная 404 (витрина это ловит и
           рендерит запасной блок); проверка слага внутри galleryDir. */
        $dir = self::galleryDir($slug);
        $m = self::manifest($dir);

        $items = [];
        foreach (self::orderedFiles($dir) as $name) {
            $items[] = [
                'url' => '/uploads/galleries/' . rawurlencode(basename($dir)) . '/' . rawurlencode($name),
                'alt' => self::altFromName($name),
            ];
        }

        jsonResponse(['data' => [
            'slug' => basename($dir),
            'title' => $m['title'] !== '' ? $m['title'] : basename($dir),
            'items' => $items,
        ]]);
    }
}
