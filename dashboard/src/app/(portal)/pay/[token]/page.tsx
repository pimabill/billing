"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertCircle, Check, CreditCard, Lock, Smartphone } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import type { CheckoutMethod } from "@/lib/paypal";

interface Checkout {
  merchant: { name: string };
  customer: { name: string | null };
  invoice: {
    number: string;
    status: string;
    currency: string;
    total: number;
    paid: number;
    dueDate: string;
    items: { description: string; quantity: number; unitAmount: number }[];
  };
  amount: number;
  methods: CheckoutMethod[];
  returnUrl: string | null;
  sandbox: boolean;
}

/** How long to wait for a payment to be confirmed after the customer comes back. */
const CONFIRM_TRIES = 24;
const CONFIRM_EVERY_MS = 5000;

function MethodArt({ method, currency }: { method: CheckoutMethod; currency: string }) {
  if (method === "paypal") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/providers/paypal.svg" alt="" className="h-6 w-6 object-contain" />;
  }
  if (method === "mobile_money" && currency === "UGX") {
    return (
      <span className="flex -space-x-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/providers/mtn_momo.svg" alt="" className="h-6 w-6 rounded-full bg-[#ffcb05] object-contain p-0.5 ring-2 ring-card" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/providers/airtel_money.svg" alt="" className="h-6 w-6 rounded-full bg-white object-contain p-0.5 ring-2 ring-card" />
      </span>
    );
  }
  const Icon = method === "card" ? CreditCard : Smartphone;
  return <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />;
}

const METHOD_TEXT: Record<CheckoutMethod, { name: string; hint: string }> = {
  mobile_money: { name: "Mobile money", hint: "Approve the payment on your phone" },
  card: { name: "Card", hint: "Visa, Mastercard and others" },
  paypal: { name: "PayPal", hint: "Pay with your PayPal account or a card" },
};

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-center">{children}</div>;
}

