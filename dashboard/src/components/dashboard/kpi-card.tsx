"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

interface KPICardProps {
  title: string;
  value: string;
  /** Percent change against last month; hidden when there is none to show. */
  change?: number | null;
  /** A line under the value instead of the change. */
  hint?: string;
  isLoading?: boolean;
}

export function KPICard({ title, value, change, hint, isLoading }: KPICardProps) {
  // A 0% change says nothing, usually that there was no last month to compare with.
  const showChange = typeof change === "number" && Number.isFinite(change) && change !== 0;

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[13px] text-muted-foreground">{title}</p>
        {isLoading ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            {showChange && (
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  change! > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                )}
              >
                {change! > 0 ? "+" : ""}
                {change!.toFixed(1)}%
              </span>
            )}
          </div>
        )}
        {!isLoading && !showChange && hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
