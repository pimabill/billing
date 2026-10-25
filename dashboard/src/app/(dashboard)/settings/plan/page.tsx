"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrandMark } from "@/components/brand-mark";
import { useCan } from "@/lib/permissions";
import { planApi, type CloudPlanOption, type PlanStatus } from "@/lib/api/plan";

const usageLabels: [keyof PlanStatus["usage"], string][] = [
  ["customers", "Customers"],
  ["activeSubscriptions", "Active subscriptions"],
  ["invoicesPerMonth", "Invoices this month"],
  ["teamMembers", "Team members"],
];

const money = (amount: string, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: Number(amount) % 1 ? 2 : 0 }).format(Number(amount));
  } catch {
    return `${Number(amount).toLocaleString()} ${currency}`;
  }
};
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

/** Your organisation's plan on the hosted cloud: limits, usage, upgrading and paying. */
export default function PlanPageRoute() {
  return (
    <Suspense fallback={<div className="animate-shimmer h-96 rounded-lg" />}>
      <PlanPage />
    </Suspense>
  );
}

function PlanPage() {
  const params = useSearchParams();
  const canManage = useCan("org.manage");
  const [data, setData] = useState<PlanStatus | null>(null);
  const [currency, setCurrency] = useState("UGX");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (afterCheckout = false) => {
    try {
      const status = afterCheckout ? await planApi.sync() : await planApi.status();
      setData(status);
      if (afterCheckout) {
        if (status.plan.tier === "growth") toast.success(`You are on ${status.plan.name}. Thank you!`);
        else toast.message("Payment not confirmed yet: it can take a minute. This page updates when it arrives.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load your plan");
    }
  }, []);

  useEffect(() => {
    load(params.get("checkout") === "done");
  }, [load, params]);

  // After checkout, look again for a while: the payment may still be confirming.
  useEffect(() => {
    if (params.get("checkout") !== "done" || data?.plan.tier === "growth") return;
    const timer = setInterval(() => load(true), 15_000);
    const stop = setTimeout(() => clearInterval(timer), 3 * 60_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [params, data?.plan.tier, load]);

  if (!data) return <div className="animate-shimmer h-96 rounded-lg" />;
  if (!data.enabled) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">This is a self-hosted deployment: there are no plans or limits.</CardContent>
      </Card>
    );
  }

  const upgrade = async (plan: CloudPlanOption) => {
    setBusy(plan.code);
    try {
      const { url } = await planApi.checkout(plan.code, currency);
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy("cancel");
    try {
      setData(await planApi.cancel());
      toast.success("Your plan ends at the end of the period you paid for; you then return to Free.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(null);
    }
  };

  const limits = (data.plan.limits ?? {}) as Record<string, number | undefined>;
  const currencies = [...new Set(data.plans.flatMap((p) => p.prices.map((x) => x.currency)))];
  const onGrowth = data.plan.tier === "growth";
  const partner = data.plan.tier === "partner";
  const enterprise = data.plan.tier === "enterprise";
  const sub = data.subscription;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plan</h1>
        <p className="text-sm text-muted-foreground">What your organisation is on, what it uses, and moving to a bigger plan.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data.plan.name ?? "No plan"}
            {data.plan.status === "past_due" && <Badge variant="warning">Payment due</Badge>}
            {sub?.cancelAt && <Badge variant="outline">Ends {date(sub.cancelAt)}</Badge>}
          </CardTitle>
          <CardDescription>
            {partner
              ? "A partner organisation: no limits and nothing to pay."
              : enterprise
                ? "Enterprise: no limits, on terms agreed with you and invoiced to you directly."
                : onGrowth && sub?.paidThrough
                ? `Paid through ${date(sub.paidThrough)}.`
                : "Free for as long as you stay within these limits. Upgrade any time."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {usageLabels.map(([key, label]) => {
            const max = limits[key];
            const used = data.usage[key];
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums text-muted-foreground">{max !== undefined ? `${used.toLocaleString()} of ${max.toLocaleString()}` : `${used.toLocaleString()} · unlimited`}</span>
                </div>
                {max !== undefined && <Progress value={Math.min(100, (100 * used) / Math.max(max, 1))} aria-label={`${label}: ${used} of ${max}`} />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {sub?.openInvoice && canManage && (
        <Card className="border-amber-300">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>
              An invoice of {money(sub.openInvoice.amount, sub.openInvoice.currency)} for {data.plans.find((p) => p.code === sub.plan)?.name ?? "your plan"} is waiting to be paid.
            </span>
            <Button size="sm" disabled={busy !== null} onClick={() => upgrade(data.plans.find((p) => p.code === sub.plan)!)}>
              {busy === sub.plan && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              Pay now
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Plans</h2>
        {currencies.length > 1 && (
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-32" aria-label="Currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => {
          const price = p.prices.find((x) => x.currency === currency) ?? p.prices[0];
          const current = data.plan.code === p.code;
          const features = Array.isArray(p.features) ? (p.features as string[]) : [];
          return (
            <Card key={p.code} className={current ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {p.name}
                  {current && <Badge variant="success">Current</Badge>}
                </CardTitle>
                <div className="text-2xl font-bold tabular-nums">
                  {price ? (Number(price.amount) === 0 ? "Free" : money(price.amount, price.currency)) : "—"}
                  {price && Number(price.amount) > 0 && <span className="text-sm font-normal text-muted-foreground"> / {p.interval === "YEARLY" ? "year" : "month"}</span>}
                </div>
                {p.description && <CardDescription>{p.description}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-1.5 text-sm">
                  {features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                {p.tier === "growth" && !current && !partner && !enterprise && canManage && (
                  <Button className="w-full" disabled={busy !== null} onClick={() => upgrade(p)}>
                    {busy === p.code ? <BrandMark animated tight className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}
                    Upgrade, pay with card or mobile money
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
        <Card className={enterprise ? "border-primary" : undefined}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Enterprise
              {enterprise && <Badge variant="success">Current</Badge>}
            </CardTitle>
            <div className="text-2xl font-bold">Let&apos;s talk</div>
            <CardDescription>For large or multi-entity billing, priced for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1.5 text-sm">
              {["No limits", "Every feature, including managed payments", "Negotiated managed payments fee", "Service level agreement", "A named account manager"].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            {!enterprise && data.enterpriseContact && (
              <Button asChild variant="outline" className="w-full">
                <a href={`mailto:${data.enterpriseContact}?subject=${encodeURIComponent("Enterprise plan")}`}>Talk to us</a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {onGrowth && canManage && !sub?.cancelAt && (
        <p className="text-sm text-muted-foreground">
          Want to stop?{" "}
          <button type="button" className="underline" disabled={busy !== null} onClick={cancel}>
            Return to Free at the end of the paid period
          </button>
          .
        </p>
      )}
    </div>
  );
}
