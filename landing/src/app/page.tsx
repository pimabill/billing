import { ArrowRight, Check, Minus } from "lucide-react";
import Image from "next/image";

import Header from "@/components/header";
import Footer from "@/components/footer";
import {
  CheckoutCard,
  JournalCard,
  LedgerCard,
  PaidToast,
  PayoutFlow,
  PhonePrompt,
  TallyArt,
  TeamCard,
  TerminalCard,
  WebhookCard,
} from "@/components/home-art";
import { rails, site } from "@/lib/site";
import { faq } from "./faq";

const register = `${site.dashboardUrl}/register`;

export default function Home() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header />
      {/* The FAQ shown on this page, as structured data. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((q) => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <main id="main">
        <Hero />
        <Rails />
        <Pillars />
        <Steps />
        <Showcase />
        <Money />
        <Developers />
        <Proof />
        <Compare />
        <Pricing />
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-teal">{children}</p>;
}

function SectionHeading({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h2>
      {lede && <p className="mt-5 text-lg text-ink-2 sm:text-xl">{lede}</p>}
    </div>
  );
}

const primaryButton =
  "inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-white transition hover:bg-teal";
const secondaryButton =
  "inline-flex h-12 items-center rounded-full border border-line bg-white/80 px-6 font-semibold backdrop-blur transition hover:border-ink";

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-white">
      <TallyArt className="absolute -right-24 top-0 hidden h-full w-[54%] lg:block" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-16 sm:px-6 md:pt-24 lg:min-h-[760px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:pb-28">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-ink-2">
            <span className="h-2 w-2 rounded-full bg-[#14b8a6]" aria-hidden />
            Open source · {site.license} · Self-host or cloud
          </p>
          <h1 id="hero-title" className="mt-6 font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[5.25rem]">
            Open-source billing for the way Africa pays
          </h1>
          <p className="mt-7 max-w-lg text-lg text-ink-2 sm:text-xl">
            Subscriptions, usage and one-time payments over mobile money, cards, banks and crypto. Every shilling, cent
            and satoshi posts to a double-entry ledger your finance team can reconcile.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href={register} className={primaryButton}>
              Start free <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a href={site.githubUrl} className={secondaryButton}>
              Self-host from GitHub
            </a>
          </div>
          <p className="mt-5 text-sm text-ink-2">
            Or read the{" "}
            <a href={site.docsUrl} className="font-medium text-teal underline-offset-4 hover:underline">
              quickstart
            </a>
            : running locally in about five minutes.
          </p>
        </div>

        {/* The product in motion: the prompt a customer approves, and what the ledger records. */}
        <div className="relative hidden h-[560px] lg:block">
          <PhonePrompt className="absolute left-[22%] top-2 z-10" />
          <LedgerCard className="absolute bottom-10 right-0 z-20" />
          <PaidToast className="absolute bottom-48 left-[6%] z-30" />
        </div>
        <div className="relative overflow-hidden rounded-3xl lg:hidden">
          <TallyArt id="tally-small" className="absolute inset-0 h-full w-full" />
          <div className="relative flex flex-col items-center gap-4 px-4 py-8">
            <PhonePrompt />
            <PaidToast />
          </div>
        </div>
      </div>
    </section>
  );
}

