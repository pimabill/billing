/**
 * The landing's topic pages: one per search intent (a country, a use case,
 * an alternative people compare us with). Each renders through
 * components/topic-page.tsx with its own title, description, breadcrumbs
 * and FAQ structured data, and is listed in the sitemap.
 *
 * Keep every claim true of the product: say "through Flutterwave" where a
 * method comes from a gateway, and never promise automatic mobile money
 * debits (renewals go out as payment links).
 */
import { site } from "./site";

export interface TopicSection {
  heading: string;
  body?: string[];
  bullets?: string[];
}

export interface TopicPage {
  /** Path under the site root, without a leading slash. */
  path: string;
  /** Short link text, for the footer. */
  nav: string;
  /** <title>, under ~60 characters with the site name added. */
  title: string;
  /** Meta description, ~150 characters. */
  description: string;
  /** Where it sits: shown as the eyebrow and in the breadcrumbs. */
  section: { name: string; path?: string };
  h1: string;
  lede: string;
  sections: TopicSection[];
  faq: { question: string; answer: string }[];
  /** Paths of related topic pages, for internal links. */
  related: string[];
}

/** Growth's monthly price per currency; keep in step with the backend's cloud-plans catalogue. */
export const growthMonthly: Record<string, number> = {
  UGX: 55000, KES: 1900, TZS: 38000, RWF: 20000, NGN: 22000, GHS: 180, ZAR: 270,
  XAF: 9000, XOF: 9000, ZMW: 380, MWK: 26000, EGP: 720, USD: 15, EUR: 14, GBP: 12,
};

const money = (currency: string) => `${currency} ${growthMonthly[currency].toLocaleString("en")}`;

const howRenewalsWork: TopicSection = {
  heading: "How renewals work with mobile money",
  body: [
    "Mobile money has no card-style automatic debit: the customer approves every payment on their phone. So when a period ends, " +
      `${site.name} creates the renewal invoice and sends the customer a payment link by email, or you send it by WhatsApp or SMS. ` +
      "They pay with a PIN prompt, and the invoice is marked paid the moment the provider confirms it.",
    "Customers who pay by card can be charged automatically each period instead, from the card saved at their first payment. " +
      "Unpaid invoices are retried and reminded on a schedule you set, and you decide when access stops.",
  ],
};

