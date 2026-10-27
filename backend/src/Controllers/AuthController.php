<?php

require_once __DIR__ . '/../Auth.php';

class AuthController
{
    private const MAX_ATTEMPTS = 5;
    private const WINDOW_MINUTES = 15;

    public static function login(PDO $pdo): void
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];

        $email = trim((string)($data['email'] ?? ''));
        $password = (string)($data['password'] ?? '');

        if ($email === '' || $password === '') {
            jsonResponse(['error' => 'Email и пароль обязательны'], 422);
        }

        $ip = self::clientIp();

        // Rate limit: по IP и по email
        if (self::isRateLimited($pdo, $ip, $email)) {
            jsonResponse([
                'error' => 'Слишком много попыток входа. Попробуйте через ' . self::WINDOW_MINUTES . ' минут.',
                'retry_after' => self::WINDOW_MINUTES * 60,
            ], 429);
        }

        $stmt = $pdo->prepare(
            'SELECT id, email, password_hash, role FROM users WHERE email = ?'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        $ok = $user && password_verify($password, $user['password_hash']);

        // Логируем попытку (и успех, и провал)
        try {
            $pdo->prepare(
                'INSERT INTO login_attempts (ip, email, success) VALUES (?, ?, ?)'
            )->execute([$ip, $email, $ok ? 1 : 0]);
        } catch (Throwable $e) { }

        if (!$ok) {
            jsonResponse(['error' => 'Неверный email или пароль'], 401);
        }

        $role = $user['role'] ?? 'viewer';
        $token = Auth::issueToken((int)$user['id'], $user['email'], $role);

        $pdo->prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
            ->execute([$user['id']]);

        // Очищаем старые записи (старше суток) — чтобы таблица не росла
        try {
            $pdo->exec("DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')");
        } catch (Throwable $e) { }

        setcookie('admin_token', $token, [
            'expires'  => time() + 7 * 24 * 3600,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        jsonResponse([
            'data' => [
                'user' => [
                    'id'    => (int)$user['id'],
                    'email' => $user['email'],
                    'role'  => $role,
                ],
                'token' => $token,
            ],
        ]);
    }

    public static function me(): void
    {
        $payload = Auth::requireAuth();
        jsonResponse([
            'data' => [
                'id'    => $payload['sub'],
                'email' => $payload['email'],
                'role'  => $payload['role'] ?? 'viewer',
            ],
        ]);
    }

    public static function logout(): void
    {
        setcookie('admin_token', '', [
            'expires'  => time() - 3600,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ============================================================
       ВНУТРЕННЕЕ
       ============================================================ */
    private static function clientIp(): string
    {
        // Если за Nginx/Cloudflare — реальный IP в заголовке
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $k) {
            if (!empty($_SERVER[$k])) {
                $ip = explode(',', (string)$_SERVER[$k])[0];
                $ip = trim($ip);
                if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
            }
        }
        return '0.0.0.0';
    }

    private static function isRateLimited(PDO $pdo, string $ip, string $email): bool
    {
        $window = '-' . self::WINDOW_MINUTES . ' minutes';

        // По IP
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM login_attempts
             WHERE ip = ? AND success = 0 AND created_at > datetime('now', ?)"
        );
        $stmt->execute([$ip, $window]);
        if ((int)$stmt->fetchColumn() >= self::MAX_ATTEMPTS) return true;

        // По email
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM login_attempts
             WHERE email = ? AND success = 0 AND created_at > datetime('now', ?)"
        );
        $stmt->execute([$email, $window]);
        if ((int)$stmt->fetchColumn() >= self::MAX_ATTEMPTS) return true;

        return false;
    }
}