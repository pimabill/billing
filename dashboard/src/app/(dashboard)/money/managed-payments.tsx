"use client";

import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brand } from "@/lib/brand";
import { moneyApi, type ManagedAccount, type ManagedPayoutType, type OpenManagedAccount } from "@/lib/api/money";
import { apiClient } from "@/lib/api/client";
import { BrandMark } from "@/components/brand-mark";

const statusText: Record<ManagedAccount["status"], { label: string; variant: "success" | "warning" | "error"; hint: string }> = {
  pending_review: { label: "In review", variant: "warning", hint: "We are checking your business and payout details. Checkout links start working once it is approved." },
  active: { label: "Active", variant: "success", hint: "Checkouts for your invoices and subscriptions use managed payments whenever none of your own providers can take the payment." },
  rejected: { label: "Not approved", variant: "error", hint: "Contact support to find out what is needed." },
  suspended: { label: "Suspended", variant: "error", hint: "New payments are paused. Contact support." },
};

const empty = { businessName: "", email: "", phone: "", country: "UG", currency: "UGX", msisdn: "", mobileName: "", paypalEmail: "", bankCode: "", accountNumber: "", accountName: "" };

type PayoutChoice = ManagedPayoutType | "keep";

const payoutTypes: { value: ManagedPayoutType; label: string }[] = [
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank", label: "Bank account" },
  { value: "paypal", label: "PayPal" },
];

/**
 * Managed payments: for accounts without their own Flutterwave or other
 * provider account. The platform collects through its own provider accounts,
 * keeps the fee, and pays the rest out to the destination given here (or,
 * where the provider supports it, settles each payment to the bank directly).
 */
