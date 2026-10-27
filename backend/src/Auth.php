<?php

class Auth
{
    private static function config(): array
    {
        static $cfg = null;
        if ($cfg === null) {
            $cfg = require __DIR__ . '/../config.php';
        }
        return $cfg;
    }

    private static function b64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64urlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/'));
    }

    public static function issueToken(int $userId, string $email, string $role): string
    {
        $cfg = self::config();
        $header = self::b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = self::b64url(json_encode([
            'sub'   => $userId,
            'email' => $email,
            'role'  => $role,
            'iat'   => time(),
            'exp'   => time() + ($cfg['jwt_ttl'] ?? 604800),
        ]));
        $signature = self::b64url(
            hash_hmac('sha256', "$header.$payload", $cfg['jwt_secret'], true)
        );
        return "$header.$payload.$signature";
    }

    public static function verify(string $token): ?array
    {
        $cfg = self::config();
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $payload, $signature] = $parts;
        $expected = self::b64url(
            hash_hmac('sha256', "$header.$payload", $cfg['jwt_secret'], true)
        );

        if (!hash_equals($expected, $signature)) return null;

        $data = json_decode(self::b64urlDecode($payload), true);
        if (!is_array($data)) return null;
        if (($data['exp'] ?? 0) < time()) return null;

        return $data;
    }

    /**
     * Возвращает payload с АКТУАЛЬНОЙ ролью из БД.
     * Это гарантирует, что понижение роли срабатывает мгновенно,
     * не дожидаясь истечения JWT.
     */
    public static function requireAuth(): array
    {
        // Токен берём из httpOnly-cookie (основной путь).
        // Fallback: заголовок Authorization: Bearer ... (для API-клиентов и тестов).
        $token = $_COOKIE['admin_token'] ?? '';
        if ($token === '' && preg_match('/Bearer\s+(\S+)/i', $_SERVER['HTTP_AUTHORIZATION'] ?? '', $m)) {
            $token = $m[1];
        }
        if ($token === '') {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }

        $payload = self::verify($token);
        if (!$payload) {
            http_response_code(401);
            echo json_encode(['error' => 'Token invalid']);
            exit;
        }

        // Проверяем, что пользователь существует и берём актуальную роль
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT role FROM users WHERE id = ?');
        $stmt->execute([$payload['sub']]);
        $currentRole = $stmt->fetchColumn();

        if (!$currentRole) {
            http_response_code(401);
            echo json_encode(['error' => 'Пользователь не существует']);
            exit;
        }

        $payload['role'] = $currentRole;
        return $payload;
    }

    public static function requireRole(array $allowedRoles): array
    {
        $payload = self::requireAuth();
        $role = $payload['role'] ?? '';

        if (!in_array($role, $allowedRoles, true)) {
            http_response_code(403);
            echo json_encode(['error' => 'Недостаточно прав']);
            exit;
        }

        return $payload;
    }

    public static function requireSuperAdmin(): array
    {
        return self::requireRole(['super_admin']);
    }

    public static function requireEditor(): array
    {
        return self::requireRole(['editor', 'super_admin']);
    }
}