import { Menu } from "lucide-react";

import { site } from "@/lib/site";
import { BrandLockup } from "@/components/brand-mark";

const navLinks = [
  { label: "Product", href: "#product" },
  { label: "Developers", href: "#developers" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Docs", href: site.docsUrl },
];

const linkClass = "text-sm font-medium text-night-ink-2 transition-colors hover:text-white";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-night-line bg-night/85 text-night-ink backdrop-blur-xl [&_.text-teal]:text-glow">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <a href="/" aria-label={`${site.name} home`}>
          <BrandLockup />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <a href={site.githubUrl} className={linkClass}>
            GitHub
          </a>
          <a href={`${site.dashboardUrl}/login`} className={linkClass}>
            Sign in
          </a>
          <a
            href={`${site.dashboardUrl}/register`}
            className="inline-flex h-10 items-center rounded-lg bg-glow px-4 text-sm font-semibold text-night transition hover:brightness-110"
          >
            Start free
          </a>
        </div>

        <details className="group relative md:hidden">
          <summary
            aria-label="Menu"
            className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-night-ink-2 hover:text-white [&::-webkit-details-marker]:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </summary>
          <nav
            aria-label="Main"
            className="absolute right-0 top-12 flex w-60 flex-col gap-1 rounded-xl border border-line bg-card p-2 shadow-lg"
          >
            {[...navLinks, { label: "GitHub", href: site.githubUrl }, { label: "Sign in", href: `${site.dashboardUrl}/login` }].map(
              (link) => (
                <a key={link.href} href={link.href} className="rounded-md px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-mist hover:text-ink">
                  {link.label}
                </a>
              ),
            )}
            <a
              href={`${site.dashboardUrl}/register`}
              className="mt-1 rounded-md bg-teal px-3 py-2.5 text-center text-sm font-semibold text-on-teal hover:bg-teal-strong"
            >
              Start free
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}
