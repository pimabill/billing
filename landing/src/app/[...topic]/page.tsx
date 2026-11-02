import type { Metadata } from "next";
import { notFound } from "next/navigation";

import TopicPageView from "@/components/topic-page";
import { topicPage, topicPages } from "@/lib/pages";
import { site } from "@/lib/site";

// Only the pages in lib/pages.ts exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return topicPages.map((p) => ({ topic: p.path.split("/") }));
}

type Props = { params: Promise<{ topic: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = topicPage((await params).topic.join("/"));
  if (!page) return {};
  const url = `/${page.path}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: site.name, title: page.title, description: page.description, locale: "en" },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
  };
}

export default async function Page({ params }: Props) {
  const page = topicPage((await params).topic.join("/"));
  if (!page) notFound();
  return <TopicPageView page={page} />;
}