const countries: TopicPage[] = [
  {
    path: "billing-software/uganda",
    nav: "Uganda",
    title: "Billing Software for Uganda with MTN MoMo & Airtel Money",
    description: `Subscription billing and invoicing for Ugandan businesses: MTN MoMo and Airtel Money collections, UGX pricing, payouts and receipts. Free to start; Growth is ${money("UGX")} a month.`,
    section: { name: "Billing software by country" },
    h1: "Billing software for Uganda, built around mobile money",
    lede:
      "Bill customers in shillings, take MTN MoMo and Airtel Money, and get paid out to your phone or bank. Subscriptions, one-time invoices, instalments and receipts, in one place.",
    sections: [
      {
        heading: "Every way Ugandans pay",
        bullets: [
          "MTN MoMo and Airtel Money, directly through the operators' APIs or through Yo! Payments",
          "Cards, mobile money and bank through Flutterwave, Pesapal, DPO or Eversend",
          "No provider account yet? Managed payments collects for you and pays out to your mobile money or bank",
          "Payouts to MTN, Airtel and bank accounts, with approval steps for your team",
        ],
      },
      {
        heading: "Priced in UGX, without decimals",
        body: [
          "Plans, invoices and receipts show whole shillings, the way your customers expect. Sell in USD as well when you need to, with daily exchange rates for reporting.",
        ],
      },
      howRenewalsWork,
      {
        heading: "Built for the businesses that bill every month",
        bullets: [
          "Internet and Wi-Fi providers billing monthly packages",
          "Schools and training centres taking fees in instalments",
          "SaaS and media subscriptions, gyms and memberships",
        ],
      },
    ],
    faq: [
      {
        question: "Can customers pay with MTN MoMo and Airtel Money?",
        answer:
          "Yes. Connect MTN MoMo and Airtel Money directly, or use Yo! Payments, Flutterwave, Pesapal, DPO or Eversend. The customer gets a PIN prompt on their phone and the invoice is marked paid as soon as the payment is confirmed.",
      },
      {
        question: "How much does it cost in Uganda?",
        answer: `The cloud is free up to 1,000 customers and 2,500 invoices a month. Growth has no limits and costs ${money("UGX")} a month, payable by mobile money. Self-hosting is free.`,
      },
      {
        question: "Can I get paid without a payment gateway account?",
        answer:
          "Yes. Apply for managed payments in the dashboard: once approved, it takes card and mobile money payments for you and pays them out to your MTN, Airtel or bank account.",
      },
    ],
    related: ["billing-software/kenya", "mobile-money-billing", "use-cases/isp-billing", "use-cases/school-fees"],
  },
  {
    path: "billing-software/kenya",
    nav: "Kenya",
    title: "Subscription Billing Software for Kenya with M-Pesa",
    description: `Recurring billing and invoicing for Kenyan businesses: M-Pesa and Airtel Money through Flutterwave, Paystack, Pesapal or DPO, cards, KES pricing. Growth is ${money("KES")} a month.`,
    section: { name: "Billing software by country" },
    h1: "Subscription billing for Kenya, with M-Pesa built in",
    lede:
      "Run plans, invoices and renewals in shillings, and let customers pay by M-Pesa, Airtel Money or card through the gateway you already use.",
    sections: [
      {
        heading: "M-Pesa through the gateways you know",
        bullets: [
          "M-Pesa and Airtel Money on Flutterwave, Paystack, Pesapal or DPO checkout",
          "Cards charged automatically each period once saved",
          "Managed payments if you'd rather not open a gateway account",
          "Payouts to mobile money and bank accounts",
        ],
      },
      howRenewalsWork,
      {
        heading: "Everything a recurring business needs",
        bullets: [
          "Monthly, quarterly and yearly plans, trials and plan changes",
          "Usage-based pricing for metered products",
          "Coupons, add-ons, taxes and credit notes",
          "A customer portal for invoices, receipts and payments",
        ],
      },
    ],
    faq: [
      {
        question: "Does it support M-Pesa?",
        answer:
          "Yes, through Flutterwave, Paystack, Pesapal or DPO: connect the gateway you use and M-Pesa appears on the checkout. Invoices are marked paid automatically when M-Pesa confirms the payment.",
      },
      {
        question: "Can it charge M-Pesa automatically every month?",
        answer:
          "Not silently: M-Pesa needs the customer to approve each payment. Each renewal invoice goes out with a payment link and reminders. Card payments can be charged automatically.",
      },
      {
        question: "What does it cost in Kenya?",
        answer: `Free up to 1,000 customers. Growth, with no limits, is ${money("KES")} a month. You can also self-host it for free.`,
      },
    ],
    related: ["billing-software/uganda", "billing-software/tanzania", "mobile-money-billing", "use-cases/saas-billing"],
  },
  {
    path: "billing-software/nigeria",
    nav: "Nigeria",
    title: "Recurring Billing Software for Nigeria (Paystack & Flutterwave)",
    description: `Subscriptions and invoicing in naira: cards, bank transfers and USSD through Paystack or Flutterwave, automatic card renewals and dunning. Growth is ${money("NGN")} a month.`,
    section: { name: "Billing software by country" },
    h1: "Recurring billing for Nigerian businesses",
    lede:
      "Price in naira, bill monthly or by usage, and collect by card, bank transfer or USSD through Paystack or Flutterwave, with renewals and retries handled for you.",
    sections: [
      {
        heading: "Collect the way Nigerians pay",
        bullets: [
          "Cards, bank transfers and USSD through Paystack or Flutterwave",
          "Saved cards charged automatically at each renewal",
          "Failed payments retried and reminded on your schedule",
          "Payouts and transfers recorded in a double-entry ledger",
        ],
      },
      {
        heading: "Subscriptions and usage in one system",
        body: [
          "Combine a monthly fee with metered usage, add one-time charges, and let customers upgrade or downgrade with the change taking effect now or at the end of the period.",
        ],
      },
    ],
    faq: [
      {
        question: "Does it work with Paystack and Flutterwave?",
        answer: "Yes. Connect either or both; checkouts use your highest-priority provider and fall back to the next if one can't take the payment.",
      },
      {
        question: "What does it cost in Nigeria?",
        answer: `Free up to 1,000 customers. Growth is ${money("NGN")} a month with no limits. Self-hosting is free.`,
      },
    ],
    related: ["billing-software/ghana", "alternatives/chargebee", "use-cases/saas-billing", "pricing"],
  },
  {
    path: "billing-software/ghana",
    nav: "Ghana",
    title: "Billing Software for Ghana with Mobile Money",
    description: `Subscription billing and invoicing in cedis: MTN MoMo and other mobile money through Paystack or Flutterwave, cards and payouts. Growth is ${money("GHS")} a month.`,
    section: { name: "Billing software by country" },
    h1: "Billing software for Ghana, with mobile money",
    lede: "Bill in cedis and collect mobile money and cards through Paystack or Flutterwave, with renewals, reminders and receipts handled for you.",
    sections: [
      {
        heading: "Payments",
        bullets: [
          "MTN MoMo and other mobile money wallets through Paystack or Flutterwave checkout",
          "Cards, charged automatically at renewal once saved",
          "Payouts to mobile money and bank accounts",
        ],
      },
      howRenewalsWork,
    ],
    faq: [
      {
        question: "Can customers in Ghana pay with mobile money?",
        answer: "Yes, through Paystack or Flutterwave checkout. Each payment is confirmed on the customer's phone, and the invoice is marked paid automatically.",
      },
      {
        question: "What does it cost in Ghana?",
        answer: `Free up to 1,000 customers; Growth is ${money("GHS")} a month. Self-hosting is free.`,
      },
    ],
    related: ["billing-software/nigeria", "mobile-money-billing", "pricing"],
  },
  {
    path: "billing-software/tanzania",
    nav: "Tanzania",
    title: "Billing Software for Tanzania with Mobile Money",
    description: `Recurring billing and invoices in Tanzanian shillings: M-Pesa, Airtel Money and other wallets through Flutterwave, Pesapal or DPO. Growth is ${money("TZS")} a month.`,
    section: { name: "Billing software by country" },
    h1: "Billing software for Tanzania",
    lede: "Run subscriptions and invoices in shillings and collect mobile money and cards through Flutterwave, Pesapal or DPO.",
    sections: [
      {
        heading: "Payments",
        bullets: [
          "M-Pesa, Airtel Money and other wallets through Flutterwave, Pesapal or DPO checkout",
          "Cards, charged automatically at renewal once saved",
          "Managed payments if you don't have a gateway account",
        ],
      },
      howRenewalsWork,
    ],
    faq: [
      {
        question: "Which mobile money services work in Tanzania?",
        answer: "Those your gateway offers on its checkout: Flutterwave, Pesapal and DPO all take mobile money in Tanzania. Payments are confirmed automatically.",
      },
      {
        question: "What does it cost in Tanzania?",
        answer: `Free up to 1,000 customers; Growth is ${money("TZS")} a month. Self-hosting is free.`,
      },
    ],
    related: ["billing-software/kenya", "billing-software/uganda", "mobile-money-billing"],
  },
  {
    path: "billing-software/rwanda",
    nav: "Rwanda",
    title: "Billing Software for Rwanda with MTN MoMo & Airtel Money",
    description: `Subscriptions and invoicing in Rwandan francs: MTN MoMo and Airtel Money, cards and payouts. Free to start; Growth is ${money("RWF")} a month.`,
    section: { name: "Billing software by country" },
    h1: "Billing software for Rwanda",
    lede: "Bill in francs and collect MTN MoMo, Airtel Money and cards, with renewals, receipts and payouts in one place.",
    sections: [
      {
        heading: "Payments",
        bullets: [
          "MTN MoMo and Airtel Money, through the operators' APIs where they're offered to your business, or through Flutterwave",
          "Cards, charged automatically at renewal once saved",
          "Payouts to mobile money and bank accounts",
        ],
      },
      howRenewalsWork,
    ],
    faq: [
      {
        question: "Does it support MTN MoMo in Rwanda?",
        answer: "Yes: connect MTN MoMo directly if MTN has given your business API access, or collect it through Flutterwave.",
      },
      {
        question: "What does it cost in Rwanda?",
        answer: `Free up to 1,000 customers; Growth is ${money("RWF")} a month. Self-hosting is free.`,
      },
    ],
    related: ["billing-software/uganda", "mobile-money-billing", "pricing"],
  },
];

