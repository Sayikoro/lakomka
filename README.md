# Lakomka Shop — интернет-магазин сладостей

Полнофункциональный магазин конфет и подарочных наборов: витрина, корзина, оформление заказа и админ-панель с управлением товарами, наборами (bundle), заказами, пользователями и медиа.

## Стек

| Слой | Технологии |
|------|-----------|
| Фронтенд | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Zustand, react-hook-form + zod |
| Бэкенд | PHP 8.2+ (без фреймворка), SQLite (WAL), PHPMailer |
| Авторизация | JWT (HS256) в httpOnly-cookie, роли: `super_admin` / `editor` / `viewer` |

## Структура

```
src/app/(shop)/      Витрина: главная, каталог, товар, корзина, checkout, заказ
src/app/admin/       Админка (защищена middleware по cookie + роли)
src/lib/             API-клиенты (серверный products.ts, клиентский api.ts)
src/store/cart.ts    Корзина (Zustand + persist)
backend/
  public/index.php   Роутер API (все ручки под /api/*)
  src/Controllers/   Контроллеры (Auth, Orders, Products, Media, ...)
  src/Crypto.php     Шифрование PII заказов (AES-256-GCM) + blind index телефона
  scripts/           Миграции, сиды, импорт из WooCommerce
  config.php         Конфиг (без секретов; секреты — в config.local.php)
public/uploads/      Медиа товаров (добавляются через админку)
```

## Быстрый старт (локально)

Требования: PHP 8.2+ (sqlite3, mbstring, openssl), Node.js 20+, bun/npm.

```bash
# 1. Бэкенд
cd backend
cp config.example.php config.local.php        # впишите свежие jwt_secret и encryption_key:
# php -r "echo bin2hex(random_bytes(32));"
php scripts/migrate.php                       # каноническая схема БД
php scripts/seed-admin.php                    # админ: admin@lakomka.local / changeme123
php scripts/seed-categories.php
php scripts/seed-settings.php
php -S 127.0.0.1:8000 -t public               # API: http://127.0.0.1:8000/api/health

# 2. Фронтенд (в корне репозитория)
cp .env.example .env.local                    # см. переменные ниже
npm install
npm run dev                                   # http://localhost:3000
```

### Переменные окружения (`.env.local`)

| Переменная | Назначение | Пример |
|-----------|------------|--------|
| `NEXT_PUBLIC_API_URL` | Базовый URL API для браузера | `/api` (через прокси) или `http://localhost:8000/api` |
| `PHP_API_URL` | URL API для серверных запросов Next.js | `http://127.0.0.1:8000/api` |
| `API_PROXY_TARGET` | Куда проксировать `/api/*` (next.config.ts) | `http://127.0.0.1:8000` |

Рекомендуется схема с прокси: `NEXT_PUBLIC_API_URL=/api` — фронт и API на одном origin, CORS и cookie-проблемы исчезают.

## Импорт данных из WooCommerce

```bash
php backend/scripts/import-wc.php backend/wc-product-export.csv   # товары + наборы
php backend/scripts/download-external-images.php                  # скачать картинки (или...)
php backend/scripts/relink-images.php                             # ...привязать уже скачанные
php backend/scripts/import-weight-recipes.php backend/scripts/lakomka2027.csv  # весовые рецепты
```

## Безопасность — обязательно к прочтению

- `backend/config.local.php` содержит ключи шифрования и подписи JWT — **никогда не коммитится** (в `.gitignore`).
- `encryption_key` шифрует PII заказов в БД. Потеря ключа = потеря данных заказов. Храните в менеджере паролей.
- Пароль администратора по умолчанию (`changeme123`) — сменить сразу после первого входа.
- Загрузка файлов: проверка MIME, случайные имена, лимиты размеров, путь только внутри `public/uploads/products/<slug>/`.

## Полезные команды

```bash
npm run backend:migrate   # применить схему
npm run backend:seed      # сиды админа/категорий/настроек
php backend/scripts/backup-db.php   # бэкап SQLite
php backend/scripts/rotate-logs.php # ротация логов
```
