"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moneyApi, type BalancesOverview, type CurrencyBalance } from "@/lib/api/money";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

/** How many currencies show before "Show all". */
const FIRST = 4;

const money = (value: string | null, currency: string) => (value === null ? "—" : formatCurrency(Number(value), currency));

/**
 * One balance per currency, as Flutterwave shows them: what can be paid out
 * now, what is still pending, and where each is held. Hidden when nothing
 * connected reports a balance.
 */
export function Balances() {
  const [data, setData] = useState<BalancesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await moneyApi.balances());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <div className="animate-shimmer h-28 rounded-lg" />;
  if (failed && !data) return null;
  if (!data || (!data.currencies.length && !data.unavailable.length)) return null;

  const shown = showAll ? data.currencies : data.currencies.slice(0, FIRST);
  const current = data.currencies.find((c) => c.currency === selected) ?? null;

  return (
    <section aria-labelledby="balances-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="balances-title" className="text-sm font-semibold">Balances</h2>
          <p className="text-xs text-muted-foreground">Checked {formatDateTime(data.checkedAt)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {data.currencies.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((c) => (
            <BalanceCard key={c.currency} balance={c} active={c.currency === selected} onSelect={() => setSelected(c.currency === selected ? null : c.currency)} />
          ))}
        </div>
      )}

      {data.currencies.length > FIRST && (
        <Button variant="link" size="sm" className="px-0" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${data.currencies.length} currencies`}
        </Button>
      )}

      {current && <Breakdown balance={current} />}

      {data.unavailable.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not included, as {data.unavailable.length === 1 ? "it" : "they"} could not be reached just now: {data.unavailable.map((u) => u.name).join(", ")}.
        </p>
      )}
    </section>
  );
}

function BalanceCard({ balance, active, onSelect }: { balance: CurrencyBalance; active: boolean; onSelect: () => void }) {
  const pending = Number(balance.pending) > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={active}
      className={cn(
        "rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide">{balance.currency}</span>
        <span className="text-xs text-muted-foreground">
          {balance.sources.length === 1 ? balance.sources[0].name : `${balance.sources.length} sources`}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Available balance</p>
      <p className="truncate text-xl font-semibold tabular-nums tracking-tight">{money(balance.available, balance.currency)}</p>
      <p className={cn("mt-1 text-xs tabular-nums", pending ? "text-foreground" : "text-muted-foreground")}>
        Pending {money(balance.pending, balance.currency)}
      </p>
    </button>
  );
}

function Breakdown({ balance }: { balance: CurrencyBalance }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2.5 text-sm font-medium">Where your {balance.currency} is held</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Source</th>
              <th className="px-4 py-2 text-right font-medium">Available</th>
              <th className="px-4 py-2 text-right font-medium">Pending</th>
            </tr>
          </thead>
          <tbody>
            {balance.sources.map((s) => (
              <tr key={s.provider} className="border-t">
                <td className="px-4 py-2">{s.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(s.available, balance.currency)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{money(s.pending, balance.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        Pending money was collected recently and becomes available after the payout hold. A dash means the provider does not report pending money.
      </p>
    </div>
  );
}
