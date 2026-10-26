"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient, apiFetch } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils/currency";
import type { Customer, Plan } from "@/types";

type What = "once" | "plan";
type How = "link" | "paid";

interface Result {
  invoiceId: string | null;
  url: string | null;
  summary: string;
  email: string;
  note?: string;
}

const today = (days = 0) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Charge a customer: a one-time amount or a plan, paid through a link you
 * send them (or recorded as already paid). One place for what used to take an
 * invoice, a checkout and a subscription on three pages.
 */
export function ChargeDialog({ open, onOpenChange, customer: preset, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; customer?: Customer | null; onDone?: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [what, setWhat] = useState<What>("once");
  const [how, setHow] = useState<How>("link");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [planId, setPlanId] = useState("");
  const [trialDays, setTrialDays] = useState("");
  const [method, setMethod] = useState("mobile_money");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    if (preset) setCustomerId(preset.id);
    apiClient.customers.list({ limit: 100 } as never).then((r: any) => setCustomers(r.data ?? r), () => setCustomers([]));
    apiClient.plans.list().then((p) => setPlans(p.filter((x: any) => x.isActive !== false)), () => setPlans([]));
  }, [open, preset]);

  const customer = useMemo(() => customers.find((c) => c.id === customerId) ?? (preset?.id === customerId ? preset : undefined), [customers, customerId, preset]);
  const plan = plans.find((p) => p.id === planId);
  const planCurrencies = plan?.prices.map((p) => p.currency) ?? [];

  // Default the currency to the customer's, and to one the plan is priced in.
  useEffect(() => {
    if (what === "once" && customer?.currency) setCurrency(customer.currency);
    if (what === "plan" && plan) setCurrency(planCurrencies.includes(customer?.currency ?? "") ? customer!.currency : (planCurrencies[0] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [what, customer?.id, planId]);

  const reset = () => {
    setDescription("");
    setAmount("");
    setPlanId("");
    setTrialDays("");
    setResult(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return toast.error("Choose a customer");
    setBusy(true);
    try {
      if (what === "once") {
        const value = Number(amount);
        if (!(value > 0)) throw new Error("Enter an amount above zero");
        const invoice = await apiFetch<any>("/invoices", {
          method: "POST",
          body: JSON.stringify({
            customerId: customer.id,
            currency,
            items: [{ description: description || "Payment", quantity: 1, unitAmount: value }],
            dueDate: today(7),
            ...(how === "link" && { checkout: { callbackUrl: window.location.origin } }),
          }),
        });
        if (how === "paid") await apiClient.invoices.markPaid(invoice.id, method);
        setResult({
          invoiceId: invoice.id,
          url: invoice.checkout?.checkoutUrl ?? null,
          summary: `${formatCurrency(value, currency)} for ${description || "a payment"}`,
          email: customer.email,
          note: how === "paid" ? "Recorded as paid." : undefined,
        });
      } else {
        if (!plan) throw new Error("Choose a plan");
        const sub = await apiClient.subscriptions.create({ customerId: customer.id, planId: plan.id, currency, trialDays: Number(trialDays) || 0 } as never);
        const price = plan.prices.find((p) => p.currency === currency);
        const summary = `${plan.name}${price ? `, ${formatCurrency(price.amount, currency)} / ${plan.interval}` : ""}`;
        if (Number(trialDays) > 0) {
          setResult({ invoiceId: null, url: null, summary, email: customer.email, note: `Subscribed with a ${trialDays}-day trial. The first invoice goes out when the trial ends.` });
        } else {
          // The first invoice is created in the background; wait briefly for it, then make its payment link.
          let invoiceId: string | null = null;
          for (let i = 0; i < 10 && !invoiceId; i++) {
            const list = await apiFetch<any>(`/invoices?subscriptionId=${encodeURIComponent(sub.id)}&limit=1`).catch(() => null);
            invoiceId = (list?.data ?? list ?? [])[0]?.id ?? null;
            if (!invoiceId) await sleep(1500);
          }
          let url: string | null = null;
          if (invoiceId && how === "link") url = (await apiClient.invoices.checkout(invoiceId, window.location.origin).catch(() => null))?.checkoutUrl ?? null;
          if (invoiceId && how === "paid") await apiClient.invoices.markPaid(invoiceId, method);
          setResult({
            invoiceId,
            url,
            summary,
            email: customer.email,
            note: !invoiceId ? "Subscribed. The first invoice is still being prepared: find it under Invoices in a minute." : how === "paid" ? "Subscribed, and the first invoice is recorded as paid." : undefined,
          });
        }
      }
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not charge the customer");
    } finally {
      setBusy(false);
    }
  };

  const emailLink = async () => {
    if (!result?.invoiceId) return;
    try {
      await apiClient.invoices.sendEmail(result.invoiceId);
      toast.success(`Sent to ${result.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the email");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? "Charge created" : "Charge a customer"}</DialogTitle>
          <DialogDescription>{result ? result.summary : "A one-time amount, or a plan they pay every period."}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            {result.note && <p className="text-sm text-muted-foreground">{result.note}</p>}
            {result.url && (
              <div className="space-y-2">
                <Label>Payment link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={result.url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                  <Button type="button" variant="outline" size="icon" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(result.url!).then(() => toast.success("Copied"))}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" aria-label="Open link" onClick={() => window.open(result.url!, "_blank", "noopener,noreferrer")}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Send it any way you like: WhatsApp, SMS or email. The invoice is marked paid as soon as the payment is confirmed.</p>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              {result.invoiceId && result.url && (
                <Button type="button" variant="outline" onClick={emailLink}>
                  <Mail className="mr-2 h-4 w-4" aria-hidden />
                  Email it to {result.email}
                </Button>
              )}
              <Button type="button" onClick={() => reset()}>
                <Check className="mr-2 h-4 w-4" aria-hidden />
                Charge someone else
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="charge-customer">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger id="charge-customer">
                  <SelectValue placeholder={customers.length ? "Choose a customer" : "No customers yet"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(preset && !customers.some((c) => c.id === preset.id) ? [preset, ...customers] : customers).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || c.email} <span className="text-muted-foreground">· {c.email}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs value={what} onValueChange={(v) => setWhat(v as What)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="once">One-time amount</TabsTrigger>
                <TabsTrigger value="plan">A plan</TabsTrigger>
              </TabsList>
            </Tabs>

            {what === "once" ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem_6rem]">
                <div className="space-y-2">
                  <Label htmlFor="charge-desc">For</Label>
                  <Input id="charge-desc" placeholder="Installation fee" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="charge-amount">Amount</Label>
                  <Input id="charge-amount" type="number" min={0} step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="charge-currency">Currency</Label>
                  <Input id="charge-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={10} required />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_7rem_6rem]">
                <div className="space-y-2">
                  <Label htmlFor="charge-plan">Plan</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger id="charge-plan">
                      <SelectValue placeholder={plans.length ? "Choose a plan" : "No plans yet"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="charge-plan-currency">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency} disabled={!plan}>
                    <SelectTrigger id="charge-plan-currency">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {planCurrencies.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="charge-trial">Trial days</Label>
                  <Input id="charge-trial" type="number" min={0} placeholder="0" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>How they pay</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["link", "Send a payment link", "Card or mobile money, through your providers"],
                    ["paid", "Already paid", "Cash, bank transfer or elsewhere: record it"],
                  ] as const
                ).map(([value, title, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHow(value)}
                    aria-pressed={how === value}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${how === value ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <span className="block font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
              {how === "paid" && (
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger aria-label="Paid by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mobile_money">Mobile money</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" isLoading={busy} disabled={!customerId}>
                {what === "once" ? (how === "link" ? "Create payment link" : "Record payment") : "Subscribe"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
