<?php

/**
 * Пути к файловому хранилищу сайта.
 *
 * Проект живёт в двух раскладках:
 *  - DEV (Next.js):   <проект>/public/uploads/…   (обёртка public/)
 *  - ДЕПЛОЙ (пакет):  <корень-пакета>/uploads/…   (uploads в корне, public/ нет)
 *
 * До появления этого класса контроллеры жёстко считали путь
 * «__DIR__/../../../public/uploads» — на развёрнутом сайте папки public/
 * нет, realpath() возвращал false, и файловый менеджер отвечал
 * «Раздел недоступен», а загрузка картинок/PDF/экспорт молча не работала.
 */
class Paths
{
    /** Корень сайта: каталог, в котором лежит backend/ (проект или пакет). */
    public static function siteRoot(): string
    {
        return dirname(__DIR__, 2);
    }

    /** Каталог, который веб-сервер раздаёт по «/» (в нём лежат uploads/, exports/…).
     *  DEV: <проект>/public; ДЕПЛОЙ: корень пакета. */
    public static function publicRoot(): string
    {
        static $root = null;
        if ($root === null) {
            $site = self::siteRoot();
            $root = is_dir($site . '/public') ? $site . '/public' : $site;
        }
        return $root;
    }

    /** Хранилище медиа: …/uploads (создаётся при отсутствии). */
    public static function uploadsRoot(): string
    {
        return self::ensureDir(self::publicRoot() . '/uploads');
    }

    /** Непубличное хранилище админки: backend/storage.
     *  Вне publicRoot намеренно (аудит Task 131): экспортные ZIP, корзина
     *  файлов и chunked-загрузки не должны раздаваться веб-сервером
     *  по прямой ссылке без авторизации. */
    public static function adminDataRoot(): string
    {
        return self::ensureDir(dirname(__DIR__) . '/storage');
    }

    /** Каталог экспортных архивов: backend/storage/exports.
     *  SECURITY (аудит Task 131): раньше был publicRoot()/exports — полные
     *  CSV товаров и отчёты сжатия скачивались статикой без auth.
     *  Старые файлы разово переносится из публичной папки. */
    public static function exportsDir(): string
    {
        $dir = self::ensureDir(self::adminDataRoot() . '/exports');
        self::migrateLegacyPublicDir(self::publicRoot() . '/exports', $dir);
        return $dir;
    }

    /** Разовая миграция: содержимое старой (публичной) папки переносится
     *  в приватную; пустой остов старой удаляется. Идемпотентно. */
    public static function migrateLegacyPublicDir(string $old, string $new): void
    {
        if (!is_dir($old)) return;
        foreach (scandir($old, SCANDIR_SORT_NONE) ?: [] as $f) {
            if ($f === '.' || $f === '..') continue;
            $target = $new . '/' . $f;
            if (file_exists($target)) { @unlink($old . '/' . $f); continue; }
            @rename($old . '/' . $f, $target)
                || (@copy($old . '/' . $f, $target) && @unlink($old . '/' . $f));
        }
        @rmdir($old);
    }

    /** Каталог автоматических дампов БД: backend/storage/backups.
     *  Вне publicRoot намеренно: копии базы не должны быть доступны
     *  веб-серверу напрямую (только через проводник админки). */
    public static function backupsDir(): string
    {
        return self::ensureDir(dirname(__DIR__) . '/storage/backups');
    }

    /** Task 146: корень галерей (вкладка «Галерея» в разделе «Файлы»):
     *  …/uploads/galleries. Каждая галерея — подпапка, её имя = слаг
     *  шорткода [gallery слаг]; картинки внутри, порядок и заголовок —
     *  в манифесте .order.json (скрыт из листинга и отдачи). Папка
     *  публичная: картинки раздаются статикой по /uploads/galleries/… */
    public static function galleriesDir(): string
    {
        return self::ensureDir(self::uploadsRoot() . '/galleries');
    }

    /** mkdir рекурсивно, без ошибок в вывод (права проверяет вызывающий код). */
    public static function ensureDir(string $dir): string
    {
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        return $dir;
    }
}