const useCases: TopicPage[] = [
  {
    path: "use-cases/isp-billing",
    nav: "ISP & Wi-Fi billing",
    title: "ISP & Wi-Fi Billing Software with Mobile Money",
    description:
      "Billing for internet service providers and Wi-Fi businesses in Africa: monthly packages, mobile money and card payments, reminders, suspensions and an API for your network tools.",
    section: { name: "Use cases" },
    h1: "Billing for internet and Wi-Fi providers",
    lede:
      "Bill every subscriber's package each month, collect by mobile money or card, and tell your network when someone has paid or fallen behind.",
    sections: [
      {
        heading: "Packages, renewals and reminders",
        bullets: [
          "A plan per package (for example 10, 20 or 50 Mbps), priced in your currency",
          "Renewal invoices and payment links sent automatically every month",
          "Reminders and retries for unpaid invoices, and a webhook when it's time to suspend",
          "One-time charges for installation and equipment",
        ],
      },
      {
        heading: "Connect it to your network",
        body: [
          "Webhooks tell your systems the moment an invoice is paid or a subscription changes, so your RADIUS, MikroTik or hotspot tooling can turn access on or off. The REST API and TypeScript, Python and PHP SDKs cover everything the dashboard does.",
        ],
      },
      howRenewalsWork,
    ],
    faq: [
      {
        question: "Can it switch off subscribers who don't pay?",
        answer:
          `${site.name} decides who is paid up and tells your systems by webhook (invoice.paid, subscription.canceled and more). Your network tooling acts on those events to grant or remove access.`,
      },
      {
        question: "Can subscribers pay with mobile money?",
        answer: "Yes: MTN MoMo and Airtel Money directly, or mobile money through Flutterwave, Paystack, Pesapal, DPO and others, plus cards.",
      },
    ],
    related: ["billing-software/uganda", "billing-software/kenya", "mobile-money-billing"],
  },
  {
    path: "use-cases/school-fees",
    nav: "School & course fees",
    title: "School & Training Fee Billing with Instalments",
    description:
      "Invoice course and school fees, sell one-time bundles, and let students pay in instalments by mobile money or card, with receipts and reminders.",
    section: { name: "Use cases" },
    h1: "Fee billing for schools and training centres",
    lede:
      "Sell courses and certification bundles, take a deposit and the rest in instalments, and give every student receipts and a portal to pay from.",
    sections: [
      {
        heading: "Pay in parts",
        body: [
          "Any invoice can be paid in several payments. Each instalment counts toward the total, the invoice stays open until it's covered, and your systems are told after every payment, so you can open a module per instalment or wait for the full fee.",
        ],
      },
      {
        heading: "Courses and bundles that are paid once",
        bullets: [
          "Put each course or bundle in a catalogue, priced in every currency you sell in",
          "Sell it on an invoice with a payment link: nothing renews",
          "Monthly or termly plans for tuition that does recur",
        ],
      },
      {
        heading: "Students pay how they can",
        bullets: ["Mobile money and cards online", "Cash and bank transfers recorded by your finance team", "Receipts by email, and a portal with every invoice"],
      },
    ],
    faq: [
      {
        question: "Can students pay fees in instalments?",
        answer:
          "Yes. Take a deposit at checkout and send links for the rest, or record cash and bank payments as they come in. The invoice is marked paid once the payments cover it.",
      },
      {
        question: "Can I sell a three-month programme that is paid once?",
        answer: "Yes. Add it to your catalogue as a one-time product and sell it on an invoice; it never renews, and your system decides how long access lasts.",
      },
    ],
    related: ["billing-software/uganda", "billing-software/kenya", "pricing"],
  },
  {
    path: "use-cases/saas-billing",
    nav: "SaaS billing",
    title: "SaaS Subscription & Usage Billing API for Africa",
    description:
      "Subscription and usage-based billing API for SaaS: plans, trials, metering, proration, dunning and webhooks, with mobile money, cards and multi-currency pricing.",
    section: { name: "Use cases" },
    h1: "Subscription and usage billing for SaaS",
    lede:
      "Plans, trials, metering and invoices behind one API, with checkouts that take mobile money and cards in your customers' currencies.",
    sections: [
      {
        heading: "Pricing models",
        bullets: [
          "Flat, graduated, volume, package and percentage pricing",
          "Usage events metered and billed at the period end",
          "Trials, upgrades and downgrades now or at period end",
          "Coupons, add-ons, taxes, credit notes and prepaid wallets",
        ],
      },
      {
        heading: "Developer first",
        body: [
          "A REST API with an OpenAPI spec, SDKs for TypeScript, Python and PHP, signed webhooks, idempotency keys and a sandbox with its own test keys. Everything the dashboard does, your code can do.",
        ],
      },
    ],
    faq: [
      {
        question: "Is there a sandbox?",
        answer: "Yes: a separate test environment with sk_test_ keys, test payment providers and its own data. Switch to it from the dashboard.",
      },
      {
        question: "Can I self-host it?",
        answer: "Yes. It's open source under AGPL-3.0 and runs with one docker compose command.",
      },
    ],
    related: ["alternatives/lago", "alternatives/stripe-billing", "alternatives/chargebee", "pricing"],
  },
];

