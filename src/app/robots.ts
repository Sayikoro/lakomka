import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export const dynamic = "force-static"; // требуется для output: export

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/admin", "/api/", "/order/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}