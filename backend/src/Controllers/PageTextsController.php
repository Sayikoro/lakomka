<?php

require_once __DIR__ . '/../Auth.php';

/**
 * Тексты страниц витрины («Настройки → Текст на страницах»).
 * Хранятся в таблице settings под ключами text_<key> (ключи реестра
 * объявлены на фронтенде в src/lib/page-texts.ts). Пустое значение
 * означает «использовать дефолт из реестра».
 */
class PageTextsController
{
    /** GET /api/admin/page-texts — все сохранённые значения (text_*) */
    public static function show(PDO $pdo): void
    {
        Auth::requireAuth();

        $rows = $pdo->query(
            "SELECT key, value FROM settings WHERE key LIKE 'text_%'"
        )->fetchAll();

        $out = [];
        foreach ($rows as $r) {
            $out[substr((string)$r['key'], strlen('text_'))] = (string)$r['value'];
        }
        jsonResponse(['data' => $out]);
    }

    /**
     * POST /api/admin/page-texts
     * JSON: { "<key>": "<value>", ... } — апсерт пачкой.
     * Пустая строка = сбросить на дефолт (значение остаётся пустым,
     * витрина подставляет дефолт из реестра).
     */
    public static function update(PDO $pdo): void
    {
        Auth::requireAuth();

        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }

        $upd = $pdo->prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );

        $saved = 0;
        foreach ($data as $key => $value) {
            $key = (string)$key;
            if (!preg_match('/^[a-z0-9_]+$/', $key)) {
                jsonResponse(['error' => 'Некорректный ключ: ' . $key], 422);
            }
            if (!is_scalar($value)) {
                jsonResponse(['error' => 'Значение должно быть строкой: ' . $key], 422);
            }
            $value = (string)$value;
            if (mb_strlen($value) > 50000) {
                jsonResponse(['error' => 'Текст слишком длинный: ' . $key], 422);
            }
            $upd->execute(['text_' . $key, $value]);
            $saved++;
        }

        jsonResponse(['data' => ['ok' => true, 'saved' => $saved]]);
    }
}