const alternatives: TopicPage[] = [
  {
    path: "alternatives/chargebee",
    nav: "Chargebee alternative",
    title: "Open-Source Chargebee Alternative with Mobile Money",
    description:
      "Looking for a Chargebee alternative? PimaBill is open-source subscription and usage billing with mobile money, payouts and a double-entry ledger. Free to start.",
    section: { name: "Alternatives" },
    h1: "An open-source alternative to Chargebee",
    lede:
      "Chargebee is a mature subscription platform built around card gateways. If your customers pay by mobile money, or you want to own your billing code, PimaBill covers the same ground in open source.",
    sections: [
      {
        heading: "Where PimaBill differs",
        bullets: [
          "Open source (AGPL-3.0): self-host it or use our cloud",
          "Mobile money first: MTN MoMo and Airtel Money directly, M-Pesa and others through African gateways",
          "Payouts, wallet transfers and a double-entry ledger in the same product",
          "Priced for African businesses, payable in local currency",
        ],
      },
      {
        heading: "What you keep",
        body: ["Plans, trials, usage-based pricing, coupons, add-ons, taxes, dunning, a customer portal, webhooks and a full API."],
      },
    ],
    faq: [
      {
        question: "Can I move from Chargebee?",
        answer: "Yes. Customers, plans and invoices can be created through the API, including historical invoices with their original numbers and dates.",
      },
    ],
    related: ["alternatives/lago", "alternatives/stripe-billing", "use-cases/saas-billing"],
  },
  {
    path: "alternatives/lago",
    nav: "Lago alternative",
    title: "Lago Alternative with Mobile Money & Payouts",
    description:
      "Comparing open-source billing? PimaBill adds mobile money, payouts and a double-entry ledger to subscription and usage billing, with a cloud priced for Africa.",
    section: { name: "Alternatives" },
    h1: "A Lago alternative with mobile money and payouts",
    lede:
      "Lago and PimaBill are both open-source billing engines under AGPL-3.0. PimaBill adds the money movement African businesses need: mobile money collections, payouts and a ledger.",
    sections: [
      {
        heading: "What PimaBill adds",
        bullets: [
          "MTN MoMo, Airtel Money and African gateways (Flutterwave, Paystack, Pesapal, DPO, Yo!)",
          "Payouts to mobile money and bank accounts, with approvals",
          "Crypto collections to your own wallet",
          "Managed payments on the cloud if you have no gateway account",
        ],
      },
    ],
    faq: [
      {
        question: "Is PimaBill open source like Lago?",
        answer: "Yes, under AGPL-3.0, with MIT-licensed SDKs. Self-host it with Docker or use the cloud.",
      },
    ],
    related: ["alternatives/chargebee", "alternatives/kill-bill", "use-cases/saas-billing"],
  },
  {
    path: "alternatives/stripe-billing",
    nav: "Stripe Billing alternative",
    title: "Stripe Billing Alternative for Africa (Mobile Money)",
    description:
      "Need Stripe Billing features with mobile money? PimaBill does subscription billing with MTN MoMo, Airtel Money, M-Pesa through African gateways, and cards.",
    section: { name: "Alternatives" },
    h1: "A Stripe Billing alternative for Africa",
    lede:
      "Stripe Billing works with Stripe's own payment methods. Across much of Africa, customers pay by mobile money through local providers, so billing needs to work with those too.",
    sections: [
      {
        heading: "Keep Stripe, add the rest",
        body: [
          "PimaBill connects to Stripe too, alongside Flutterwave, Paystack, Pesapal, DPO, MTN MoMo, Airtel Money and others. Each checkout tries your providers in the order you choose.",
        ],
      },
      {
        heading: "Pricing",
        body: ["Free up to 1,000 customers, then a flat monthly fee in your own currency; billing isn't charged as a share of your revenue. Self-hosting is free."],
      },
    ],
    faq: [
      {
        question: "Can I use PimaBill with Stripe?",
        answer: "Yes. Connect Stripe as one of your providers; cards saved through Stripe are charged automatically at renewal.",
      },
    ],
    related: ["alternatives/chargebee", "mobile-money-billing", "pricing"],
  },
  {
    path: "alternatives/kill-bill",
    nav: "Kill Bill alternative",
    title: "Kill Bill Alternative: Modern Open-Source Billing",
    description:
      "An open-source Kill Bill alternative with a hosted cloud, a modern dashboard, SDKs and mobile money. Self-host with Docker or start free.",
    section: { name: "Alternatives" },
    h1: "A modern alternative to Kill Bill",
    lede:
      "Kill Bill is a long-standing open-source billing platform for teams that run and extend it themselves. PimaBill is open source too, with a hosted cloud, a dashboard for your finance team and mobile money built in.",
    sections: [
      {
        heading: "What you get",
        bullets: [
          "One docker compose command to self-host, or a hosted cloud",
          "A dashboard for finance and support teams, with roles",
          "TypeScript, Python and PHP SDKs and an OpenAPI spec",
          "Mobile money, payouts and a ledger",
        ],
      },
    ],
    faq: [
      {
        question: "Do I have to run it myself?",
        answer: "No. Use the cloud, free up to 1,000 customers, or self-host it when you want to.",
      },
    ],
    related: ["alternatives/lago", "alternatives/chargebee", "use-cases/saas-billing"],
  },
];