export function ManagedPayments({ onChanged }: { onChanged: () => void }) {
  const [state, setState] = useState<{ available: boolean; account: ManagedAccount | null } | null>(null);
  const [form, setForm] = useState(empty);
  const [payoutType, setPayoutType] = useState<PayoutChoice>("mobile_money");
  const [editing, setEditing] = useState(false);
  const [moreDetails, setMoreDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const canManage = useCan("settings.providers");

  const load = useCallback(async () => {
    try {
      const status = await moneyApi.managedStatus();
      setState(status);
      // Applying: start from what the organisation already told us.
      if (!status.account && status.available) {
        const org = await apiClient.tenant.getProfile().catch(() => null);
        if (org) {
          setForm((f) => ({
            ...f,
            businessName: f.businessName || org.name || "",
            email: f.email || org.email || "",
            country: (org.settings?.country as string) || f.country,
            mobileName: f.mobileName || (org.settings?.ownerName as string) || "",
          }));
        }
      }
    } catch {
      setState({ available: false, account: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!state) return <div className="animate-shimmer h-40 rounded-lg" />;
  if (!state.available || (!state.account && !canManage)) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {state.available
            ? "Managed payments let you take payments without a provider account of your own. Ask an owner or admin of this organisation to apply."
            : `Managed payments are part of the ${brand.name} cloud plans; they are not available on self-hosted deployments or without a cloud plan.`}
        </CardContent>
      </Card>
    );
  }

  const set = (key: keyof typeof empty, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key: keyof typeof empty, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`managed-${key}`}>{label}</Label>
      <Input id={`managed-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  const destination = (): Pick<OpenManagedAccount, "bank" | "payoutDestination"> => {
    if (payoutType === "keep") return {};
    if (payoutType === "mobile_money") {
      return { payoutDestination: { type: "mobile_money", msisdn: form.msisdn.replace(/[\s+]/g, ""), name: form.mobileName || undefined } };
    }
    if (payoutType === "paypal") return { payoutDestination: { type: "paypal", email: form.paypalEmail } };
    const accountName = form.accountName || undefined;
    return {
      bank: { code: form.bankCode, accountNumber: form.accountNumber, accountName },
      payoutDestination: { type: "bank", bankCode: form.bankCode, accountNumber: form.accountNumber, accountName },
    };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await moneyApi.openManaged({
        businessName: form.businessName,
        email: form.email,
        phone: form.phone,
        country: form.country.toUpperCase(),
        currency: form.currency.toUpperCase(),
        ...destination(),
      });
      toast.success("Managed payments requested");
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open managed payments");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (a: ManagedAccount) => {
    setForm({ ...empty, email: a.email ?? "", phone: a.phone ?? "" });
    setPayoutType("keep");
    setEditing(true);
  };

  const saveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { payoutDestination } = destination();
      await moneyApi.updateManaged({ email: form.email || undefined, phone: form.phone || undefined, ...(payoutDestination && { payoutDestination }) });
      toast.success("Managed payments details saved");
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the details");
    } finally {
      setSaving(false);
    }
  };

  const payoutFields = (allowKeep: boolean) => (
    <>
      <fieldset className="space-y-1.5 sm:col-span-2">
        <legend className="text-sm font-medium">Pay out to</legend>
        <div className="flex flex-wrap gap-2">
          {[...(allowKeep ? [{ value: "keep" as const, label: "Keep current" }] : []), ...payoutTypes].map((t) => (
            <Button key={t.value} type="button" size="sm" variant={payoutType === t.value ? "default" : "outline"} aria-pressed={payoutType === t.value} onClick={() => setPayoutType(t.value)}>
              {t.label}
            </Button>
          ))}
        </div>
      </fieldset>
      {payoutType === "mobile_money" && (
        <>
          {field("msisdn", "Mobile money number", { placeholder: "256771234567", inputMode: "tel", required: true })}
          {field("mobileName", "Name on the mobile money account (optional)")}
        </>
      )}
      {payoutType === "paypal" && field("paypalEmail", "PayPal email", { type: "email", required: true })}
      {payoutType === "bank" && (
        <>
          {field("bankCode", "Bank code", { placeholder: "From Flutterwave's bank list", required: true })}
          {field("accountNumber", "Bank account number", { required: true })}
          {field("accountName", "Name on the account", { required: true })}
        </>
      )}
    </>
  );

  const account = state.account;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Managed payments
          {account && <Badge variant={statusText[account.status].variant}>{statusText[account.status].label}</Badge>}
        </CardTitle>
        <CardDescription>
          No Flutterwave or other provider account? Take every kind of payment (invoices, subscriptions, payment links and one-time
          collections) by card, mobile money or PayPal through {brand.name}. We collect for you, keep the platform fee and the
          provider&apos;s processing fee, and pay the rest out to your mobile money, bank or PayPal account. Included with the cloud plans.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {account && editing ? (
          <form onSubmit={saveChanges} className="grid gap-4 sm:grid-cols-2">
            {field("email", "Finance email", { type: "email", required: true })}
            {field("phone", "Business phone", { placeholder: "+256…", required: true })}
            {payoutFields(true)}
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
                Save details
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Changes apply to payouts from now on and are recorded by {brand.name}.</p>
          </form>
        ) : account ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Business</dt>
              <dd>{account.businessName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{account.settlement === "direct" ? "Settles to" : "Paid out to"}</dt>
              <dd>
                {account.settlement === "direct" || !account.payoutDestination
                  ? `${account.bankName ?? "Bank"} ···${account.accountNumberLast4 ?? "—"}`
                  : account.payoutDestination}{" "}
                in {account.currency}
              </dd>
            </div>
            {account.fee && (
              <div>
                <dt className="text-muted-foreground">Platform fee</dt>
                <dd>{account.fee.type === "percentage" ? `${account.fee.value}% per payment` : `${account.fee.value} ${account.currency} per payment`}, plus the payment provider&apos;s fee</dd>
              </div>
            )}
            {(account.email || account.phone) && (
              <div>
                <dt className="text-muted-foreground">Contact</dt>
                <dd>{[account.email, account.phone].filter(Boolean).join(" · ")}</dd>
              </div>
            )}
            <p className="text-muted-foreground sm:col-span-2">{account.reason ?? statusText[account.status].hint}</p>
            {canManage && (
              <div className="sm:col-span-2">
                <Button size="sm" variant="outline" onClick={() => startEditing(account)}>
                  Edit details
                </Button>
              </div>
            )}
          </dl>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md bg-muted/50 p-3 text-sm sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Applying as <strong>{form.businessName || "your organisation"}</strong>
                  {form.email && <span className="text-muted-foreground"> · {form.email}</span>}
                  <span className="text-muted-foreground"> · {form.country.toUpperCase()} · paid in {form.currency.toUpperCase()}</span>
                </span>
                <button type="button" className="text-xs underline" onClick={() => setMoreDetails((v) => !v)}>
                  {moreDetails ? "Hide details" : "Edit details"}
                </button>
              </div>
            </div>
            {moreDetails && (
              <>
                {field("businessName", "Registered business name", { required: true })}
                {field("email", "Finance email", { type: "email", required: true })}
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  {field("country", "Country (2 letters)", { maxLength: 2, required: true })}
                  {field("currency", "Payout currency", { maxLength: 3, required: true })}
                </div>
              </>
            )}
            {field("phone", "Business phone", { placeholder: "+256…", inputMode: "tel", required: true })}
            {payoutFields(false)}
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>
                {saving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
                Request managed payments
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Usually reviewed within a day. Once approved, invoices, subscriptions and payment links can be paid by card, mobile money or
              PayPal through {brand.name}, and the money is paid out to you, less the fee shown here.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
