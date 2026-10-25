import { site } from "@/lib/site";

/** Shown on the page and published as FAQPage structured data; keep answers plain text. */
export const faq = [
  {
    question: `Is ${site.name} free and open source?`,
    answer: `Yes. ${site.name} is released under the AGPL-3.0 licence and the SDKs under MIT. You can self-host it with Docker at no cost, or use our cloud: free up to 1,000 customers, then Growth, with no limits, at $15 a month, payable in your own currency (UGX 55,000, KES 1,900, NGN 22,000 and more). Enterprise is priced with you. Managed payments are part of the cloud only.`,
  },
  {
    question: "Can I bill customers with mobile money?",
    answer:
      "Yes. Collect and pay out with MTN MoMo and Airtel Money directly, or through Yo! Payments, Flutterwave, Eversend and other providers, alongside cards, bank transfers and PayPal.",
  },
  {
    question: "Does it support usage-based and subscription billing?",
    answer:
      "Both. Define plans with standard, graduated, volume, package or percentage pricing, meter usage events, apply coupons and add-ons, and invoice automatically on any billing interval.",
  },
  {
    question: "Do you hold my money?",
    answer: `Not when you connect your own payment providers or crypto wallet: payments go straight to your accounts, and ${site.name} records every movement in a double-entry ledger. If you would rather not set up payment providers, managed payments on our cloud takes payments for you and pays them out to your mobile money, bank or PayPal, and you can change where they go at any time.`,
  },
  {
    question: "Can I test without moving real money?",
    answer: `Yes. A sandbox runs the same ${site.name} against the payment providers' test accounts. Switch to it from the dashboard to get sk_test_ API keys and separate test data; your live account keeps working as it is.`,
  },
  {
    question: "Can I accept crypto?",
    answer:
      "Yes. Receive USDT on TRON, Ethereum or BNB Chain and Bitcoin straight to your own wallet with no processor, or use NOWPayments, Eversend or Binance Pay.",
  },
  {
    question: "Can my team use it with different permissions?",
    answer:
      "Yes. Invite teammates as owner, admin, finance, developer or viewer, and manage several organisations from one login.",
  },
  {
    question: "Which currencies are supported?",
    answer: "Any ISO 4217 currency, including UGX, KES, NGN, GHS, TZS, RWF, ZAR, USD, EUR and GBP, with the right number of decimals for each: none for UGX, two for KES, three for KWD.",
  },
  {
    question: "What do I need to self-host it?",
    answer:
      "Docker. One docker compose command starts PostgreSQL, Redis, the API, the background worker, the dashboard and the docs. Each organisation gets its own database.",
  },
  {
    question: "How does it compare with Lago, Kill Bill or Chargebee?",
    answer: `${site.name} covers the same ground as those subscription and usage billing tools (plans, metering, invoices, dunning) and adds mobile money, payouts, wallet transfers, crypto and a double-entry ledger in the same open-source product.`,
  },
];