export default function HostedCheckout() {
  const token = useParams().token as string;
  const returned = useSearchParams().has("returned");
  const [data, setData] = useState<Checkout | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [method, setMethod] = useState<CheckoutMethod | null>(null);
  const [paying, setPaying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const tries = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || "This payment link is not available.");
    const checkout = (body.data ?? body) as Checkout;
    // Where wallets are an option they are how most people pay, so they come first.
    checkout.methods = [...checkout.methods].sort((x, y) => Number(y === "mobile_money") - Number(x === "mobile_money"));
    setData(checkout);
    setMethod((current) => current ?? checkout.methods[0] ?? null);
    return checkout;
  }, [token]);

  useEffect(() => {
    load().catch((e: Error) => setFailure(e.message));
  }, [load]);

  // Back from the payment page: the confirmation can take a moment to arrive.
  const settled = data ? data.amount === 0 : false;
  useEffect(() => {
    if (!returned || !data || settled || gaveUp) return;
    const timer = setTimeout(() => {
      tries.current += 1;
      if (tries.current >= CONFIRM_TRIES) return setGaveUp(true);
      load().catch(() => undefined);
    }, CONFIRM_EVERY_MS);
    return () => clearTimeout(timer);
  }, [returned, data, settled, gaveUp, load]);

  async function pay() {
    if (!method) return;
    setPaying(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const body = await res.json().catch(() => ({}));
      const url = (body.data ?? body).checkoutUrl;
      if (!res.ok || !url) throw new Error(body.message || "We could not start the payment. Try again, or choose another way to pay.");
      window.location.href = url;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "We could not start the payment.");
      setPaying(false);
    }
  }

  if (failure) {
    return (
      <Centered>
        <div className="max-w-sm">
          <AlertCircle className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">We can&apos;t open this payment</h1>
          <p className="mt-2 text-sm text-muted-foreground">{failure}</p>
        </div>
      </Centered>
    );
  }

  if (!data) {
    return (
      <Centered>
        <BrandMark animated tight className="h-8 w-8 text-muted-foreground" />
      </Centered>
    );
  }

  const { invoice, merchant } = data;
  const money = (value: number) => formatCurrency(value, invoice.currency);

  if (invoice.status === "CANCELED") {
    return (
      <Centered>
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">This invoice was cancelled</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            There is nothing to pay. Contact {merchant.name} if you think this is a mistake.
          </p>
        </div>
      </Centered>
    );
  }

  if (settled) {
    return (
      <Centered>
        <div className="w-full max-w-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Payment received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {merchant.name} has your payment for invoice {invoice.number}.
          </p>
          {data.returnUrl && (
            <a href={data.returnUrl} className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Continue
            </a>
          )}
        </div>
      </Centered>
    );
  }

  const itemsTotal = invoice.items.reduce((sum, i) => sum + i.quantity * i.unitAmount, 0);
  const adjustment = invoice.total - itemsTotal;
  const partial = data.amount !== invoice.total;

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <section className="bg-muted/70 px-4 py-8 sm:px-8 lg:flex lg:justify-end lg:py-20 lg:pr-16">
        <div className="mx-auto w-full max-w-md lg:mx-0">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
              {merchant.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="font-medium">{merchant.name}</span>
            {data.sandbox && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Test mode</span>}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">Invoice {invoice.number}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">{money(data.amount)}</p>
          {invoice.items.length > 0 && (
            <dl className="mt-8 hidden space-y-3 text-sm sm:block">
              {invoice.items.map((item, i) => (
                <div key={i} className="flex justify-between gap-6">
                  <dt className="min-w-0">
                    {item.description}
                    {item.quantity !== 1 && <span className="text-muted-foreground"> × {item.quantity}</span>}
                  </dt>
                  <dd className="shrink-0">{money(item.quantity * item.unitAmount)}</dd>
                </div>
              ))}
              {adjustment !== 0 && (
                <div className="flex justify-between gap-6 text-muted-foreground">
                  <dt>Tax and discounts</dt>
                  <dd className="tabular-nums">{money(adjustment)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-6 border-t pt-3 font-medium">
                <dt>Invoice total</dt>
                <dd className="tabular-nums">{money(invoice.total)}</dd>
              </div>
              {partial && (
                <div className="flex justify-between gap-6 text-muted-foreground">
                  <dt>{invoice.paid > 0 ? "Paid so far" : "Paying now"}</dt>
                  <dd className="tabular-nums">{money(invoice.paid > 0 ? invoice.paid : data.amount)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      <section className="px-4 py-8 sm:px-8 lg:py-20 lg:pl-16">
        <div className="mx-auto w-full max-w-md lg:mx-0">
          {returned && !gaveUp ? (
            <div className="rounded-xl border p-6 text-center">
              <BrandMark animated tight className="mx-auto h-7 w-7 text-primary" />
              <h1 className="mt-4 text-lg font-semibold tracking-tight">Confirming your payment</h1>
              <p className="mt-1 text-sm text-muted-foreground">This usually takes a moment. You can keep this page open.</p>
            </div>
          ) : (
            <>
              {returned && (
                <p className="mb-5 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  We haven&apos;t confirmed a payment yet. If money left your account, don&apos;t pay again: it can take a few minutes. Otherwise, try below.
                </p>
              )}
              <h1 className="text-lg font-semibold tracking-tight">How would you like to pay?</h1>
              {data.methods.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {merchant.name} can&apos;t take this payment online right now. Contact them to pay another way.
                </p>
              ) : (
                <>
                  <div role="radiogroup" aria-label="Payment method" className="mt-4 grid gap-2.5">
                    {data.methods.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={method === m}
                        onClick={() => setMethod(m)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                          method === m ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/60",
                        )}
                      >
                        <span className="flex w-10 shrink-0 justify-center">
                          <MethodArt method={m} currency={invoice.currency} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{METHOD_TEXT[m].name}</span>
                          <span className="block text-xs text-muted-foreground">{METHOD_TEXT[m].hint}</span>
                        </span>
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", method === m && "border-primary")} aria-hidden>
                          {method === m && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </span>
                      </button>
                    ))}
                  </div>
                  {problem && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      {problem}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={pay}
                    disabled={paying || !method}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {paying ? <BrandMark animated tight className="h-4 w-4" /> : `Pay ${money(data.amount)}`}
                  </button>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" aria-hidden />
                    You&apos;ll finish on a secure payment page
                  </p>
                </>
              )}
            </>
          )}
          <p className="mt-10 text-center text-xs text-muted-foreground lg:text-left">Powered by {brand.name}</p>
        </div>
      </section>
    </div>
  );
}
