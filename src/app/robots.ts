import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export const dynamic = "force-static"; // требуется для output: export

/**
 * ИИ-краулеры (обучение моделей, автономные агенты, ИИ-поиск) — полный запрет.
 * Классические поисковики (Google, Bing, Yandex) не затронуты.
 */
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Bytespider",
  "PerplexityBot",
  "Perplexity-User",
  "YouBot",
  "Amazonbot",
  "Applebot-Extended",
  "Diffbot",
  "ImagesiftBot",
  "Meta-ExternalAgent",
  "FacebookBot",
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/admin", "/api/", "/order/"],
      },
      ...AI_BOTS.map((userAgent) => ({
        userAgent,
        disallow: ["/"],
      })),
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
