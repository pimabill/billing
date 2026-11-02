import type { Metadata, Viewport } from "next";
// Fonts ship with the app (Fontsource) so builds never fetch from Google Fonts.
import "@fontsource-variable/unbounded";
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource-variable/jetbrains-mono";
import { growthMonthly } from "@/lib/pages";
import { keywords, site } from "@/lib/site";
import "./globals.css";

const title = `${site.name}: ${site.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: title, template: `%s · ${site.name}` },
  description: site.description,
  keywords,
  applicationName: site.name,
  category: "Billing software",
  creator: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: site.name,
    title,
    description: site.description,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: site.description,
    ...(site.twitter && { site: site.twitter, creator: site.twitter }),
  },
  robots: site.noindex
    ? { index: false, follow: false }
    : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  icons: { icon: [{ url: site.logo, type: "image/svg+xml" }, { url: "/logo.png", type: "image/png" }], apple: "/logo.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f4f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1114" },
  ],
};

/** Structured data on every page: who we are and what the software is. */
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    logo: `${site.url}/logo.png`,
    sameAs: [site.githubUrl],
    email: site.contactEmail,
    contactPoint: { "@type": "ContactPoint", contactType: "sales", email: site.contactEmail, availableLanguage: ["English"] },
    areaServed: ["Uganda", "Kenya", "Tanzania", "Rwanda", "Nigeria", "Ghana", "South Africa", "Africa"].map((name) => ({ "@type": name === "Africa" ? "Continent" : "Country", name })),
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    description: site.description,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    description: site.description,
    url: site.url,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Billing software",
    operatingSystem: "Linux, Docker, Web",
    license: `https://spdx.org/licenses/${site.license}.html`,
    codeRepository: site.githubUrl,
    featureList: [
      "Subscription and usage-based billing",
      "MTN MoMo and Airtel Money collections",
      "M-Pesa, cards and bank transfers through Flutterwave, Paystack, Pesapal and DPO",
      "Instalments and partial payments",
      "Payouts to mobile money and bank accounts",
      "Double-entry ledger",
      "Customer portal",
      "REST API, webhooks and SDKs",
    ],
    offers: [
      { "@type": "Offer", name: "Self-hosted", price: "0", priceCurrency: "USD", description: "Open source, on your own servers" },
      { "@type": "Offer", name: "Cloud Free", price: "0", priceCurrency: "USD", description: "Hosted: 1,000 customers, 2,500 invoices a month" },
      ...Object.entries(growthMonthly).map(([currency, amount]) => ({
        "@type": "Offer",
        name: "Cloud Growth",
        price: String(amount),
        priceCurrency: currency,
        description: "Hosted, no limits, billed monthly",
      })),
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        {children}
      </body>
    </html>
  );
}
