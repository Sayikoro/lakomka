import type { NextConfig } from "next";

// Проксирование /api/* на PHP-бэкенд (сервер-сайд, CORS не нужен).
// Целевой адрес настраивается через API_PROXY_TARGET (по умолчанию — локальный PHP).
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

/* EXPORT_MODE=1 — сборка статического сайта для деплоя на обычный сервер
 * (out/ без Node): API проксировать нечем, /api/* маршрутизирует Apache
 * через .htaccess на PHP; картинки без оптимизатора Next (unoptimized);
 * trailingSlash — чтобы на выходе были папки с index.html (удобно для
 * Apache); отдельный distDir, чтобы не задевать .next dev-сервера. */
const EXPORT_MODE = process.env.EXPORT_MODE === "1";

const nextConfig: NextConfig = EXPORT_MODE
  ? {
      output: "export",
      trailingSlash: true,
      distDir: ".next-static",
      images: { unoptimized: true },
      // admin-роуты на время экспорт-сборки убираются (build-static.sh),
      // а часть клиентских admin-компонентов импортирует типы из этих
      // страниц — проектный type-check падает на отсутствующих модулях.
      // Полную проверку типов выполняет `tsc --noEmit` в build-static.sh
      // ДО убирания админки.
      typescript: { ignoreBuildErrors: true },
    }
  : {
      // Dev-сервер: разрешаем HMR/dev-ресурсы для локальных origin
      // (без этого turbopack-клиент блокируется и гидратация не стартует)
      allowedDevOrigins: ["127.0.0.1", "localhost"],

      images: {
        remotePatterns: [
          { protocol: "https", hostname: "lakomkakhv.ru", pathname: "/wp-content/uploads/**" },
          { protocol: "https", hostname: "www.lakomkakhv.ru", pathname: "/wp-content/uploads/**" },
          { protocol: "https", hostname: "placehold.co", pathname: "/**" },
        ],
      },

      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: `${API_PROXY_TARGET}/api/:path*`,
          },
        ];
      },

      async redirects() {
        return [
          { source: "/shop", destination: "/catalog", permanent: true },
          { source: "/shop/:path*", destination: "/catalog", permanent: true },

          { source: "/checkout-2", destination: "/checkout", permanent: true },
          { source: "/checkout-2/:path*", destination: "/checkout", permanent: true },

          { source: "/my-account", destination: "/", permanent: true },
          { source: "/my-account/:path*", destination: "/", permanent: true },

          { source: "/feed", destination: "/", permanent: true },
          { source: "/comments/feed", destination: "/", permanent: true },
          { source: "/wp-json/:path*", destination: "/", permanent: true },
          { source: "/wp-login.php", destination: "/", permanent: true },
          { source: "/wp-admin/:path*", destination: "/", permanent: true },

          // Старый адрес политики WP → новая страница
          { source: "/privacy-policy", destination: "/privacy", permanent: true },
          { source: "/privacy-policy/:path*", destination: "/privacy", permanent: true },
        ];
      },
    };

export default nextConfig;