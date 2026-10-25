"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  CreditCard,
  DollarSign,
  Gem,
  KeyRound,
  Package,
  Receipt,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Webhook,
} from "lucide-react";
import { KPICard } from "@/components/dashboard/kpi-card";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api/client";
import { moneyApi, type ManagedAccount } from "@/lib/api/money";
import { planApi, type PlanStatus } from "@/lib/api/plan";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/date";
import type { ActivityEvent, PaymentProvider, RevenueData } from "@/types";

interface Overview {
  orgName: string;
  kpis: any;
  revenue: RevenueData[];
  activity: ActivityEvent[];
  providers: PaymentProvider[];
  managed: { available: boolean; account: ManagedAccount | null } | null;
  plan: PlanStatus | null;
  plansCount: number;
  apiKeys: number;
  webhookUrl: string | null;
  arpu: number;
  churnRate: string;
}

const unwrap = (j: any) => j?.data?.data ?? j?.data ?? j;

const managedLabel: Record<ManagedAccount["status"], { text: string; variant: "success" | "warning" | "error" | "secondary" }> = {
  active: { text: "Active", variant: "success" },
  pending_review: { text: "In review", variant: "warning" },
  rejected: { text: "Not approved", variant: "error" },
  suspended: { text: "Suspended", variant: "error" },
};

