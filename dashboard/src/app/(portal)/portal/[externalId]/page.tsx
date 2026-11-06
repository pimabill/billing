"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertCircle, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { brand } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";

interface BillingData {
  merchant?: { name: string };
  customer: {
    id: string;
    externalId: string;
    name: string;
    email: string;
    currency: string;
  };
  subscriptions: Array<{
    id: string;
    status: string;
    plan: { name: string; billingInterval: string; prices: Array<{ currency: string; amount: number }> };
    currency: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEnd?: string;
    cancelAt?: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    amountDue?: number;
    currency: string;
    status: string;
    dueDate: string;
    paidAt?: string;
    pdfUrl?: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    invoiceNumber?: string;
    createdAt: string;
  }>;
  summary: {
    activeSubscriptions: number;
    totalSpent: number;
    currency: string;
    pendingInvoices: number;
  };
}

const STATUS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-50 text-emerald-700" },
  TRIALING: { label: "Trial", className: "bg-blue-50 text-blue-700" },
  PAUSED: { label: "Paused", className: "bg-amber-50 text-amber-800" },
  PAST_DUE: { label: "Past due", className: "bg-red-50 text-red-700" },
  CANCELED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  PENDING: { label: "Due", className: "bg-amber-50 text-amber-800" },
  PROCESSING: { label: "Processing", className: "bg-amber-50 text-amber-800" },
  PAID: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  SUCCEEDED: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", className: "bg-red-50 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS[status] ?? { label: status.toLowerCase(), className: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>{config.label}</span>;
}

const OPEN = new Set(["PENDING", "FAILED"]);
const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 divide-y rounded-xl border bg-card">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-5 text-sm text-muted-foreground">{children}</p>;
}