/* Facts, not claims. */
function Proof() {
  const facts = [
    [String(rails.mobileMoney.length + rails.cardsAndBanks.length + rails.crypto.length), "payment rails: mobile money, cards, banks and crypto"],
    ["160+", "currencies, with daily exchange rates"],
    ["AGPL-3.0", "open source, self-host or cloud"],
    ["1 ledger", "every movement double-entry, checked every run"],
  ];
  return (
    <section aria-label="At a glance" className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
          {facts.map(([value, label]) => (
            <div key={value} className="border-l-2 border-teal pl-5">
              <dt className="sr-only">{label}</dt>
              <dd>
                <span className="block font-display text-4xl font-semibold tracking-tight sm:text-5xl">{value}</span>
                <span className="mt-2 block text-ink-2">{label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Logos in /public/providers, by the names the rails list uses. */
const railLogos: Record<string, string> = {
  "MTN MoMo": "mtn_momo.svg",
  "Airtel Money": "airtel_money.svg",
  "Yo! Payments": "yo.png",
  Eversend: "eversend.png",
  Flutterwave: "flutterwave.png",
  Paystack: "paystack.png",
  Stripe: "stripe.svg",
  PayPal: "paypal.svg",
  PayU: "payu.png",
  DPO: "dpo.png",
  "USDT on TRON": "tron_usdt.png",
  "USDT on Ethereum": "eth_usdt.svg",
  "USDT on BNB Chain": "bsc_usdt.svg",
  Bitcoin: "btc.svg",
  "Binance Pay": "binance_pay.svg",
};

/* Rails: every way the software can collect or pay out. */
function Rails() {
  const all = [...rails.mobileMoney, ...rails.cardsAndBanks, ...rails.crypto];
  return (
    <section aria-labelledby="rails-title" className="border-y border-line bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h2 id="rails-title" className="text-center text-sm font-medium text-ink-2">
          Built for how your customers pay
        </h2>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
          {all.map((r) => (
            <li key={r} className="flex items-center gap-2 text-sm font-medium">
              {railLogos[r] ? (
                <span className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg p-0.5 ${r === "MTN MoMo" ? "bg-[#ffcb05]" : "bg-white"}`} aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/providers/${railLogos[r]}`} alt="" className="max-h-full max-w-full object-contain" />
                </span>
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mist text-[10px] font-bold text-ink-2" aria-hidden>
                  {r.slice(0, 2)}
                </span>
              )}
              {r}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* Measure it. Bill it. Settle it. */
function Steps() {
  const steps = [
    {
      title: "Measure it",
      body: "Send usage events from your app. Count, sum, take the maximum or count unique values per billing period, with per-customer plan overrides.",
    },
    {
      title: "Bill it",
      body: "Plans priced in any currency with trials, coupons, add-ons and proration. Invoices go out on schedule, failed payments are retried, and customers can pay from a hosted checkout link.",
    },
    {
      title: "Settle it",
      body: "Collections, payouts and wallet transfers run on the same rails and post to a balanced double-entry ledger, checked for integrity every run.",
    },
  ];
  return (
    <section id="product" aria-labelledby="steps-title" className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="max-w-3xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="steps-title" className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-6xl">
            Measure it. Bill it. Settle it.
          </h2>
          <p className="mt-5 text-lg text-ink-2 sm:text-xl">
            &ldquo;Pima&rdquo; is Swahili for <em>measure</em>: what usage billing and a ledger do before anyone is charged.
          </p>
        </div>
        <ol className="mt-16 grid gap-10 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="border-t border-ink pt-6">
              <span className="text-sm font-semibold text-teal">0{i + 1}</span>
              <h3 className="mt-3 font-display text-2xl font-semibold">{s.title}</h3>
              <p className="mt-3 text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* The real dashboard, on a wash of the brand's colours. */
function Showcase() {
  return (
    <section aria-label="The dashboard" className="bg-wash overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <figure className="overflow-hidden rounded-t-2xl border border-b-0 border-white/60 bg-white shadow-card">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-line" />
            <span className="h-3 w-3 rounded-full bg-line" />
            <span className="h-3 w-3 rounded-full bg-line" />
            <span className="ml-3 truncate rounded-full bg-mist px-3 py-1 text-xs text-ink-2">{site.dashboardUrl.replace(/^https?:\/\//, "")}/dashboard</span>
          </div>
          <Image
            src="/product-overview.webp"
            alt="The dashboard's overview: monthly recurring revenue, active subscriptions, customers, payment success rate, revenue by month and recent activity."
            width={1920}
            height={1200}
            sizes="(min-width: 1280px) 1280px, 100vw"
            className="h-auto w-full"
            unoptimized
          />
        </figure>
      </div>
    </section>
  );
}

function BentoCard({
  title,
  body,
  children,
  className = "",
  stage = "bg-mist",
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  className?: string;
  stage?: string;
}) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-3xl border border-line bg-white ${className}`}>
      <div className="p-7">
        <h3 className="font-display text-2xl font-semibold">{title}</h3>
        <p className="mt-2 text-ink-2">{body}</p>
      </div>
      <div className={`mt-auto flex-1 p-6 ${stage}`}>{children}</div>
    </div>
  );
}

function Pillars() {
  return (
    <section aria-labelledby="pillars-title" className="bg-mist">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <h2 id="pillars-title" className="max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Billing and money infrastructure in one open-source product
        </h2>
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          <BentoCard
            className="lg:col-span-2"
            stage="bg-wash"
            title="Built for how customers pay"
            body="Renewals designed around mobile money prompts, retries and reminders, beside cards, bank transfers, PayPal and crypto."
          >
            <div className="flex flex-wrap items-center justify-center gap-6">
              <CheckoutCard />
              <PhonePrompt className="hidden sm:block" />
            </div>
          </BentoCard>
          <BentoCard
            title="One ledger for every movement"
            body="Subscriptions, usage, collections, payouts, transfers and platform fees post to a double-entry ledger finance can reconcile."
          >
            <JournalCard />
          </BentoCard>
          <BentoCard
            title="Yours to run"
            body={`${site.license}, self-hosted on PostgreSQL, with no processor lock-in. Switch providers without rewriting your billing.`}
          >
            <TerminalCard />
          </BentoCard>
          <BentoCard
            title="Developer-first"
            body="An OpenAPI spec, TypeScript, Python and PHP SDKs, signed webhooks and idempotent money endpoints."
          >
            <WebhookCard />
          </BentoCard>
          <BentoCard
            title="Teams and organisations"
            body="Owner, admin, finance, developer and viewer roles, invitations, and several organisations from one login."
          >
            <TeamCard />
          </BentoCard>
          <BentoCard
            className="lg:col-span-3"
            stage="bg-wash"
            title="Your providers, your money"
            body="Customers pay through the provider accounts you connect, so the money goes straight to you, and every movement is recorded in your ledger."
          >
            <PayoutFlow />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function Money() {
  const items = [
    ["One-time collections", "A mobile money PIN prompt or a hosted checkout, not tied to an invoice. Retries with the same reference never charge twice."],
    ["Payouts with controls", "Approval above a threshold, daily limits per currency, and payouts the provider cannot confirm are re-checked, never resent."],
    ["Wallets and transfers", "Prepaid credit per customer and transfers between wallets, each one a balanced ledger entry."],
    ["Crypto to your own wallet", "USDT on TRON, Ethereum and BNB Chain, and Bitcoin, watched on the chain. No keys and no custody."],
    ["Platform commission", "Rates, flat fees and minimums per currency, charged to you or added to what the payer is asked for."],
    ["Ledger health", "Zero-sum, balanced entries, cached balances and wallet parity, checked on every sync."],
  ];
  return (
    <section aria-labelledby="money-title" className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading
          eyebrow="Money movement"
          title="Collect, pay out and reconcile in one place"
          lede="Every rail moves money between your payers and accounts you own."
        />
        <dl className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([title, body]) => (
            <div key={title} className="border-t border-line pt-5">
              <dt className="text-lg font-semibold">{title}</dt>
              <dd className="mt-2 text-ink-2">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Developers() {
  const facts = [
    "OpenAPI 3 spec, committed and checked on every change",
    "TypeScript, Python and PHP SDKs under the MIT licence",
    "Webhooks signed with HMAC-SHA256, every attempt logged",
    "Idempotency keys on collections, payouts and transfers",
    "A sandbox with sk_test_ keys and provider test accounts, one switch away in the dashboard",
    "A separate database per organisation",
  ];
  return (
    <section id="developers" aria-labelledby="dev-title" className="bg-night text-night-ink [&_h2]:text-white [&_li]:text-night-ink [&_p]:text-night-ink-2 [&_.text-teal]:text-[#5eead4]">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <Eyebrow>Developers</Eyebrow>
          <h2 id="dev-title" className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            A few lines to bill, collect and pay out
          </h2>
          <ul className="mt-8 grid gap-3">
            {facts.map((f) => (
              <li key={f} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-teal" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            <a href={site.docsUrl} className="text-teal underline-offset-4 hover:underline">
              Documentation
            </a>
            <a href={site.apiRefUrl} className="text-teal underline-offset-4 hover:underline">
              API reference
            </a>
          </div>
        </div>
        <pre
          aria-label="TypeScript example"
          className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-6 font-mono text-[13px] leading-6 text-[#d7e3e0]"
        >
          <code>
            <span className="text-[#7fd6cf]">import</span> {"{ PimaBillClient }"} <span className="text-[#7fd6cf]">from</span>{" "}
            <span className="text-[#e9b98f]">&apos;pimabill&apos;</span>;{"\n\n"}
            <span className="text-[#7fd6cf]">const</span> pima = <span className="text-[#7fd6cf]">new</span> PimaBillClient({"{"}
            {"\n"}  token: process.env.PIMABILL_API_KEY!,{"\n"}
            {"});"}
            {"\n\n"}
            <span className="text-[#8a9894]">{"// A monthly plan, billed in shillings"}</span>
            {"\n"}
            <span className="text-[#7fd6cf]">await</span> pima.subscriptions.create({"{"}
            {"\n"}  customerId: <span className="text-[#e9b98f]">&apos;cus_123&apos;</span>,{"\n"}  planId:{" "}
            <span className="text-[#e9b98f]">&apos;plan_growth&apos;</span>,{"\n"}  currency:{" "}
            <span className="text-[#e9b98f]">&apos;UGX&apos;</span>,{"\n"}
            {"});"}
            {"\n\n"}
            <span className="text-[#8a9894]">{"// Pay a supplier on MTN MoMo"}</span>
            {"\n"}
            <span className="text-[#7fd6cf]">await</span> pima.payouts.create({"{"}
            {"\n"}  amount: <span className="text-[#e9b98f]">&apos;120000&apos;</span>,{"\n"}  currency:{" "}
            <span className="text-[#e9b98f]">&apos;UGX&apos;</span>,{"\n"}  payee: {"{"} type:{" "}
            <span className="text-[#e9b98f]">&apos;mobile_money&apos;</span>, msisdn:{" "}
            <span className="text-[#e9b98f]">&apos;256771234567&apos;</span> {"}"},{"\n"}
            {"});"}
          </code>
        </pre>
      </div>
    </section>
  );
}

const tiers = [
  {
    name: "Cloud Free",
    price: "Free",
    period: "",
    description: "We host it. Start billing today, free while you stay within the limits.",
    features: [
      "500 customers and 500 active subscriptions",
      "2,500 invoices a month, 5 team members",
      "Every feature: usage billing, wallets, the ledger",
      "Sandbox with test keys",
      "Community support",
    ],
    cta: "Start free",
    href: register,
    highlighted: false,
  },
  {
    name: "Cloud Growth",
    price: "$15",
    period: "/mo",
    secondary: "Billed in US dollars · two months free yearly",
    description: "No limits, priced for African businesses.",
    features: [
      "Unlimited customers and subscriptions",
      "Unlimited invoices and team members",
      "Everything in Cloud Free",
      "Pay by card or PayPal",
      "Priority support",
      "Automatic updates and backups",
    ],
    cta: "Choose Growth",
    href: register,
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large, multi-entity billing operations.",
    features: [
      "Everything in Cloud Growth",
      "Dedicated database cluster",
      "Custom SLA",
      "SSO / SAML",
      "On-premise deployment support",
      "A named account manager",
    ],
    cta: "Contact us",
    href: `mailto:${site.contactEmail}`,
    highlighted: false,
  },
];

type Mark = true | false | string;
const comparison: { feature: string; us: Mark; stripe: Mark; lago: Mark; chargebee: Mark }[] = [
  { feature: "Open source, self-host on your own servers", us: true, stripe: false, lago: true, chargebee: false },
  { feature: "Mobile money built in (MTN MoMo, Airtel Money)", us: true, stripe: false, lago: false, chargebee: false },
  { feature: "Subscriptions, usage billing, coupons and add-ons", us: true, stripe: true, lago: true, chargebee: true },
  { feature: "Payouts and wallet transfers", us: true, stripe: "With Connect", lago: false, chargebee: false },
  { feature: "Double-entry ledger of every movement", us: true, stripe: false, lago: false, chargebee: false },
  { feature: "Get paid without your own provider account", us: "On our cloud", stripe: true, lago: false, chargebee: false },
  { feature: "Price", us: "Free, then $15 a month", stripe: "0.7% of billing volume", lago: "Free to self-host; cloud on quote", chargebee: "Free to $250K billed, then from about $599 a month" },
];

function CompareCell({ value }: { value: Mark }) {
  if (value === true) return <Check className="mx-auto h-5 w-5 text-teal" aria-label="Yes" />;
  if (value === false) return <Minus className="mx-auto h-5 w-5 text-ink-2/50" aria-label="No" />;
  return <span className="text-sm">{value}</span>;
}

/* How it compares, fairly: what each one does out of the box. */
function Compare() {
  return (
    <section id="compare" aria-labelledby="compare-title" className="bg-mist">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Compare" title={`How ${site.name} compares`} lede="Built for the way payments work across Africa, without giving up what the global tools do well." />
        <div className="mt-10 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-left">
            <caption className="sr-only">{site.name} compared with Stripe Billing, Lago and Chargebee</caption>
            <thead>
              <tr className="border-b border-line text-sm">
                <th scope="col" className="w-[34%] px-5 py-4 font-medium text-ink-2">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="bg-teal/5 px-5 py-4 text-center font-semibold text-teal">{site.name}</th>
                <th scope="col" className="px-5 py-4 text-center font-semibold">Stripe Billing</th>
                <th scope="col" className="px-5 py-4 text-center font-semibold">Lago</th>
                <th scope="col" className="px-5 py-4 text-center font-semibold">Chargebee</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.feature} className="border-b border-line last:border-0">
                  <th scope="row" className="px-5 py-4 text-sm font-medium">{row.feature}</th>
                  <td className="bg-teal/5 px-5 py-4 text-center font-medium"><CompareCell value={row.us} /></td>
                  <td className="px-5 py-4 text-center text-ink-2"><CompareCell value={row.stripe} /></td>
                  <td className="px-5 py-4 text-center text-ink-2"><CompareCell value={row.lago} /></td>
                  <td className="px-5 py-4 text-center text-ink-2"><CompareCell value={row.chargebee} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-ink-2">Out-of-the-box features and public list prices as of October 2026. Check each vendor&apos;s site for current details.</p>
      </div>
    </section>
  );
}

/** Not a cloud tier: the open-source product on your own servers, shown on its own below the cloud plans. */
const selfHosted = {
  name: "Self-hosted",
  description: "Run the open-source platform on your own servers, free forever, with no limits.",
  features: [
    "Every feature, unlimited organisations and customers",
    "Bring your own payment providers: every provider supported",
    "AGPL-3.0, installed with one Docker command",
    "Your own sandbox deployment",
    "Community support on GitHub",
  ],
  cta: "Deploy from GitHub",
  href: site.githubUrl,
};

function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>Pricing</Eyebrow>
          <h2 id="pricing-title" className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Start free. Pay when you grow.
          </h2>
          <p className="mt-4 text-lg text-ink-2">We host it for you, with a plan for every stage of your business.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-3xl border p-8 ${t.highlighted ? "border-ink bg-ink text-white [&_.text-ink-2]:text-night-ink-2 [&_.text-teal]:text-[#5eead4]" : "border-line bg-white"}`}
            >
              <h3 className="text-lg font-semibold">{t.name}</h3>
              <p className="mt-4">
                <span className="whitespace-nowrap font-display text-4xl font-semibold">{t.price}</span>
                {t.period && <span className="text-ink-2">{t.period}</span>}
              </p>
              {"secondary" in t && t.secondary && <p className="mt-1 text-sm text-ink-2">{t.secondary}</p>}
              <p className="mt-3 text-ink-2">{t.description}</p>
              <ul className="mt-6 grid flex-1 gap-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="h-4 w-4 shrink-0 translate-y-0.5 text-teal" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              {t.href ? (
                <a
                  href={t.href}
                  className={`mt-8 inline-flex h-11 items-center justify-center rounded-full px-5 font-semibold transition-colors ${
                    t.highlighted ? "bg-white text-ink hover:bg-glow" : "border border-line hover:border-ink"
                  }`}
                >
                  {t.cta}
                </a>
              ) : (
                <p className="mt-8 inline-flex h-11 items-center justify-center rounded-lg border border-dashed border-line px-4 font-semibold text-ink-2">
                  {t.cta}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 rounded-3xl border border-line bg-mist p-8 lg:grid-cols-[1fr_1.4fr_auto] lg:items-center">
          <div>
            <h3 className="text-lg font-semibold">{selfHosted.name}</h3>
            <p className="mt-1 font-display text-2xl font-semibold">Free</p>
            <p className="mt-2 text-ink-2">{selfHosted.description}</p>
          </div>
          <ul className="grid gap-2.5 text-sm sm:grid-cols-2">
            {selfHosted.features.map((f) => (
              <li key={f} className="flex gap-2.5">
                <Check className="h-4 w-4 shrink-0 translate-y-0.5 text-teal" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <a
            href={selfHosted.href}
            className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-ink/20 bg-white px-5 font-semibold transition-colors hover:border-ink"
          >
            {selfHosted.cta}
          </a>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-mist">
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
        <h2 id="faq-title" className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Questions
        </h2>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {faq.map((q) => (
            <details key={q.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <h3>{q.question}</h3>
                <span aria-hidden className="text-2xl font-light text-teal transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-ink-2">{q.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-night px-8 py-20 text-white sm:px-16">
          <TallyArt id="tally-cta" bars={34} className="absolute -right-10 top-0 hidden h-full w-1/2 opacity-90 md:block" />
          <h2 id="cta-title" className="relative max-w-xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Billing that measures every shilling, cent and satoshi
          </h2>
          <div className="relative mt-9 flex flex-wrap gap-3">
            <a href={register} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-ink transition hover:bg-glow">
              Start free <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a href={site.githubUrl} className="inline-flex h-12 items-center rounded-full border border-white/25 px-6 font-semibold transition hover:bg-white/10">
              Star on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
