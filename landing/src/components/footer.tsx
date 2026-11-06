import { BrandLockup } from "@/components/brand-mark";
import { topicGroups } from "@/lib/pages";
import { site } from "@/lib/site";

export default function Footer() {
  const columns = [
    {
      title: "Product",
      links: [
        ["How it works", "/#product"],
        ["Pricing", "/pricing"],
        ["FAQ", "/#faq"],
      ],
    },
    ...topicGroups.map((g) => ({ title: g.title, links: g.pages.map((p) => [p.nav, `/${p.path}`]) })),
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
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(6,minmax(0,1fr))]">
        <div className="md:col-span-3 lg:col-span-1">
          <BrandLockup />
          <p className="mt-4 max-w-xs text-sm text-ink-2">{site.tagline}.</p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold">{c.title}</h2>
            <ul className="mt-4 grid gap-2.5 text-sm">
              {c.links.map(([text, href]) => (
                <li key={href}>
                  <a href={href} className="hover:text-teal">
                    {text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-10 text-sm text-ink-2 sm:px-6">
        © {new Date().getFullYear()} {site.name}. Open source under {site.license}.
      </p>
    </footer>
  );
}
