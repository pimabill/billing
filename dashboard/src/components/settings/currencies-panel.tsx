"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currenciesApi, type CurrencySettings } from "@/lib/api/currencies";
import { useCan } from "@/lib/permissions";

const rateText = (n: number | null, reporting: string) =>
  n === null ? "No rate" : `1 = ${n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 2 })} ${reporting}`;

/** Reporting currency, the currencies in use with today's rates, and the organisation's own currencies. */
export function CurrenciesPanel() {
  const canManageOrg = useCan("org.manage");
  const canWrite = useCan("billing.write");
  const [data, setData] = useState<CurrencySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", symbol: "", decimals: "2", perUsd: "" });

  const load = useCallback(() => currenciesApi.settings().then(setData, (e: Error) => toast.error(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="h-64 animate-shimmer rounded-lg" />;
  const choices = [...data.custom.map((c) => ({ code: c.code, name: c.name })), ...data.iso];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Reporting currency</CardTitle>
          <CardDescription>
            Analytics and the overview add up every currency in this one, at the exchange rate of the day each payment was made. Balances, prices and invoices always stay in their own currency.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={data.reportingCurrency} disabled={!canManageOrg || busy} onValueChange={(v) => run(() => currenciesApi.setReporting(v), `Reports are now in ${v}`)}>
            <SelectTrigger className="w-72" aria-label="Reporting currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {choices.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {data.ratesAsOf ? `Exchange rates updated daily; latest ${new Date(data.ratesAsOf).toLocaleDateString()}.` : "Exchange rates load within a day of the first start."}
          </p>
        </CardContent>
      </Card>

      {data.inUse.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Currencies you use</CardTitle>
            <CardDescription>On your customers, prices or invoices, with today&apos;s rate into {data.reportingCurrency}.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {data.inUse.map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="w-14 font-mono font-medium">{c.code}</span>
                    <span className="text-muted-foreground">{c.name}</span>
                    {c.custom && <Badge variant="secondary">Yours</Badge>}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{c.code === data.reportingCurrency ? "Reporting currency" : rateText(c.perReporting, data.reportingCurrency)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your own currencies</CardTitle>
          <CardDescription>
            Bill in something that is not an ISO currency: loyalty points, credits, a stablecoin or vouchers. Give a rate (units per US dollar) to include it in reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.custom.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {data.custom.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-medium">{c.code}</span>
                    <span>{c.name}</span>
                    {c.symbol && <span className="text-muted-foreground">({c.symbol})</span>}
                  </span>
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <span>{c.decimals} decimal{c.decimals === 1 ? "" : "s"}</span>
                    <span>{c.perUsd ? `${c.perUsd.toLocaleString()} per USD` : "Not converted"}</span>
                    {canWrite && (
                      <Button variant="ghost" size="sm" aria-label={`Remove ${c.code}`} disabled={busy} onClick={() => run(() => currenciesApi.remove(c.code), `${c.code} removed`)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <form
              className="grid gap-3 sm:grid-cols-[7rem_1fr_6rem_6rem_9rem_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  () =>
                    currenciesApi.create({
                      code: form.code,
                      name: form.name,
                      ...(form.symbol && { symbol: form.symbol }),
                      decimals: Number(form.decimals),
                      ...(form.perUsd && { perUsd: Number(form.perUsd) }),
                    }),
                  `${form.code.toUpperCase()} added`,
                ).then(() => setForm({ code: "", name: "", symbol: "", decimals: "2", perUsd: "" }));
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="cur-code">Code</Label>
                <Input id="cur-code" placeholder="PTS" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required maxLength={10} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cur-name">Name</Label>
                <Input id="cur-name" placeholder="Loyalty points" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cur-symbol">Symbol</Label>
                <Input id="cur-symbol" placeholder="pts" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} maxLength={8} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cur-dec">Decimals</Label>
                <Input id="cur-dec" type="number" min={0} max={8} value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cur-rate">Per US dollar</Label>
                <Input id="cur-rate" type="number" min={0} step="any" placeholder="Optional" value={form.perUsd} onChange={(e) => setForm({ ...form, perUsd: e.target.value })} />
              </div>
              <Button type="submit" disabled={busy}>
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                Add
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
