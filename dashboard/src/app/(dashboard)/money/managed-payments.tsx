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
import { BrandMark } from "@/components/brand-mark";

const statusText: Record<ManagedAccount["status"], { label: string; variant: "success" | "warning" | "error"; hint: string }> = {
  pending_review: { label: "In review", variant: "warning", hint: "We are checking your business and payout details. Checkout links start working once it is approved." },
  active: { label: "Active", variant: "success", hint: "Checkout links fall back to managed payments whenever none of your own providers can take the payment." },
  rejected: { label: "Not approved", variant: "error", hint: "Contact support to find out what is needed." },
  suspended: { label: "Suspended", variant: "error", hint: "New payments are paused. Contact support." },
};

const empty = { businessName: "", email: "", phone: "", country: "UG", currency: "UGX", msisdn: "", paypalEmail: "", bankCode: "", accountNumber: "", accountName: "" };

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
  const [payoutType, setPayoutType] = useState<ManagedPayoutType>("mobile_money");
  const [saving, setSaving] = useState(false);
  const canManage = useCan("settings.providers");

  const load = useCallback(async () => {
    try {
      setState(await moneyApi.managedStatus());
    } catch {
      setState({ available: false, account: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Without an account the card is only the onboarding form.
  if (!state?.available || (!state.account && !canManage)) return null;

  const set = (key: keyof typeof empty, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key: keyof typeof empty, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`managed-${key}`}>{label}</Label>
      <Input id={`managed-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  const destination = (): Pick<OpenManagedAccount, "bank" | "payoutDestination"> => {
    if (payoutType === "mobile_money") return { payoutDestination: { type: "mobile_money", msisdn: form.msisdn.replace(/[\s+]/g, "") } };
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

  const account = state.account;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Managed payments
          {account && <Badge variant={statusText[account.status].variant}>{statusText[account.status].label}</Badge>}
        </CardTitle>
        <CardDescription>
          No Flutterwave or other provider account? Take card, mobile money and PayPal payments through {brand.name}. We collect
          on your behalf, keep the platform fee and the provider&apos;s processing fee, and pay the rest out to your mobile money, bank or PayPal account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {account ? (
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
            <p className="text-muted-foreground sm:col-span-2">{account.reason ?? statusText[account.status].hint}</p>
          </dl>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            {field("businessName", "Registered business name", { required: true })}
            {field("email", "Finance email", { type: "email", required: true })}
            {field("phone", "Business phone", { placeholder: "+256…", required: true })}
            <div className="grid grid-cols-2 gap-3">
              {field("country", "Country", { maxLength: 2, required: true })}
              {field("currency", "Settlement currency", { maxLength: 3, required: true })}
            </div>
            <fieldset className="space-y-1.5 sm:col-span-2">
              <legend className="text-sm font-medium">Pay out to</legend>
              <div className="flex flex-wrap gap-2">
                {payoutTypes.map((t) => (
                  <Button key={t.value} type="button" size="sm" variant={payoutType === t.value ? "default" : "outline"} aria-pressed={payoutType === t.value} onClick={() => setPayoutType(t.value)}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </fieldset>
            {payoutType === "mobile_money" && field("msisdn", "Mobile money number", { placeholder: "256771234567", inputMode: "tel", required: true })}
            {payoutType === "paypal" && field("paypalEmail", "PayPal email", { type: "email", required: true })}
            {payoutType === "bank" && (
              <>
                {field("bankCode", "Bank code", { placeholder: "From Flutterwave's bank list", required: true })}
                {field("accountNumber", "Bank account number", { required: true })}
                {field("accountName", "Name on the account", { required: true })}
              </>
            )}
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>
                {saving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
                Request managed payments
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Your details are reviewed before payments start. The fee is shown here once approved and is taken from each payment
              before it is paid out to you.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
