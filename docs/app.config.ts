const LANDING_URL = process.env.LANDING_URL || "https://pimabill.com";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://app.pimabill.com";
const API_REF_URL = process.env.API_REF_URL || "https://api.pimabill.com/api/reference";
const GITHUB_URL = process.env.GITHUB_URL || "https://github.com/pimabill/billing";

export default defineAppConfig({
  docus: {
    locale: "en",
  },
  seo: {
    title: "PimaBill Docs",
    description:
      "Documentation for PimaBill, open-source billing for the way Africa pays: subscriptions, usage billing, mobile money, payouts, crypto and a double-entry ledger.",
  },
  header: {
    title: "PimaBill",
  },
  github: {
    url: GITHUB_URL,
    branch: "main",
    rootDir: "docs",
  },
  socials: {
    github: GITHUB_URL,
  },
  toc: {
    title: "On this page",
    bottom: {
      title: "PimaBill",
      links: [
        { icon: "i-lucide-house", label: "Home", to: LANDING_URL, target: "_blank" },
        { icon: "i-lucide-layout-dashboard", label: "Dashboard", to: DASHBOARD_URL, target: "_blank" },
        { icon: "i-lucide-braces", label: "API reference", to: API_REF_URL, target: "_blank" },
      ],
    },
  },
  ui: {
    colors: {
      primary: "teal",
      neutral: "slate",
    },
  },
});
