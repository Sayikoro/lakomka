<?php

require_once __DIR__ . '/../Auth.php';

class AdminUsersController
{
    private const VALID_ROLES = ['super_admin', 'editor', 'viewer'];

    public static function list(PDO $pdo): void
    {
        Auth::requireSuperAdmin();

        $rows = $pdo->query(
            'SELECT id, email, name, role, last_login_at, created_at
             FROM users ORDER BY id'
        )->fetchAll();

        jsonResponse(['data' => $rows]);
    }

    public static function create(PDO $pdo): void
    {
        $actor = Auth::requireSuperAdmin();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) jsonResponse(['error' => 'Invalid JSON'], 400);

        $email = trim((string)($data['email'] ?? ''));
        $password = (string)($data['password'] ?? '');
        $name = trim((string)($data['name'] ?? ''));
        $role = (string)($data['role'] ?? 'viewer');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'Некорректный email'], 422);
        }
        if (strlen($password) < 6) {
            jsonResponse(['error' => 'Пароль не короче 6 символов'], 422);
        }
        if (!in_array($role, self::VALID_ROLES, true)) {
            jsonResponse(['error' => 'Некорректная роль'], 422);
        }

        $check = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
        $check->execute([$email]);
        if ($check->fetchColumn()) {
            jsonResponse(['error' => 'Пользователь с таким email уже есть'], 422);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);

        $stmt = $pdo->prepare(
            'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$email, $hash, $name !== '' ? $name : null, $role]);

        jsonResponse(['data' => ['id' => (int)$pdo->lastInsertId()]], 201);
    }

    public static function update(PDO $pdo, int $id): void
    {
        $actor = Auth::requireSuperAdmin();
        $actorId = (int)$actor['sub'];

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) jsonResponse(['error' => 'Invalid JSON'], 400);

        $exists = $pdo->prepare('SELECT id, role FROM users WHERE id = ?');
        $exists->execute([$id]);
        $current = $exists->fetch();
        if (!$current) jsonResponse(['error' => 'Пользователь не найден'], 404);

        $fields = [];
        $params = [];

        if (array_key_exists('email', $data)) {
            $email = trim((string)$data['email']);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(['error' => 'Некорректный email'], 422);
            }
            $dup = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ?');
            $dup->execute([$email, $id]);
            if ($dup->fetchColumn()) {
                jsonResponse(['error' => 'Email уже занят'], 422);
            }
            $fields[] = 'email = ?';
            $params[] = $email;
        }

        if (array_key_exists('name', $data)) {
            $n = trim((string)$data['name']);
            $fields[] = 'name = ?';
            $params[] = $n !== '' ? $n : null;
        }

        if (array_key_exists('role', $data)) {
            $role = (string)$data['role'];
            if (!in_array($role, self::VALID_ROLES, true)) {
                jsonResponse(['error' => 'Некорректная роль'], 422);
            }

            // Запрет: понизить последнего super_admin
            if ($current['role'] === 'super_admin' && $role !== 'super_admin') {
                $cnt = (int)$pdo->query(
                    "SELECT COUNT(*) FROM users WHERE role = 'super_admin'"
                )->fetchColumn();
                if ($cnt <= 1) {
                    jsonResponse(['error' => 'Нельзя понизить последнего супер-админа'], 422);
                }
            }

            // Запрет: супер-админ понижает сам себя
            if ($id === $actorId && $role !== 'super_admin' && $current['role'] === 'super_admin') {
                jsonResponse([
                    'error' => 'Нельзя понизить себя. Попросите другого супер-админа.',
                ], 422);
            }

            $fields[] = 'role = ?';
            $params[] = $role;
        }

        if (array_key_exists('password', $data)) {
            $pwd = (string)$data['password'];
            if ($pwd !== '') {
                if (strlen($pwd) < 6) {
                    jsonResponse(['error' => 'Пароль не короче 6 символов'], 422);
                }
                $fields[] = 'password_hash = ?';
                $params[] = password_hash($pwd, PASSWORD_DEFAULT);
            }
        }

        if ($fields === []) jsonResponse(['error' => 'Нет полей для обновления'], 422);

        $params[] = $id;
        $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')
            ->execute($params);

        $get = $pdo->prepare(
            'SELECT id, email, name, role, last_login_at, created_at FROM users WHERE id = ?'
        );
        $get->execute([$id]);
        jsonResponse(['data' => $get->fetch()]);
    }

    public static function destroy(PDO $pdo, int $id): void
    {
        $actor = Auth::requireSuperAdmin();
        $actorId = (int)$actor['sub'];

        if ($actorId === $id) {
            jsonResponse(['error' => 'Нельзя удалить самого себя'], 422);
        }

        $stmt = $pdo->prepare('SELECT role FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $role = $stmt->fetchColumn();
        if (!$role) jsonResponse(['error' => 'Пользователь не найден'], 404);

        if ($role === 'super_admin') {
            $cnt = (int)$pdo->query(
                "SELECT COUNT(*) FROM users WHERE role = 'super_admin'"
            )->fetchColumn();
            if ($cnt <= 1) {
                jsonResponse(['error' => 'Нельзя удалить последнего супер-админа'], 422);
            }
        }

        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        jsonResponse(['data' => ['ok' => true]]);
    }

    /** Смена пароля с явной проверкой длины. Возвращает только ok. */
    public static function changePassword(PDO $pdo, int $id): void
    {
        $actor = Auth::requireSuperAdmin();
        $actorId = (int)$actor['sub'];

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) jsonResponse(['error' => 'Invalid JSON'], 400);

        $password = (string)($data['password'] ?? '');
        if (strlen($password) < 6) {
            jsonResponse(['error' => 'Пароль не короче 6 символов'], 422);
        }

        $stmt = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) {
            jsonResponse(['error' => 'Пользователь не найден'], 404);
        }

        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $id]);

        // Если супер-админ меняет СВОЙ пароль — ничего особенного, JWT остаётся валидным
        // (в JWT нет хеша пароля). Если чужой — тот перелогинится со старым паролем
        // и получит ошибку, что правильно.
        jsonResponse(['data' => ['ok' => true, 'self' => $id === $actorId]]);
    }

    /** Сгенерировать случайный пароль и сразу записать его пользователю */
    public static function resetPassword(PDO $pdo, int $id): void
    {
        $actor = Auth::requireSuperAdmin();
        $actorId = (int)$actor['sub'];

        $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $email = $stmt->fetchColumn();
        if (!$email) jsonResponse(['error' => 'Пользователь не найден'], 404);

        // 12 hex-символов ~ 48 бит энтропии — достаточно для временного пароля
        $plain = bin2hex(random_bytes(6));
        $hash = password_hash($plain, PASSWORD_DEFAULT);

        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([$hash, $id]);

        jsonResponse([
            'data' => [
                'ok' => true,
                'password' => $plain,
                'email' => $email,
                'self' => $id === $actorId,
            ],
        ]);
    }
}