<?php

class Database
{
    private static ?PDO $instance = null;

    public static function get(): PDO
    {
        if (self::$instance instanceof PDO) {
            return self::$instance;
        }

        $config = require __DIR__ . '/../config.php';
        $dbPath = $config['db_path'];

        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA synchronous = NORMAL');

        /* Task 158: поиск без учёта регистра для кириллицы.
         * LIKE в SQLite сравнивает регистр только ASCII-букв: «подарок»
         * не находил «Подарок». Регистрируем функцию mb_lower() —
         * оба сравниваемых выражения опускаются через mb_strtolower,
         * поэтому поиск по названию/SKU/производителю/номеру заказа
         * находит и «Изюм», и «изюм». Функция вешается на общее
         * соединение (Database::get()) — все контроллеры её видят. */
        self::registerCaseInsensitiveHelpers($pdo);

        self::$instance = $pdo;
        return $pdo;
    }

    /** Task 158: mb_lower() на любом PDO-соединении (get() зовёт для
     * боевого соединения, тесты — для своих временных баз). */
    public static function registerCaseInsensitiveHelpers(PDO $pdo): void
    {
        try {
            $pdo->sqliteCreateFunction(
                'mb_lower',
                static fn(?string $s): ?string => $s === null ? null : mb_strtolower($s, 'UTF-8'),
                1
            );
        } catch (PDOException) {
            /* нет поддержки sqliteCreateFunction — поиски останутся как были */
        }
    }
}