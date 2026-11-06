import { ArrowRight, Check } from "lucide-react";

import Footer from "@/components/footer";
import Header from "@/components/header";
import { topicPage, type TopicPage } from "@/lib/pages";
import { site } from "@/lib/site";

/** Breadcrumbs, the page itself and its FAQ, as schema.org structured data. */
function structuredData(page: TopicPage) {
  const url = `${site.url}/${page.path}`;
  const crumbs = [
    { name: site.name, url: site.url },
    ...(page.section.path ? [{ name: page.section.name, url: `${site.url}/${page.section.path}` }] : []),
    { name: page.h1, url },
  ];
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url,
      inLanguage: "en",
      isPartOf: { "@type": "WebSite", name: site.name, url: site.url },
      about: { "@type": "SoftwareApplication", name: site.name, applicationCategory: "BusinessApplication", url: site.url },
    },
    ...(page.faq.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: page.faq.map((q) => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })),
          },
        ]
      : []),
  ];
}

export default function TopicPageView({ page }: { page: TopicPage }) {
  const related = page.related.map(topicPage).filter((p): p is TopicPage => Boolean(p));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(page)).replace(/</g, "\\u003c") }} />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <section aria-labelledby="topic-title" className="bg-wash">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
            <nav aria-label="Breadcrumb" className="text-sm font-medium text-ink-2">
              <a href="/" className="hover:text-teal">
                {site.name}
              </a>
              <span aria-hidden> / </span>
              <span>{page.section.name}</span>
            </nav>
            <h1 id="topic-title" className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              {page.h1}
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-ink-2 sm:text-xl">{page.lede}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`${site.dashboardUrl}/register`}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-white transition hover:bg-teal"
              >
                Start free <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a href={site.docsUrl} className="inline-flex h-12 items-center rounded-full border border-ink/15 bg-white/70 px-6 font-semibold transition hover:border-ink">
                Read the docs
              </a>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          {page.sections.map((s) => (
            <section key={s.heading} className="mb-12">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{s.heading}</h2>
              {s.body?.map((p) => (
                <p key={p.slice(0, 40)} className="mt-4 text-lg text-ink-2">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-5 grid gap-3">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex gap-3 text-ink-2">
                      <Check className="h-5 w-5 shrink-0 translate-y-0.5 text-teal" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {page.faq.length > 0 && (
            <section aria-labelledby="topic-faq" className="mb-12 border-t border-line pt-12">
              <h2 id="topic-faq" className="font-display text-2xl font-semibold tracking-tight">
                Questions
              </h2>
              <dl className="mt-6 grid gap-6">
                {page.faq.map((q) => (
                  <div key={q.question}>
                    <dt className="font-semibold">{q.question}</dt>
                    <dd className="mt-2 text-ink-2">{q.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {related.length > 0 && (
            <nav aria-labelledby="topic-related" className="border-t border-line pt-12">
              <h2 id="topic-related" className="font-display text-xl font-semibold tracking-tight">
                Related
              </h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {related.map((r) => (
                  <li key={r.path}>
                    <a href={`/${r.path}`} className="block rounded-xl border border-line bg-card p-5 transition hover:border-teal">
                      <span className="font-semibold">{r.h1}</span>
                      <span className="mt-1 block text-sm text-ink-2">{r.description}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