const usageRows: [keyof PlanStatus["usage"], string][] = [
  ["customers", "Customers"],
  ["activeSubscriptions", "Active subscriptions"],
  ["invoicesPerMonth", "Invoices this month"],
  ["teamMembers", "Team members"],
];

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    (async () => {
      const soft = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
      const [profile, kpis, revenue, activity, providers, managed, plan, plans, keys, customers, subscriptions] = await Promise.all([
        soft(apiClient.tenant.getProfile(), null),
        soft(apiClient.analytics.getKPIs(), null),
        soft(apiClient.analytics.getRevenueData(), []),
        soft(apiClient.activity.list(8), []),
        soft(apiClient.providers.list(), []),
        soft(moneyApi.managedStatus(), null),
        soft(planApi.status(), null),
        soft(apiClient.plans.list(), []),
        soft(fetch("/api/proxy/tenants/me/api-keys", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])), []),
        soft(fetch("/api/proxy/analytics/customers", { credentials: "include" }).then((r) => r.json()), {}),
        soft(fetch("/api/proxy/analytics/subscriptions", { credentials: "include" }).then((r) => r.json()), {}),
      ]);
      const p = unwrap(profile) ?? {};
      setData({
        orgName: p.name ?? "",
        kpis,
        revenue,
        activity,
        providers,
        managed,
        plan,
        plansCount: plans.length,
        apiKeys: (unwrap(keys) as unknown[])?.length ?? 0,
        webhookUrl: p.webhookUrl ?? null,
        arpu: Number(unwrap(customers)?.arpu) || 0,
        churnRate: unwrap(subscriptions)?.churnRate || "0.00%",
      });
    })();
  }, []);

  const isLoading = !data;
  const kpis = data?.kpis;
  const ownProviders = data?.providers.filter((p) => p.isConfigured && p.isActive) ?? [];
  const managed = data?.managed?.account ?? null;
  const canTakePayments = ownProviders.length > 0 || managed?.status === "active";

  const steps = data
    ? [
        {
          done: canTakePayments,
          title: "Take payments",
          text: "Connect your own provider, or apply for managed payments and use ours.",
          href: data.managed?.available ? "/money?tab=managed" : "/providers",
          icon: CreditCard,
        },
        { done: data.plansCount > 0, title: "Create a plan", text: "What you sell, its prices and billing interval.", href: "/plans", icon: Package },
        { done: (kpis?.totalCustomers ?? 0) > 0, title: "Add a customer", text: "From the dashboard, or with the API.", href: "/customers", icon: UserPlus },
        { done: data.apiKeys > 0, title: "Create an API key", text: "To connect your app.", href: "/settings", icon: KeyRound },
        { done: Boolean(data.webhookUrl), title: "Receive webhooks", text: "Hear about payments and renewals as they happen.", href: "/settings", icon: Webhook },
      ]
    : [];
  const doneCount = steps.filter((s) => s.done).length;

  const plan = data?.plan?.enabled ? data.plan : null;
  const limits = (plan?.plan.limits ?? {}) as Record<string, number | undefined>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Overview</h1>
          <p className="text-muted-foreground">{data?.orgName ? `${data.orgName} at a glance.` : "Your billing at a glance."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/customers">
              <UserPlus className="mr-2 h-4 w-4" aria-hidden />
              Add customer
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/money">
              <ArrowDownLeft className="mr-2 h-4 w-4" aria-hidden />
              Collect a payment
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/invoices">
              <Receipt className="mr-2 h-4 w-4" aria-hidden />
              Invoices
            </Link>
          </Button>
        </div>
      </div>

      {data && doneCount < steps.length && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Get set up</CardTitle>
                <CardDescription>
                  {doneCount} of {steps.length} done
                </CardDescription>
              </div>
              <Progress value={(100 * doneCount) / steps.length} className="w-40" aria-label={`${doneCount} of ${steps.length} steps done`} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className={`group rounded-lg border p-3 transition-colors hover:bg-muted/50 ${s.done ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {s.done ? <Check className="h-4 w-4 text-green-600" aria-label="Done" /> : <s.icon className="h-4 w-4 text-primary" aria-hidden />}
                  {s.title}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.text}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Monthly recurring revenue (USD)"
          value={kpis ? formatCurrency(kpis.mrr, "USD", { abbreviated: true }) : "$0"}
          change={kpis?.mrrChange || 0}
          icon={<DollarSign className="h-6 w-6 text-primary" />}
          isLoading={isLoading}
        />
        <KPICard
          title="Active subscriptions"
          value={kpis?.activeSubscriptions?.toString() || "0"}
          change={kpis?.subscriptionChange || 0}
          icon={<Receipt className="h-6 w-6 text-primary" />}
          isLoading={isLoading}
        />
        <KPICard
          title="Customers"
          value={kpis?.totalCustomers?.toString() || "0"}
          change={kpis?.customerChange || 0}
          icon={<Users className="h-6 w-6 text-primary" />}
          isLoading={isLoading}
        />
        <KPICard
          title="Payment success rate"
          value={kpis ? `${Number(kpis.successRate || 0).toFixed(1)}%` : "0%"}
          change={kpis?.successRateChange || 0}
          icon={<TrendingUp className="h-6 w-6 text-primary" />}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={data?.revenue ?? []} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {data?.managed?.available && (
                <div className="flex items-center justify-between gap-2">
                  <span>Managed payments</span>
                  {managed ? (
                    <span className="flex items-center gap-2">
                      {managed.status === "active" && managed.fee && <span className="text-xs text-muted-foreground">{managed.fee.value}% fee</span>}
                      <Badge variant={managedLabel[managed.status].variant}>{managedLabel[managed.status].text}</Badge>
                    </span>
                  ) : (
                    <Link href="/money?tab=managed" className="flex items-center gap-1 text-primary hover:underline">
                      Apply <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span>Your providers</span>
                {ownProviders.length ? (
                  <span className="truncate text-muted-foreground">{ownProviders.map((p) => p.name).join(", ")}</span>
                ) : (
                  <Link href="/providers" className="flex items-center gap-1 text-primary hover:underline">
                    Connect <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <span>Average revenue per customer</span>
                <span className="font-medium tabular-nums">{formatCurrency(data?.arpu ?? 0, "USD")}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Churn rate</span>
                <span className="font-medium tabular-nums">{data?.churnRate ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          {plan && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <Gem className="h-4 w-4 text-primary" aria-hidden />
                    {plan.plan.name ?? "Plan"}
                  </span>
                  <Link href="/settings/plan" className="text-sm font-normal text-primary hover:underline">
                    {plan.plan.tier === "free" ? "Upgrade" : "Manage"}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {usageRows.map(([key, label]) => {
                  const max = limits[key];
                  const used = plan.usage[key] ?? 0;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {max !== undefined ? `${used.toLocaleString()} / ${max.toLocaleString()}` : `${used.toLocaleString()} · unlimited`}
                        </span>
                      </div>
                      {max !== undefined && <Progress value={Math.min(100, (100 * used) / Math.max(max, 1))} className="h-1.5" aria-label={`${label}: ${used} of ${max}`} />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {data && data.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. Activity shows here as customers subscribe and pay.</p>
          ) : (
            <ul className="divide-y">
              {(data?.activity ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{a.description}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
