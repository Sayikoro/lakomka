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

    /** Каталог экспортных архивов: …/exports (создаётся при отсутствии). */
    public static function exportsDir(): string
    {
        return self::ensureDir(self::publicRoot() . '/exports');
    }

    /** Каталог автоматических дампов БД: backend/storage/backups.
     *  Вне publicRoot намеренно: копии базы не должны быть доступны
     *  веб-серверу напрямую (только через проводник админки). */
    public static function backupsDir(): string
    {
        return self::ensureDir(dirname(__DIR__) . '/storage/backups');
    }

    /** mkdir рекурсивно, без ошибок в вывод (права проверяет вызывающий код). */
    public static function ensureDir(string $dir): string
    {
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        return $dir;
    }
}
