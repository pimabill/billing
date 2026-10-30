/**
 * Everything brand- and deployment-specific on the landing page. Renaming
 * the product is a change of NEXT_PUBLIC_BRAND_* values, not of copy.
 */
const env = (key: string, fallback: string) => process.env[key] || fallback;

export const site = {
  name: env("NEXT_PUBLIC_BRAND_NAME", "PimaBill"),
  /** Shown in the header as two tones: name split at this index (0 = one tone). */
  nameSplit: Number(env("NEXT_PUBLIC_BRAND_NAME_SPLIT", "4")),
  tagline: env("NEXT_PUBLIC_BRAND_TAGLINE", "Open-source billing for the way Africa pays"),
  description: env(
    "NEXT_PUBLIC_BRAND_DESCRIPTION",
    "Open-source subscription and usage billing with mobile money, cards, bank payouts and crypto, on a double-entry ledger. MTN MoMo, Airtel Money, Flutterwave, Paystack, Stripe and more. Self-host it or use the cloud.",
  ),
  url: env("NEXT_PUBLIC_SITE_URL", "https://pimabill.com").replace(/\/$/, ""),
  githubUrl: env("NEXT_PUBLIC_GITHUB_URL", "https://github.com/pimabill/billing"),
  dashboardUrl: env("NEXT_PUBLIC_DASHBOARD_URL", "https://app.pimabill.com"),
  docsUrl: env("NEXT_PUBLIC_DOCS_URL", "https://docs.pimabill.com"),
  apiRefUrl: env("NEXT_PUBLIC_API_REF_URL", "https://api.pimabill.com/api/reference"),
  contactEmail: env("NEXT_PUBLIC_CONTACT_EMAIL", "hello@pimabill.com"),
  twitter: env("NEXT_PUBLIC_TWITTER_HANDLE", ""),
  logo: env("NEXT_PUBLIC_BRAND_LOGO", "/logo.svg"),
  license: "AGPL-3.0",
};

export const keywords = [
  "open source billing",
  "subscription billing API",
  "usage-based billing open source",
  "mobile money billing API",
  "billing platform Africa",
  "MTN MoMo subscription billing",
  "Airtel Money recurring payments API",
  "mobile money recurring billing",
  "Flutterwave subscription alternative",
  "Paystack recurring billing mobile money",
  "Uganda payment gateway API",
  "Yo! Payments API integration",
  "USDT TRC20 payment billing",
  "multi-currency billing UGX KES NGN",
  "double-entry ledger API open source",
  "payouts API emerging markets",
  "self-hosted Stripe Billing alternative",
  "Lago alternative",
  "Kill Bill alternative",
  "Chargebee open source alternative",
];

/** Every rail the software can collect or pay out with. */
export const rails = {
  mobileMoney: ["MTN MoMo", "Airtel Money", "Yo! Payments", "Eversend"],
  cardsAndBanks: ["Flutterwave", "Paystack", "Stripe", "PayPal", "Pesapal", "PayU", "DPO"],
  crypto: ["USDT on TRON", "USDT on Ethereum", "USDT on BNB Chain", "Bitcoin", "NOWPayments", "Binance Pay"],
};
