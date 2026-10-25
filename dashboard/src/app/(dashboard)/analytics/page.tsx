"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { MonthlyRevenueChart } from "@/components/charts/monthly-revenue-chart";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiClient } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils/currency";
import { format } from "date-fns";
import { Download, Users, CreditCard, DollarSign, Activity, Info } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { brand } from "@/lib/brand";

const COLORS = ["#3b82f6", "#a855f7", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

/** Small info icon with a tooltip explaining the metric. */
function MetricTooltip({ text }: { text: string }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More information about this metric"
          className="inline-flex items-center justify-center h-3.5 w-3.5 ml-1 text-muted-foreground cursor-help align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full"
        >
          <Info
            className="h-3.5 w-3.5"
            aria-hidden="true"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-wrap">{text}</TooltipContent>
    </UITooltip>
  );
}

export default function AnalyticsPage() {
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<{
    arpu: number;
    arr: number;
    mrr: number;
    churnRate: string;
    successRate: string;
    totalRevenue: number;
    totalCustomers: number;
    trialingCount: number;
    totalSubscriptions: number;
    activePlansCount: number;
  } | null>(null);
  const [planDistribution, setPlanDistribution] = useState<
    { name: string; value: number; color: string }[]
  >([]);
  const [mrrBreakdown, setMrrBreakdown] = useState<{
    totalMrr: number;
    newMrr: number;
    expansionMrr: number;
    contractionMrr: number;
    churnMrr: number;
    netNewMrr: number;
    byPlan: Array<{ planId: string; planName: string; mrr: number; subscriptionCount: number }>;
  } | null>(null);
  const [netRevenue, setNetRevenue] = useState<{
    grossRevenue: number;
    refunds: number;
    creditNotes: number;
    netRevenue: number;
  } | null>(null);
  const [cohorts, setCohorts] = useState<{
    months: string[];
    cohorts: Array<{ month: string; totalCustomers: number; retentionPercentages: number[] }>;
  } | null>(null);
  const [ltv, setLtv] = useState<{
    avgLtv: number;
    avgLifespanDays: number;
    byPlan: Array<{ planId: string; planName: string; avgLtv: number; avgLifespanDays: number }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [
        revenue,
        kpis,
        subs,
        plans,
        subAnalytics,
        mrrData,
        netRevData,
        cohortData,
        ltvData,
      ] = await Promise.all([
        apiClient.analytics.getRevenueData(),
        apiClient.analytics.getKPIs(),
        apiClient.subscriptions.list({ limit: 100 }),
        apiClient.plans.list(),
        fetch("/api/proxy/analytics/subscriptions", { credentials: "include" }).then((r) => r.json()),
        apiClient.analytics.getMrrBreakdown().catch(() => null),
        apiClient.analytics.getNetRevenue().catch(() => null),
        apiClient.analytics.getChurnCohorts(12).catch(() => null),
        apiClient.analytics.getLtv().catch(() => null),
      ]);

      setRevenueData(
        revenue.map((item) => ({
          ...item,
          month: format(new Date(item.date), "MMM"),
        })),
      );

      const subData = subAnalytics.data?.data || subAnalytics.data || subAnalytics;

      // Build plan distribution from subscription list
      const planMap = new Map<string, string>();
      plans.forEach((p) => planMap.set(p.id, p.name));
      const planCounts: Record<string, number> = {};
      (subs.data || []).forEach((s) => {
        const planName = s.planName || planMap.get(s.planId) || "Unknown";
        planCounts[planName] = (planCounts[planName] || 0) + 1;
      });
      const totalSubs = subs.data?.length || 1;
      setPlanDistribution(
        Object.entries(planCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count], idx) => ({
            name,
            value: Math.round((count / totalSubs) * 100),
            color: COLORS[idx % COLORS.length],
          })),
      );

      if (mrrData) setMrrBreakdown(mrrData);
      if (netRevData) setNetRevenue(netRevData);
      if (cohortData) setCohorts(cohortData);
      if (ltvData) setLtv(ltvData);

      // Use backend-aggregated KPIs for accuracy – avoids counting only the first
      // 100 subscriptions for metrics like distinct active plans.
      const activePlansCount = mrrData
        ? mrrData.byPlan.length
        : Number(subData.active) > 0
          ? Object.keys(planCounts).length
          : 0;

      setMetrics({
        arpu: kpis.arpu,
        arr: kpis.arr,
        mrr: kpis.mrr,
        churnRate: kpis.churnRate,
        successRate: kpis.successRate ? `${kpis.successRate.toFixed(2)}%` : "0.00%",
        totalRevenue: kpis.mrr * 12, // fallback; net revenue widget is more accurate
        totalCustomers: kpis.totalCustomers,
        trialingCount: Number(subData.trialing) || 0,
        totalSubscriptions: kpis.totalSubscriptions,
        activePlansCount,
      });
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const successRate = metrics ? parseFloat(metrics.successRate) : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-shimmer rounded" />
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-96 animate-shimmer rounded" />
          ))}
        </div>
      </div>
    );
  }

  const usd = (n: number) => formatCurrency(n, "USD");
  const usdShort = (n: number) => formatCurrency(n, "USD", { abbreviated: true });
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
  const exportCsv = () => {
    if (!revenueData.length) return;
    const header = "Month,Revenue,MRR,One-Time\n";
    const rows = revenueData.map((r) => `${r.month || r.date},${r.revenue},${r.mrr},${r.oneTime}`).join("\n");
    const url = URL.createObjectURL(new Blob([header + rows], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brand.fileSlug}-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false } as const;
  const moneyTooltip = (label: (p: any) => string) =>
    function MoneyTooltip({ active, payload }: any) {
      if (!active || !payload?.length) return null;
      return (
        <div className="rounded-lg border bg-card p-2 text-sm shadow-md">
          <p className="font-medium">{label(payload[0].payload)}</p>
          <p className="text-muted-foreground">{usd(payload[0].value as number)}</p>
        </div>
      );
    };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Amounts in USD, converted from each currency you bill in.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">
            <DollarSign className="mr-1.5 h-4 w-4" aria-hidden />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="subscriptions">
            <Activity className="mr-1.5 h-4 w-4" aria-hidden />
            Subscriptions
          </TabsTrigger>
          <TabsTrigger value="customers">
            <Users className="mr-1.5 h-4 w-4" aria-hidden />
            Customers
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="mr-1.5 h-4 w-4" aria-hidden />
            Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4 space-y-4">
          <StatStrip
            items={[
              { label: "MRR", value: usd(mrrBreakdown?.totalMrr ?? metrics?.mrr ?? 0), hint: "Monthly recurring revenue: every active subscription, as a monthly amount." },
              { label: "ARR", value: usd((mrrBreakdown?.totalMrr ?? metrics?.mrr ?? 0) * 12), hint: "Annual recurring revenue: MRR × 12." },
              {
                label: "Net new MRR",
                value: mrrBreakdown ? signed(mrrBreakdown.netNewMrr) : "—",
                tone: mrrBreakdown ? (mrrBreakdown.netNewMrr >= 0 ? "up" : "down") : undefined,
                hint: "This month: new + expansion − contraction − churn.",
              },
              {
                label: "Net revenue",
                value: netRevenue ? usd(netRevenue.netRevenue) : "—",
                sub: netRevenue ? `${usdShort(netRevenue.grossRevenue)} gross · −${usdShort(netRevenue.refunds)} refunds · −${usdShort(netRevenue.creditNotes)} credit notes` : undefined,
                hint: "Paid invoices minus refunds and credit notes.",
              },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MonthlyRevenueChart data={revenueData} />
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">MRR movement this month</CardTitle>
              </CardHeader>
              <CardContent>
                {mrrBreakdown ? (
                  <dl className="divide-y text-sm">
                    {[
                      ["New", mrrBreakdown.newMrr, "Subscriptions started this month."],
                      ["Expansion", mrrBreakdown.expansionMrr, "Customers moving to a higher-priced plan."],
                      ["Contraction", -mrrBreakdown.contractionMrr, "Customers moving to a lower-priced plan."],
                      ["Churn", -mrrBreakdown.churnMrr, "Subscriptions canceled this month."],
                    ].map(([label, value, hint]) => (
                      <div key={label as string} className="flex items-center justify-between py-2.5">
                        <dt className="text-muted-foreground">
                          {label as string}
                          <MetricTooltip text={hint as string} />
                        </dt>
                        <dd className={`font-medium tabular-nums ${(value as number) > 0 ? "text-green-600" : (value as number) < 0 ? "text-red-600" : ""}`}>{signed(value as number)}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2.5 font-semibold">
                      <dt>Net</dt>
                      <dd className="tabular-nums">{signed(mrrBreakdown.netNewMrr)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4 space-y-4">
          <StatStrip
            items={[
              { label: "All subscriptions", value: String(metrics?.totalSubscriptions ?? 0), hint: "Every subscription ever created, in any status." },
              { label: "Trialing", value: String(metrics?.trialingCount ?? 0), hint: "On a free trial before their first paid period." },
              { label: "Churn rate", value: metrics?.churnRate ?? "0%", hint: "Canceled subscriptions out of all subscriptions. Lower is better." },
              { label: "Plans with subscribers", value: String(metrics?.activePlansCount ?? 0), hint: "Plans with at least one active subscription." },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">MRR by plan</CardTitle>
              </CardHeader>
              <CardContent>
                {mrrBreakdown && mrrBreakdown.byPlan.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={mrrBreakdown.byPlan}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="planName" {...axis} />
                      <YAxis {...axis} width={60} tickFormatter={usdShort} />
                      <Tooltip content={moneyTooltip((p) => `${p.planName} · ${p.subscriptionCount} subscription${p.subscriptionCount === 1 ? "" : "s"}`)} />
                      <Bar dataKey="mrr" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No active subscriptions yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Share of subscriptions by plan</CardTitle>
              </CardHeader>
              <CardContent>
                {planDistribution.length > 0 ? (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <ResponsiveContainer width="100%" height={220} className="sm:max-w-[220px]">
                      <PieChart>
                        <Pie data={planDistribution} dataKey="value" innerRadius={55} outerRadius={90} paddingAngle={2}>
                          {planDistribution.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => `${v}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="w-full space-y-1.5 text-sm">
                      {planDistribution.map((p) => (
                        <li key={p.name} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                            <span className="truncate">{p.name}</span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">{p.value}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
          {cohorts && cohorts.cohorts.some((c) => c.totalCustomers > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Retention by sign-up month</CardTitle>
                <CardDescription>Share of each month&apos;s new customers still subscribed, month by month.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">Cohort</th>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">Customers</th>
                      {cohorts.months.map((m, i) => (
                        <th key={m} className="px-2 py-1 text-center font-medium text-muted-foreground">
                          M{i}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.cohorts
                      .filter((c) => c.totalCustomers > 0)
                      .map((cohort) => (
                        <tr key={cohort.month} className="border-t border-border">
                          <td className="px-2 py-1 font-medium">{cohort.month}</td>
                          <td className="px-2 py-1 text-muted-foreground">{cohort.totalCustomers}</td>
                          {cohort.retentionPercentages.map((pct, i) => (
                            <td
                              key={i}
                              className="px-2 py-1 text-center font-medium"
                              style={{ backgroundColor: `color-mix(in srgb, var(--primary) ${Math.round(Math.max(8, pct) * 0.85)}%, transparent)`, color: pct > 55 ? "var(--primary-foreground)" : undefined }}
                            >
                              {pct.toFixed(0)}%
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="customers" className="mt-4 space-y-4">
          <StatStrip
            items={[
              { label: "Customers", value: String(metrics?.totalCustomers ?? 0), hint: "Every customer account, whatever its status." },
              { label: "Revenue per customer", value: usd(metrics?.arpu ?? 0), hint: "All revenue divided by the number of customers." },
              { label: "Average lifetime value", value: ltv ? usd(ltv.avgLtv) : "—", hint: "What a customer pays over all their subscriptions." },
              { label: "Average lifespan", value: ltv ? `${ltv.avgLifespanDays} days` : "—", hint: "From a customer's first subscription to cancellation, or today." },
            ]}
          />
          {ltv && ltv.byPlan.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Lifetime value by plan</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {ltv.byPlan.map((p) => (
                    <li key={p.planId} className="flex items-center justify-between py-2.5">
                      <span className="font-medium">{p.planName}</span>
                      <span className="tabular-nums">
                        {usd(p.avgLtv)}
                        <span className="ml-2 text-xs text-muted-foreground">{p.avgLifespanDays} days</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Payment success rate
                  <MetricTooltip text="Successful payments out of all attempts. Aim for 90% or more." />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative flex items-center justify-center">
                  <svg className="h-40 w-40" viewBox="0 0 100 100" aria-hidden>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--muted)" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={successRate >= 90 ? "#16a34a" : successRate >= 70 ? "#d97706" : "#dc2626"}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${successRate * 2.64} 264`}
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <span className="absolute text-3xl font-bold tabular-nums">{successRate.toFixed(1)}%</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{successRate >= 90 ? "Healthy" : successRate >= 70 ? "Fair" : "Needs attention"}</p>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Keeping payments healthy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Failed renewals are retried automatically and the customer gets a link to pay. A rate under 90% usually means a provider key has expired or a payment method is not set up for a currency.</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/payments">See payments</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/providers">Check providers</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface StatItem {
  label: string;
  value: string;
  hint?: string;
  sub?: string;
  tone?: "up" | "down";
}

/** One row of headline numbers, in a single bordered strip rather than a card each. */
function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {i.label}
            {i.hint && <MetricTooltip text={i.hint} />}
          </p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${i.tone === "up" ? "text-green-600" : i.tone === "down" ? "text-red-600" : ""}`}>{i.value}</p>
          {i.sub && <p className="mt-1 text-xs text-muted-foreground">{i.sub}</p>}
        </div>
      ))}
    </div>
  );
}
