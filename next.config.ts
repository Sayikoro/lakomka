import type { NextConfig } from "next";

// Проксирование /api/* на PHP-бэкенд (сервер-сайд, CORS не нужен).
// Целевой адрес настраивается через API_PROXY_TARGET (по умолчанию — локальный PHP).
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
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