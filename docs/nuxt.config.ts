const DOCS_URL = process.env.DOCS_URL || "https://docs.pimabill.com";
// Docus builds the sitemap and llms.txt from this variable only, so set it from DOCS_URL.
process.env.NUXT_SITE_URL ||= DOCS_URL;

export default defineNuxtConfig({
  // Canonical links, the sitemap, social cards and llms.txt are built from this.
  site: {
    url: DOCS_URL,
    name: "PimaBill Docs",
  },
  runtimeConfig: {
    public: { siteUrl: DOCS_URL },
  },
  llms: {
    domain: DOCS_URL,
  },
  css: ["~/assets/css/brand.css"],
  app: {
    head: {
      htmlAttrs: { lang: "en" },
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
        { rel: "apple-touch-icon", href: "/logo.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600&family=Unbounded:wght@500;600&display=swap",
        },
      ],
      meta: [{ name: "theme-color", content: "#0e6e6b" }],
    },
  },
});
