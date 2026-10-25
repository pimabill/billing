import { ArrowRight, Check, Code2, Landmark, Layers, Server, Smartphone, Users } from "lucide-react";

import Header from "@/components/header";
import { BrandLockup } from "@/components/brand-mark";
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
      <main id="main">
        <Hero />
        <Rails />
        <Steps />
        <Pillars />
        <Money />
        <Developers />
        <Pricing />
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.08em] text-teal">{children}</p>;
}

function SectionHeading({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {lede && <p className="mt-4 text-lg text-ink-2">{lede}</p>}
    </div>
  );
}

/* Hero: the promise, two ways in, and a ledger reading as the picture. */
function Hero() {
  const lines = [
    { label: "Collected", value: "1,250,000" },
    { label: "Paid out", value: "−840,000" },
    { label: "Provider fees", value: "−18,750" },
  ];
  return (
    <section aria-labelledby="hero-title" className="border-b border-line">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <Eyebrow>Open source · {site.license} · Self-host or cloud</Eyebrow>
          <h1 id="hero-title" className="mt-4 font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Open-source billing for the way Africa pays
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-2">
            Subscriptions, usage and one-time payments over mobile money, cards, banks and crypto. Every shilling, cent
            and satoshi posts to a double-entry ledger your finance team can reconcile.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={register}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-teal px-5 font-semibold text-on-teal transition-colors hover:bg-teal-strong"
            >
              Start free <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a
              href={site.githubUrl}
              className="inline-flex h-12 items-center rounded-lg border border-line bg-card px-5 font-semibold transition-colors hover:border-teal"
            >
              Self-host from GitHub
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-2">
            Or read the{" "}
            <a href={site.docsUrl} className="font-medium text-teal underline-offset-4 hover:underline">
              quickstart
            </a>
            : running locally in about five minutes.
          </p>
        </div>

        <figure className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          <figcaption className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.08em] text-ink-2">
            <span>Ledger · this month</span>
            <span>Example</span>
          </figcaption>
          <dl className="mt-5 grid gap-3 font-mono text-[15px] tabular-nums">
            {lines.map((l) => (
              <div key={l.label} className="flex justify-between gap-4 border-b border-line pb-3">
                <dt className="text-ink-2">{l.label}</dt>
                <dd>UGX {l.value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 pt-1 font-medium text-bark">
              <dt>Balance</dt>
              <dd>UGX 391,250</dd>
            </div>
          </dl>
          <ol className="mt-6 grid gap-3 text-sm">
            {[
              ["MTN MoMo renewal", "Prompt sent to 0771 234 567"],
              ["Payment failed", "Retried by dunning, pay link sent"],
              ["Paid", "Posted to the ledger, webhook delivered"],
            ].map(([what, detail], i) => (
              <li key={what} className="flex gap-3">
                <span
                  aria-hidden
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px] ${i === 2 ? "bg-teal" : "bg-teal/50"}`}
                />
                <span>
                  <span className="font-medium">{what}</span>
                  <span className="block text-ink-2">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}

/* Rails: every way the software can collect or pay out. */
function Rails() {
  const groups = [
    { title: "Mobile money", items: rails.mobileMoney },
    { title: "Cards and banks", items: rails.cardsAndBanks },
    { title: "Crypto", items: rails.crypto },
  ];
  return (
    <section aria-labelledby="rails-title" className="border-b border-line bg-card">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 id="rails-title" className="font-display text-xl font-semibold tracking-tight">
          Built for how your customers pay
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">{g.title}</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {g.items.map((r) => (
                  <li key={r} className="rounded-full border border-line px-3 py-1 text-sm">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
    <section id="product" aria-labelledby="steps-title" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="steps-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Measure it. Bill it. Settle it.
          </h2>
          <p className="mt-4 text-lg text-ink-2">
            &ldquo;Pima&rdquo; is Swahili for <em>measure</em>: what usage billing and a ledger do before anyone is charged.
          </p>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-line bg-card p-6">
              <span className="font-mono text-sm text-teal">0{i + 1}</span>
              <h3 className="mt-3 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-3 text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pillars() {
  const pillars = [
    {
      icon: Smartphone,
      title: "Built for how customers pay",
      body: "Renewals designed around mobile money prompts, retries and reminders, beside cards, bank transfers, PayPal and crypto.",
    },
    {
      icon: Layers,
      title: "One ledger for every movement",
      body: "Subscriptions, usage, collections, payouts, transfers and platform fees post to a double-entry ledger finance can reconcile.",
    },
    {
      icon: Server,
      title: "Yours to run",
      body: `${site.license}, self-hosted on PostgreSQL, with no processor lock-in. Switch providers without rewriting your billing.`,
    },
    {
      icon: Code2,
      title: "Developer-first",
      body: "An OpenAPI spec, TypeScript, Python and PHP SDKs, signed webhooks and idempotent money endpoints.",
    },
    {
      icon: Users,
      title: "Teams and organisations",
      body: "Owner, admin, finance, developer and viewer roles, invitations, and several organisations from one login.",
    },
    {
      icon: Landmark,
      title: "Start without a merchant account",
      body: "On the cloud, managed payments collect for you through our provider accounts before you have contracts of your own, and pay out to your mobile money, bank or PayPal.",
    },
  ];
  return (
    <section aria-labelledby="pillars-title" className="border-b border-line bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 id="pillars-title" className="max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Billing and money infrastructure in one open-source product
        </h2>
        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="border-t-2 border-teal pt-5">
              <p.icon className="h-5 w-5 text-teal" aria-hidden />
              <h3 className="mt-3 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-ink-2">{p.body}</p>
            </div>
          ))}
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
    <section aria-labelledby="money-title" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Money movement"
          title="Collect, pay out and reconcile in one place"
          lede="With your own provider accounts, every rail moves money between your payers and accounts you own. Without them, managed payments collects for you and pays you out."
        />
        <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([title, body]) => (
            <div key={title} className="bg-card p-6">
              <dt className="font-semibold">{title}</dt>
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
    <section id="developers" aria-labelledby="dev-title" className="border-b border-line bg-card">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <Eyebrow>Developers</Eyebrow>
          <h2 id="dev-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
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
          className="overflow-x-auto rounded-2xl bg-code p-6 font-mono text-[13px] leading-6 text-[#d7e3e0]"
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
      "100 customers and 100 active subscriptions",
      "300 invoices a month, 2 team members",
      "Every feature: usage billing, wallets, the ledger",
      "Managed payments: take payments without a provider account",
      "Sandbox with test keys",
      "Community support",
    ],
    cta: "Start free",
    href: register,
    highlighted: false,
  },
  {
    name: "Cloud Growth",
    price: "$29",
    period: "/mo",
    secondary: "or UGX 110,000 a month · two months free yearly",
    description: "For businesses billing every month.",
    features: [
      "5,000 customers and 5,000 active subscriptions",
      "10,000 invoices a month, 10 team members",
      "Everything in Cloud Free",
      "Pay by card or mobile money",
      "Priority email support",
      "Automatic updates and backups",
    ],
    cta: "Start free, upgrade any time",
    href: register,
    highlighted: true,
  },
  {
    name: "Self-hosted",
    price: "Free",
    period: "",
    description: "Run the open-source platform on your own servers. No limits.",
    features: [
      "Every feature, unlimited organisations and customers",
      "Bring your own provider accounts: every provider supported",
      "AGPL-3.0, Docker compose in minutes",
      "Your own sandbox deployment",
      "Community support on GitHub",
      "Managed payments are cloud-only",
    ],
    cta: "Deploy from GitHub",
    href: site.githubUrl,
    highlighted: false,
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

function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>Pricing</Eyebrow>
          <h2 id="pricing-title" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Start free. Pay when you grow.
          </h2>
          <p className="mt-4 text-lg text-ink-2">Free on our cloud while you start, and free to self-host forever.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border bg-card p-7 ${t.highlighted ? "border-teal ring-1 ring-teal" : "border-line"}`}
            >
              <h3 className="text-lg font-semibold">{t.name}</h3>
              <p className="mt-4">
                <span className="font-display text-4xl font-semibold">{t.price}</span>
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
                  className={`mt-8 inline-flex h-11 items-center justify-center rounded-lg px-4 font-semibold transition-colors ${
                    t.highlighted ? "bg-teal text-on-teal hover:bg-teal-strong" : "border border-line hover:border-teal"
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
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="border-b border-line bg-card">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <h2 id="faq-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Questions
        </h2>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {faq.map((q) => (
            <details key={q.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <h3>{q.question}</h3>
                <span aria-hidden className="font-mono text-teal transition-transform group-open:rotate-45">
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
    <section aria-labelledby="cta-title">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="rounded-3xl bg-teal px-8 py-14 text-on-teal sm:px-14">
          <h2 id="cta-title" className="max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Billing that measures every shilling, cent and satoshi
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={register} className="inline-flex h-12 items-center rounded-lg bg-on-teal px-5 font-semibold text-teal">
              Start free
            </a>
            <a href={site.githubUrl} className="inline-flex h-12 items-center rounded-lg border border-on-teal/40 px-5 font-semibold">
              Star on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const columns = [
    {
      title: "Product",
      links: [
        ["How it works", "#product"],
        ["Pricing", "#pricing"],
        ["FAQ", "#faq"],
      ],
    },
    {
      title: "Developers",
      links: [
        ["Documentation", site.docsUrl],
        ["API reference", site.apiRefUrl],
        ["GitHub", site.githubUrl],
      ],
    },
    {
      title: "Company",
      links: [
        ["Contact", `mailto:${site.contactEmail}`],
        ["Security", `${site.githubUrl}/security/policy`],
        ["Licence", `${site.githubUrl}/blob/main/LICENSE`],
      ],
    },
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <BrandLockup />
          <p className="mt-4 max-w-xs text-sm text-ink-2">{site.tagline}.</p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-ink-2">{c.title}</h2>
            <ul className="mt-4 grid gap-2.5 text-sm">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="hover:text-teal">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-sm text-ink-2 sm:px-6">
        © {new Date().getFullYear()} {site.name}. Open source under {site.license}.
      </p>
    </footer>
  );
}
