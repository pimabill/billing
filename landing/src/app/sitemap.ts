import type { MetadataRoute } from "next";
import { topicPages } from "@/lib/pages";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (site.noindex) return [];
  const now = new Date();
  return [
    { url: `${site.url}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...topicPages.map((p) => ({
      url: `${site.url}/${p.path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: p.path === "pricing" || p.path === "mobile-money-billing" ? 0.9 : 0.7,
    })),
  ];
}
