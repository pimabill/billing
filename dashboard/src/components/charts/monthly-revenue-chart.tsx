"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";

export interface MonthlyRevenue {
  /** "2026-10" */
  date: string;
  revenue: number;
}

const monthLabel = (ym: string, style: "short" | "long" = "short") => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: style, ...(style === "long" && { year: "numeric" }) });
};

/** Collected revenue per month, in USD (the API converts each currency). The current month is highlighted. */
export function MonthlyRevenueChart({ data, title = "Revenue", height = 260 }: { data: MonthlyRevenue[]; title?: string; height?: number }) {
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const current = data.at(-1)?.revenue ?? 0;
  const previous = data.at(-2)?.revenue ?? 0;
  const change = previous > 0 ? ((current - previous) / previous) * 100 : null;
  const rows = data.map((d, i) => ({ ...d, label: monthLabel(d.date), current: i === data.length - 1 }));
  const empty = total === 0;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>Last six months, in USD</CardDescription>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(current, "USD")}</p>
          <p className="text-xs text-muted-foreground">
            this month
            {change !== null && (
              <span className={change >= 0 ? "ml-1 text-green-600" : "ml-1 text-red-600"}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}%
              </span>
            )}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground" style={{ height }}>
            Paid invoices show here, month by month.
          </div>
        ) : (
          // An explicit full-width box: in a grid, ResponsiveContainer can otherwise measure before layout settles.
          <div className="w-full min-w-0" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%" debounce={50}>
            <BarChart data={rows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatCurrency(v, "USD", { abbreviated: true })} />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-md">
                      <p className="font-medium">{monthLabel(payload[0].payload.date, "long")}</p>
                      <p className="tabular-nums text-muted-foreground">{formatCurrency(payload[0].value as number, "USD")}</p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={56} fill="var(--primary)" fillOpacity={0.85} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
