<?php
/**
 * Task 60: save SMTP password from env SMTP_PASS and live-test AUTH.
 * Usage: SMTP_PASS='...' .ztools/php scripts/save-smtp-pass.php
 * The password is NEVER printed, logged or written to worklog.
 * Upserts settings.smtp_pass in the working DB and the git clone DB (parity).
 */
declare(strict_types=1);

require_once __DIR__ . '/../backend/src/Database.php';

$pass = getenv('SMTP_PASS');
if ($pass === false || $pass === '') {
    fwrite(STDERR, "ERR: SMTP_PASS env is empty\n");
    exit(1);
}
// Guard: mask pasted instead of a password (bullets/dots/stars/spaces only)
$trimmed = trim($pass);
if ($trimmed !== '' && preg_match('/^[•*·.\s]+$/u', $trimmed)) {
    fwrite(STDERR, "ERR: mask pasted instead of password (bullets/dots/stars)\n");
    exit(1);
}
if (mb_strlen($trimmed) < 6) {
    fwrite(STDERR, "ERR: password suspiciously short (<6)\n");
    exit(1);
}

$targets = [
    __DIR__ . '/../backend/storage/database.sqlite',
    __DIR__ . '/../lakomka/backend/storage/database.sqlite',
];

foreach ($targets as $path) {
    if (!is_file($path)) { echo "skip (no file): $path\n"; continue; }
    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $st = $pdo->prepare(
        "INSERT INTO settings(key, value) VALUES('smtp_pass', :v) " .
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    $st->execute([':v' => $trimmed]);
    $len = $pdo->query("SELECT length(value) FROM settings WHERE key='smtp_pass'")->fetchColumn();
    echo "saved: $path (len=$len)\n";
    $pdo = null;
}

// ---- live AUTH LOGIN test against the SMTP server from settings ----
$db = Database::get();
$host   = (string)($db->query("SELECT value FROM settings WHERE key='smtp_host'")->fetchColumn() ?: '');
$port   = (string)($db->query("SELECT value FROM settings WHERE key='smtp_port'")->fetchColumn() ?: '465');
$secure = (string)($db->query("SELECT value FROM settings WHERE key='smtp_secure'")->fetchColumn() ?: 'ssl');
$user   = (string)($db->query("SELECT value FROM settings WHERE key='smtp_user'")->fetchColumn() ?: '');
if ($host === '' || $user === '') { fwrite(STDERR, "ERR: smtp_host/smtp_user not set\n"); exit(1); }

$transport = ($secure === 'ssl' ? 'ssl' : 'tcp') . "://$host:$port";
echo "connecting: " . ($secure === 'ssl' ? 'ssl' : 'tcp') . "://$host:$port\n";

$fp = @stream_socket_client($transport, $errno, $errstr, 15);
if (!$fp) { fwrite(STDERR, "ERR: connect failed: $errstr\n"); exit(1); }
stream_set_timeout($fp, 15);

$read = function () use ($fp): string {
    $data = '';
    while (($line = fgets($fp, 512)) !== false) {
        $data .= $line;
        if (isset($line[3]) && $line[3] === ' ') break; // last line of reply
    }
    return $data;
};
$code = function (string $reply): string { return substr($reply, 0, 3); };

$banner = $read();
echo "banner: " . $code($banner) . "\n";
fwrite($fp, "EHLO lakomka.local\r\n");
echo "ehlo: " . $code($read()) . "\n";
fwrite($fp, "AUTH LOGIN\r\n");
$r = $read(); echo "auth: " . $code($r) . "\n";
if ($code($r) !== '334') { fwrite(STDERR, "ERR: server refused AUTH LOGIN\n"); exit(1); }
fwrite($fp, base64_encode($user) . "\r\n");
$r = $read();
if ($code($r) !== '334') { fwrite(STDERR, "ERR: after user: $r"); exit(1); }
fwrite($fp, base64_encode($trimmed) . "\r\n");
$r = $read();
$c = $code($r);
if ($c === '235') {
    echo "AUTH OK (235) — credentials valid\n";
} else {
    fwrite(STDERR, "AUTH FAILED ($c): " . trim(str_replace("\r\n", ' | ', $r)) . "\n");
    exit(2);
}
fwrite($fp, "QUIT\r\n");
fclose($fp);
echo "DONE\n";
