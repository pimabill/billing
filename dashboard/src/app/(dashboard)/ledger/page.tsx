"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ledgerApi, type LedgerAccount, type LedgerCheck, type LedgerEntry } from "@/lib/api/ledger";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/date";

const checkLabels: Record<string, string> = {
  zero_sum_per_currency: "Debits equal credits in every currency",
  entries_balanced: "Every journal entry balances",
  cached_balances_match_lines: "Account balances match their entries",
  wallet_balances_match_ledger: "Wallet balances match the ledger",
};

const typeOrder: LedgerAccount["type"][] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
const typeLabels: Record<LedgerAccount["type"], string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expenses",
};

/**
 * Balances are stored debit-positive. Show them the way accountants read
 * them: liabilities, equity and revenue as positive credit balances.
 */
function natural(account: LedgerAccount): number {
  const value = Number(account.balance);
  return account.type === "ASSET" || account.type === "EXPENSE" ? value : -value;
}

export default function LedgerPage() {
  const canWrite = useCan("billing.write");
  const [accounts, setAccounts] = useState<LedgerAccount[] | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [health, setHealth] = useState<{ balanced: boolean; checkedAt: string; checks: LedgerCheck[] } | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, e, h] = await Promise.all([ledgerApi.accounts(), ledgerApi.entries(page), ledgerApi.health()]);
      setAccounts(a);
      setEntries(e.data);
      setTotalPages(Math.max(1, e.meta.totalPages));
      setHealth(h);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the ledger");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await ledgerApi.sync();
      if (result.error) toast.error(result.error);
      else toast.success(`Ledger synced: ${result.projection?.posted ?? 0} new entries`);
      await load();
    } finally {
      setSyncing(false);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">{error}</CardContent>
      </Card>
    );
  }
  if (!accounts || !health) return <div className="animate-shimmer h-96 rounded-lg" />;

  const currencies = [...new Set(accounts.map((a) => a.currency))].sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Double-entry record of invoices, payments, wallets, collections and payouts. Updated every 10 minutes.
          </p>
        </div>
        {canWrite && (
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Integrity</CardTitle>
            <CardDescription>Checked {formatRelativeTime(health.checkedAt)}</CardDescription>
          </div>
          <Badge variant={health.balanced ? "success" : "error"}>{health.balanced ? "In balance" : "Out of balance"}</Badge>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {health.checks.map((check) => (
            <div key={check.name} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span>{checkLabels[check.name] ?? check.name}</span>
              <Badge variant={check.ok ? "success" : check.informational ? "warning" : "error"}>
                {check.ok ? "OK" : `${check.details.length} to review`}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No entries yet. Activity from the last two minutes appears on the next sync.
          </CardContent>
        </Card>
      ) : (
        currencies.map((currency) => (
          <Card key={currency}>
            <CardHeader>
              <CardTitle className="text-base">Balances · {currency}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {typeOrder.map((type) => {
                const rows = accounts.filter((a) => a.currency === currency && a.type === type && Number(a.balance) !== 0);
                if (rows.length === 0) return null;
                return (
                  <div key={type}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{typeLabels[type]}</p>
                    <div className="space-y-1 text-sm">
                      {rows.map((a) => (
                        <div key={a.id} className="flex justify-between gap-3">
                          <span className="truncate" title={a.code}>
                            {a.name}
                          </span>
                          <span className="tabular-nums whitespace-nowrap">{formatCurrency(natural(a), currency, { showSymbol: false })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journal</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Date</th>
                <th className="text-left font-medium px-4 py-2">Entry</th>
                <th className="text-left font-medium px-4 py-2">Account</th>
                <th className="text-right font-medium px-4 py-2">Debit</th>
                <th className="text-right font-medium px-4 py-2">Credit</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) =>
                entry.lines.map((line, i) => {
                  const amount = Number(line.amount);
                  return (
                    <tr key={line.id} className={i === 0 ? "border-t" : ""}>
                      <td className="px-4 py-1.5 whitespace-nowrap align-top">{i === 0 ? formatDateTime(entry.effectiveAt) : ""}</td>
                      <td className="px-4 py-1.5 align-top">{i === 0 ? entry.description : ""}</td>
                      <td className={`px-4 py-1.5 ${amount < 0 ? "pl-10" : ""}`}>{line.account.name}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        {amount > 0 ? formatCurrency(amount, line.currency, { showSymbol: false }) : ""}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        {amount < 0 ? formatCurrency(-amount, line.currency, { showSymbol: false }) : ""}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
          {entries.length === 0 && <p className="px-4 py-2.5 text-sm text-muted-foreground">No journal entries yet.</p>}
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 p-4 border-t text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Newer
            </Button>
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Older
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