export default function CustomerBillingPortal() {
  const params = useParams();
  const searchParams = useSearchParams();
  const externalId = params.externalId as string;
  // A short-lived portal token from the link (never an API key). Move it out of
  // the address bar so it does not linger in history or leak in Referer headers.
  const [token, setToken] = useState("");
  const [tokenChecked, setTokenChecked] = useState(false);
  useEffect(() => {
    const storageKey = `portal-token:${externalId}`;
    const fromUrl = searchParams.get("token");
    let value = fromUrl || "";
    try {
      if (fromUrl) {
        sessionStorage.setItem(storageKey, fromUrl);
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        window.history.replaceState(null, "", url.toString());
      } else {
        value = sessionStorage.getItem(storageKey) || "";
      }
    } catch {
      // Storage unavailable: keep the token in memory for this visit.
    }
    setToken(value);
    setTokenChecked(true);
  }, [externalId, searchParams]);
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenChecked) return;
    if (!token) {
      setError("This portal link is missing its access token or has expired. Ask for a new link.");
      setLoading(false);
      return;
    }
    loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalId, token, tokenChecked]);

  async function downloadPdf(invoiceId: string, invoiceNumber: string) {
    const res = await fetch(`/api/portal/${encodeURIComponent(externalId)}?resource=pdf&invoiceId=${encodeURIComponent(invoiceId)}`, { headers: authHeaders });
    if (!res.ok) return setNotice("We could not download that invoice. Try again.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadBilling() {
    try {
      setLoading(true);
      const res = await fetch(`/api/portal/${encodeURIComponent(externalId)}?resource=billing`, { headers: authHeaders });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Error ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || "Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }

  /** Open the hosted checkout, where the customer chooses how to pay. */
  async function pay(invoiceId: string) {
    setCheckoutLoading(invoiceId);
    setNotice(null);
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(externalId)}?invoiceId=${encodeURIComponent(invoiceId)}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ callbackUrl: window.location.href, hosted: true }),
      });
      const body = await res.json().catch(() => ({}));
      const url = (body.data ?? body).checkoutUrl;
      if (!res.ok || !url) throw new Error(body.message || "We could not start the payment.");
      window.location.href = url;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "We could not start the payment.");
      setCheckoutLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <BrandMark animated tight className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Loading billing information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-10 w-10 mx-auto text-red-500" />
          <h2 className="mt-3 text-lg font-semibold">Unable to load billing</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const open = data.invoices.filter((inv) => OPEN.has(inv.status));
  const dueOf = (inv: BillingData["invoices"][number]) => inv.amountDue ?? inv.amount;
  const currencies = new Set(open.map((inv) => inv.currency));
  const merchantName = data.merchant?.name ?? "Billing";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
            {merchantName.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 truncate font-medium">{merchantName}</span>
          <span className="ml-auto min-w-0 truncate text-sm text-muted-foreground">{data.customer.name || data.customer.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your billing</h1>

        {notice && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {notice}
          </p>
        )}

        <div className="mt-6 rounded-xl bg-muted/70 p-5 sm:p-6">
          {open.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">Amount due</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">Nothing to pay</p>
              <p className="mt-1 text-sm text-muted-foreground">You&apos;re all paid up.</p>
            </>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Amount due</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight">
                  {currencies.size === 1 ? formatCurrency(open.reduce((sum, inv) => sum + dueOf(inv), 0), open[0].currency) : `${open.length} invoices`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {open.length === 1 ? `Invoice ${open[0].invoiceNumber}, due ${shortDate(open[0].dueDate)}` : `Across ${open.length} invoices`}
                </p>
              </div>
              {open.length === 1 && (
                <button
                  type="button"
                  onClick={() => pay(open[0].id)}
                  disabled={checkoutLoading !== null}
                  className="flex h-11 min-w-28 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {checkoutLoading === open[0].id ? <BrandMark animated tight className="h-4 w-4" /> : "Pay now"}
                </button>
              )}
            </div>
          )}
        </div>

        <Section title="Subscriptions">
          {data.subscriptions.length === 0 ? (
            <Empty>You have no active subscriptions.</Empty>
          ) : (
            data.subscriptions.map((sub) => {
              const price = sub.plan.prices.find((p) => p.currency === sub.currency);
              return (
                <div key={sub.id} className="flex items-center justify-between gap-4 p-4 sm:p-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{sub.plan.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {price && `${formatCurrency(Number(price.amount), sub.currency)} / ${sub.plan.billingInterval.toLowerCase()} · `}
                      {sub.cancelAt
                        ? `Ends ${shortDate(sub.cancelAt)}`
                        : sub.trialEnd && new Date(sub.trialEnd) > new Date()
                          ? `Trial ends ${shortDate(sub.trialEnd)}`
                          : `Renews ${shortDate(sub.currentPeriodEnd)}`}
                    </p>
                  </div>
                  <StatusBadge status={sub.status} />
                </div>
              );
            })
          )}
        </Section>

        <Section title="Invoices">
          {data.invoices.length === 0 ? (
            <Empty>No invoices yet.</Empty>
          ) : (
            data.invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{inv.invoiceNumber}</span>
                    <StatusBadge status={inv.status} />
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{inv.paidAt ? `Paid ${shortDate(inv.paidAt)}` : `Due ${shortDate(inv.dueDate)}`}</p>
                </div>
                <p className="text-sm font-medium">{formatCurrency(inv.amount, inv.currency)}</p>
                <div className="flex items-center gap-1.5">
                  {inv.pdfUrl && (
                    <button
                      type="button"
                      onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                      aria-label={`Download invoice ${inv.invoiceNumber}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  {OPEN.has(inv.status) && open.length > 1 && (
                    <button
                      type="button"
                      onClick={() => pay(inv.id)}
                      disabled={checkoutLoading !== null}
                      className="flex h-9 min-w-16 items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      {checkoutLoading === inv.id ? <BrandMark animated tight className="h-3.5 w-3.5" /> : "Pay"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </Section>

        <Section title="Payments">
          {data.payments.length === 0 ? (
            <Empty>No payments yet.</Empty>
          ) : (
            data.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 p-4 sm:px-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {formatCurrency(p.amount, p.currency)}
                    <StatusBadge status={p.status} />
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {p.invoiceNumber && `${p.invoiceNumber} · `}
                    {shortDate(p.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </Section>

        <p className="mt-12 text-center text-xs text-muted-foreground">Powered by {brand.name}</p>
      </main>
    </div>
  );
}
