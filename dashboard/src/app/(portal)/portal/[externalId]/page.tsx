"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  CreditCard,
  Receipt,
  Download,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { brand } from "@/lib/brand";
import { PAYPAL_CURRENCIES } from "@/lib/paypal";
import { BrandMark } from "@/components/brand-mark";

interface BillingData {
  /** Whether this business takes PayPal (for invoices in a currency PayPal takes). */
  paymentOptions?: { paypal: boolean };
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

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  ACTIVE: { icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50", label: "Active" },
  TRIALING: { icon: Clock, color: "text-blue-700", bg: "bg-blue-50", label: "Trial" },
  PAUSED: { icon: Clock, color: "text-amber-700", bg: "bg-amber-50", label: "Paused" },
  PAST_DUE: { icon: AlertCircle, color: "text-red-700", bg: "bg-red-50", label: "Past Due" },
  CANCELED: { icon: XCircle, color: "text-gray-500", bg: "bg-gray-100", label: "Canceled" },
  PENDING: { icon: Clock, color: "text-amber-700", bg: "bg-amber-50", label: "Pending" },
  PAID: { icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50", label: "Paid" },
  FAILED: { icon: XCircle, color: "text-red-700", bg: "bg-red-50", label: "Failed" },
  SUCCEEDED: { icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50", label: "Succeeded" },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.PENDING;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bg}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
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
  const [activeTab, setActiveTab] = useState<"overview" | "invoices" | "payments">("overview");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);

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
    if (!res.ok) return setError("Could not download the invoice");
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

  async function handleCheckout(invoiceId: string, method?: "paypal") {
    setCheckoutLoading(method ? `${invoiceId}:paypal` : invoiceId);
    try {
      const res = await fetch(
        `/api/portal/${encodeURIComponent(externalId)}?invoiceId=${encodeURIComponent(invoiceId)}`,
        { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ callbackUrl: window.location.href, ...(method && { method }) }) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to create checkout");
      }
      const result = await res.json();
      const checkout = result.data || result;
      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl;
      }
    } catch (e: any) {
      alert(e.message || "Payment failed");
    } finally {
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscriptions, view invoices, and make payments.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-card rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Active Subscriptions</p>
          <p className="text-2xl font-bold mt-1">{data.summary.activeSubscriptions}</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Total Spent</p>
          <p className="text-2xl font-bold mt-1">
            {formatCurrency(data.summary.totalSpent, data.summary.currency)}
          </p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Pending Invoices</p>
          <p className="text-2xl font-bold mt-1">{data.summary.pendingInvoices}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b mb-6">
        {(["overview", "invoices", "payments"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" ? "Subscriptions" : tab === "invoices" ? "Invoices" : "Payments"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {data.subscriptions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No active subscriptions</p>
            </div>
          ) : (
            data.subscriptions.map((sub) => {
              const price = sub.plan.prices.find((p) => p.currency === sub.currency);
              const isExpanded = expandedSub === sub.id;
              return (
                <div key={sub.id} className="bg-card rounded-lg border">
                  <button
                    onClick={() => setExpandedSub(isExpanded ? null : sub.id)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{sub.plan.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {price ? formatCurrency(Number(price.amount), sub.currency) : "N/A"} / {sub.plan.billingInterval.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={sub.status} />
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t pt-3 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current Period</span>
                        <span>
                          {new Date(sub.currentPeriodStart).toLocaleDateString()} — {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                        </span>
                      </div>
                      {sub.trialEnd && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trial Ends</span>
                          <span>{new Date(sub.trialEnd).toLocaleDateString()}</span>
                        </div>
                      )}
                      {sub.cancelAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cancels At</span>
                          <span className="text-red-600">{new Date(sub.cancelAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "invoices" && (
        <div className="space-y-3">
          {data.invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No invoices yet</p>
            </div>
          ) : (
            data.invoices.map((inv) => (
              <div key={inv.id} className="bg-card rounded-lg border p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{inv.invoiceNumber}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Due {new Date(inv.dueDate).toLocaleDateString()} &middot; {formatCurrency(inv.amount, inv.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {inv.pdfUrl && (
                    <button
                      type="button"
                      onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-muted transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      PDF
                    </button>
                  )}
                  {inv.status === "PENDING" && (
                    <button
                      onClick={() => handleCheckout(inv.id)}
                      disabled={checkoutLoading === inv.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {checkoutLoading === inv.id ? (
                        <BrandMark animated tight className="h-3 w-3" />
                      ) : (
                        <ExternalLink className="h-3 w-3" />
                      )}
                      Pay Now
                    </button>
                  )}
                  {inv.status === "PENDING" && data?.paymentOptions?.paypal && PAYPAL_CURRENCIES.has(inv.currency) && (
                    <button
                      onClick={() => handleCheckout(inv.id, "paypal")}
                      disabled={checkoutLoading !== null}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {checkoutLoading === `${inv.id}:paypal` && <BrandMark animated tight className="h-3 w-3" />}
                      PayPal
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-3">
          {data.payments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No payments yet</p>
            </div>
          ) : (
            data.payments.map((p) => (
              <div key={p.id} className="bg-card rounded-lg border p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{formatCurrency(p.amount, p.currency)}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {p.invoiceNumber && `${p.invoiceNumber} · `}
                    {p.provider} &middot; {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t text-center">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="font-medium">{brand.name}</span>
        </p>
      </div>
    </div>
  );
}
