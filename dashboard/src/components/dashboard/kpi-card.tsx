"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

interface KPICardProps {
  title: string;
  value: string;
  /** Percent change against last month; hidden when there is none to show. */
  change?: number | null;
  /** A line under the value instead of the change. */
  hint?: string;
  icon: React.ReactNode;
  isLoading?: boolean;
}

export function KPICard({
  title,
  value,
  change,
  hint,
  icon,
  isLoading,
}: KPICardProps) {
  const isPositive = (change ?? 0) >= 0;
  // A 0% change says nothing, usually that there was no last month to compare with.
  const showChange = typeof change === "number" && Number.isFinite(change) && change !== 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-shimmer h-24 rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums animate-count-up">{value}</p>
            {!showChange && hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
            {showChange && (
            <div className="mt-2 flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span
                className={cn(
                  "text-sm font-medium",
                  isPositive ? "text-green-600" : "text-red-600",
                )}
              >
                {isPositive ? "+" : ""}
                {change!.toFixed(1)}%
              </span>
              <span className="text-sm text-muted-foreground">
                vs last month
              </span>
            </div>
            )}
          </div>
          <div className="rounded-lg bg-accent p-3">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