const pillars: TopicPage[] = [
  {
    path: "mobile-money-billing",
    nav: "Mobile money billing",
    title: "Mobile Money Billing & Recurring Payments Software",
    description:
      "Recurring billing and invoicing for mobile money: MTN MoMo, Airtel Money, M-Pesa via gateways. Renewal links, reminders, instalments and payouts, open source.",
    section: { name: "Product" },
    h1: "Billing built for mobile money",
    lede:
      "Most billing software assumes a card on file. Your customers pay by phone. PimaBill invoices, reminds and reconciles mobile money payments, and pays you out the same way.",
    sections: [
      howRenewalsWork,
      {
        heading: "Every provider, one integration",
        bullets: [
          "MTN MoMo and Airtel Money directly",
          "Yo! Payments, Flutterwave, Paystack, Pesapal, DPO and Eversend",
          "Cards through Stripe, Flutterwave, Paystack and PayPal",
          "Crypto to your own wallet",
        ],
      },
      {
        heading: "Reconciled for you",
        body: [
          "Every payment is matched to its invoice by reference, confirmed with the provider before it counts, and recorded in a double-entry ledger. Amounts that don't match are held for review instead of being marked paid.",
        ],
      },
      {
        heading: "Payouts too",
        body: ["Pay suppliers, staff and partners to mobile money and bank accounts, with daily limits and approvals."],
      },
    ],
    faq: [
      {
        question: "Can mobile money be charged automatically every month?",
        answer:
          "Not without the customer: mobile money needs them to approve each payment on their phone. Renewal invoices go out with a payment link and reminders; cards can be charged automatically.",
      },
      {
        question: "Which countries are supported?",
        answer: "Anywhere your providers operate, including Uganda, Kenya, Tanzania, Rwanda, Nigeria, Ghana and South Africa, in any ISO 4217 currency.",
      },
    ],
    related: ["billing-software/uganda", "billing-software/kenya", "use-cases/isp-billing", "use-cases/school-fees"],
  },
  {
    path: "pricing",
    nav: "Pricing",
    title: "Pricing: Free to Start, Growth in Your Currency",
    description: `PimaBill cloud is free up to 1,000 customers. Growth has no limits for ${money("USD")}, ${money("UGX")}, ${money("KES")} or ${money("NGN")} a month. Self-hosting is free.`,
    section: { name: "Pricing" },
    h1: "Pricing",
    lede: "Start free. Pay a flat monthly fee in your own currency when you grow. Or run it yourself, free.",
    sections: [
      {
        heading: "Free",
        bullets: ["1,000 customers and 1,000 active subscriptions", "2,500 invoices a month", "5 team members", "Every feature, including managed payments"],
      },
      {
        heading: "Growth",
        body: [
          `No limits, priority support. ${Object.keys(growthMonthly).map(money).join(" · ")} a month; a year costs ten months.`,
        ],
      },
      { heading: "Enterprise", body: ["Priced per customer with you, with a negotiated managed payments fee, an SLA and a named account manager."] },
      { heading: "Self-hosted", body: ["Free and open source under AGPL-3.0: run it on your own servers with Docker."] },
    ],
    faq: [
      {
        question: "Can I pay in my own currency?",
        answer: `Yes. Growth is priced in ${Object.keys(growthMonthly).length} currencies and can be paid by card or mobile money.`,
      },
      {
        question: "Are there transaction fees?",
        answer:
          "Not on payments through your own providers. Managed payments, if you use it, has a small fee per payment, shown before you start.",
      },
    ],
    related: ["billing-software/uganda", "billing-software/kenya", "billing-software/nigeria", "alternatives/chargebee"],
  },
];

export const topicPages: TopicPage[] = [...pillars, ...countries, ...useCases, ...alternatives];

export const topicPage = (path: string) => topicPages.find((p) => p.path === path);

/** The groups shown in the footer, in order. */
export const topicGroups = [
  { title: "Solutions", pages: [...pillars.slice(0, 1), ...useCases] },
  { title: "Countries", pages: countries },
  { title: "Compare", pages: alternatives },
];
