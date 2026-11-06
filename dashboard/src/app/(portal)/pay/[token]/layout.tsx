import type { Metadata } from "next";

/** The address holds the link's token: keep it out of search and of Referer headers to payment pages. */
export const metadata: Metadata = {
  title: "Pay",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
