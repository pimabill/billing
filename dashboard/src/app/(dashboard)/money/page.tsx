"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api/client";
import {
  describeCommission,
  describeParty,
  moneyApi,
  railLabels,
  statusLabels,
  type MoneyIntent,
  type MoneySettings,
  type MoneyStatus,
  type MoneyType,
  type Party,
  type ProviderCapabilities,
} from "@/lib/api/money";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { CryptoDeposits } from "./crypto-deposits";
import { ManagedPayments } from "./managed-payments";
import type { Wallet } from "@/types";
import { BrandMark } from "@/components/brand-mark";

const AUTO = "auto";
const ALL = "all";

const statusVariant: Record<MoneyStatus, "success" | "warning" | "error" | "default" | "outline"> = {
  succeeded: "success",
  processing: "default",
  pending: "default",
  requires_approval: "warning",
  stuck: "warning",
  failed: "error",
  canceled: "outline",
};

export default function MoneyPage() {
  const [settings, setSettings] = useState<MoneySettings | null>(null);
  const [providers, setProviders] = useState<ProviderCapabilities[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canConfigure = useCan("settings.providers");

  const loadCapabilities = useCallback(async () => {
    try {
      const [caps, walletList] = await Promise.all([moneyApi.capabilities(), apiClient.wallets.list({ status: "ACTIVE", limit: 100 })]);
      setSettings(caps.settings);
      setProviders(caps.providers);
      setWallets(walletList.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load money settings");
    }
  }, []);

  useEffect(() => {
    loadCapabilities();
  }, [loadCapabilities]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">{error}</CardContent>
      </Card>
    );
  }
  if (!settings) return <div className="animate-shimmer h-96 rounded-lg" />;
  // Links can open a tab directly, e.g. /money?tab=managed.
  const initialTab = (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab")) || "collections";
  const watchesChain = providers.some((p) => ["tron_usdt", "eth_usdt", "bsc_usdt", "btc"].includes(p.provider));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Money movement</h1>
        <p className="text-sm text-muted-foreground">
          Collect one-time payments, send payouts and move money between wallets.
        </p>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          {watchesChain && <TabsTrigger value="deposits">Crypto deposits</TabsTrigger>}
          <TabsTrigger value="managed">Managed payments</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="collections" className="mt-4">
          <IntentList type="collection" enabled={settings.collections} providers={providers} wallets={wallets} onEnable={canConfigure ? () => toggle("collections", true) : undefined} />
        </TabsContent>
        <TabsContent value="payouts" className="mt-4">
          <IntentList type="payout" enabled={settings.payouts} providers={providers} wallets={wallets} />
        </TabsContent>
        <TabsContent value="transfers" className="mt-4">
          <IntentList type="transfer" enabled={settings.transfers} providers={providers} wallets={wallets} onEnable={canConfigure ? () => toggle("transfers", true) : undefined} />
        </TabsContent>
        {watchesChain && (
          <TabsContent value="deposits" className="mt-4">
            <CryptoDeposits />
          </TabsContent>
        )}
        <TabsContent value="settings" className="mt-4">
          <SettingsPanel settings={settings} providers={providers} onSaved={setSettings} />
        </TabsContent>
        <TabsContent value="managed" className="mt-4">
          <ManagedPayments onChanged={loadCapabilities} />
        </TabsContent>
      </Tabs>
    </div>
  );

  async function toggle(feature: "collections" | "transfers", value: boolean) {
    try {
      setSettings(await moneyApi.updateSettings({ [feature]: value }));
      toast.success(`${feature === "collections" ? "Collections" : "Transfers"} turned ${value ? "on" : "off"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update settings");
    }
  }
}

// --- Lists ---

const copy: Record<MoneyType, { title: string; empty: string; off: string; icon: React.ElementType; create: string }> = {
  collection: {
    title: "Collections",
    empty: "No collections yet. Request a mobile money payment or send a checkout link.",
    off: "Collections let you take one-time payments that are not tied to an invoice: a mobile money PIN prompt or a checkout link for card, bank or mobile money.",
    icon: ArrowDownLeft,
    create: "New collection",
  },
  payout: {
    title: "Payouts",
    empty: "No payouts yet.",
    off: "Payouts send money to mobile money numbers, bank accounts, PayPal or Yo accounts. They are switched on by the platform operator after a review of your account.",
    icon: ArrowUpRight,
    create: "New payout",
  },
  transfer: {
    title: "Transfers",
    empty: "No transfers yet.",
    off: "Transfers move balance between two customer wallets in the same currency.",
    icon: ArrowLeftRight,
    create: "New transfer",
  },
};

function IntentList({
  type,
  enabled,
  providers,
  wallets,
  onEnable,
}: {
  type: MoneyType;
  enabled: boolean;
  providers: ProviderCapabilities[];
  wallets: Wallet[];
  onEnable?: () => void;
}) {
  const [rows, setRows] = useState<MoneyIntent[] | null>(null);
  const [status, setStatus] = useState(ALL);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const text = copy[type];
  const canMove = useCan("money.move");
  const canApprove = useCan("money.approve");

  const load = useCallback(() => {
    moneyApi
      .list(type, { status: status === ALL ? undefined : status })
      .then((r) => setRows(r.data))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load"));
  }, [type, status]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  if (!enabled) {
    return (
      <Card>
        <CardContent className="p-8 flex flex-col items-start gap-3 max-w-2xl">
          <text.icon className="h-6 w-6 text-muted-foreground" />
          <p className="font-semibold">{text.title} are off for this account</p>
          <p className="text-sm text-muted-foreground">{text.off}</p>
          {onEnable && <Button onClick={onEnable}>Turn on {text.title.toLowerCase()}</Button>}
        </CardContent>
      </Card>
    );
  }

  const act = async (id: string, action: () => Promise<MoneyIntent>, done: string) => {
    setBusy(id);
    try {
      const updated = await action();
      toast.success(`${done}: ${statusLabels[updated.status]}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const walletName = (id: string | null) => {
    if (!id) return null;
    const w = wallets.find((x) => x.id === id);
    return w ? `${w.name || "Wallet"} · ${w.customer?.name || w.customer?.email || w.customerId}` : id;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">{text.title}</CardTitle>
        <div className="flex gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {(Object.keys(statusLabels) as MoneyStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canMove && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {text.create}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {!rows ? (
          <div className="animate-shimmer h-40" />
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{text.empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Created</th>
                <th className="text-left font-medium px-4 py-2">{type === "collection" ? "From" : type === "payout" ? "To" : "Wallets"}</th>
                <th className="text-right font-medium px-4 py-2">Amount</th>
                <th className="text-left font-medium px-4 py-2">Via</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="text-right font-medium px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(r.createdAt)}
                    {r.reference && <p className="text-xs text-muted-foreground font-mono">{r.reference}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {type === "transfer" ? (
                      <>
                        <p>{walletName(r.walletId)}</p>
                        <p className="text-xs text-muted-foreground">→ {walletName(r.toWalletId)}</p>
                      </>
                    ) : (
                      <>
                        <p>{describeParty(r.party)}</p>
                        {r.walletId && (
                          <p className="text-xs text-muted-foreground">
                            {type === "collection" ? "Credits" : "From"} {walletName(r.walletId)}
                          </p>
                        )}
                        {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {formatCurrency(Number(r.amount), r.currency)}
                    {r.fee && <p className="text-xs text-muted-foreground">fee {formatCurrency(Number(r.fee), r.currency)}</p>}
                    {r.commission && (
                      <p className="text-xs text-muted-foreground">
                        commission {formatCurrency(Number(r.commission), r.currency)}
                        {r.commissionChargeTo === "payer" ? " (paid by payer)" : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="capitalize">{r.provider ?? "Internal"}</p>
                    <p className="text-xs text-muted-foreground">{railLabels[r.rail] ?? r.rail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[r.status]}>{statusLabels[r.status]}</Badge>
                    {r.failureReason && (r.status === "failed" || r.status === "stuck") && (
                      <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">{r.failureReason}</p>
                    )}
                    {r.approvedBy && <p className="mt-1 text-xs text-muted-foreground">Approved by {r.approvedBy}</p>}
                    {r.paymentDetails && (r.status === "processing" || r.status === "stuck") && (
                      <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                        Send {r.paymentDetails.amount} {r.paymentDetails.coin} on {r.paymentDetails.chain} to{" "}
                        <span className="font-mono break-all select-all text-foreground">{r.paymentDetails.address}</span>
                        {r.paymentDetails.memo && <> (memo <span className="font-mono select-all">{r.paymentDetails.memo}</span>)</>}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                    {r.paymentUrl && r.status === "processing" && (
                      <a href={r.paymentUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          Checkout link <ExternalLink className="ml-1 h-3 w-3" />
                        </Button>
                      </a>
                    )}
                    {r.status === "requires_approval" && (
                      <>
                        {canApprove && (
                          <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, () => moneyApi.approve(r.id), "Approved")}>
                            Approve
                          </Button>
                        )}
                        {canMove && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === r.id}
                            onClick={() => act(r.id, () => moneyApi.cancel(type, r.id), "Canceled")}
                          >
                            Cancel
                          </Button>
                        )}
                      </>
                    )}
                    {(r.status === "processing" || r.status === "stuck") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === r.id}
                        onClick={() => act(r.id, () => moneyApi.refresh(type, r.id), "Checked")}
                        title="Check status with the provider"
                      >
                        <RefreshCw className={`h-4 w-4 ${busy === r.id ? "animate-spin" : ""}`} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      {creating && (
        <CreateDialog
          type={type}
          providers={providers}
          wallets={wallets}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

// --- Create ---

const partyTypes: Record<"collection" | "payout", { value: Party["type"]; label: string }[]> = {
  collection: [
    { value: "mobile_money", label: "Mobile money prompt" },
    { value: "hosted", label: "Checkout link (card, bank, mobile money)" },
    { value: "paypal", label: "PayPal" },
    { value: "crypto", label: "Crypto (checkout link or stablecoin address)" },
  ],
  payout: [
    { value: "mobile_money", label: "Mobile money" },
    { value: "bank", label: "Bank account" },
    { value: "yo_account", label: "Yo! Payments account" },
  ],
};

function CreateDialog({
  type,
  providers,
  wallets,
  onClose,
  onCreated,
}: {
  type: MoneyType;
  providers: ProviderCapabilities[];
  wallets: Wallet[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    currency: "UGX",
    partyType: "mobile_money",
    provider: AUTO,
    walletId: "none",
    toWalletId: "",
    fromWalletId: "",
  });
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const kind = type === "collection" ? "collect" : "payout";
  const capable = useMemo(
    () => (type === "transfer" ? [] : providers.filter((p) => p.capabilities[kind].includes(form.partyType))),
    [providers, type, kind, form.partyType],
  );
  const verifier = capable.find((p) => (form.provider === AUTO ? true : p.provider === form.provider) && p.capabilities.verifyPayee);
  const currencyWallets = wallets.filter((w) => w.currency === form.currency.toUpperCase());

  const party = (): Party => {
    const name = form.name || undefined;
    switch (form.partyType) {
      case "mobile_money":
        return { type: "mobile_money", msisdn: form.msisdn ?? "", network: form.network || undefined, name };
      case "bank":
        return {
          type: "bank",
          accountNumber: form.accountNumber ?? "",
          accountName: form.accountName ?? "",
          bankCode: form.bankCode || undefined,
          bankName: form.bankName || undefined,
          country: form.country ? form.country.toUpperCase() : undefined,
          phone: form.phone || undefined,
          transferType: form.transferType || undefined,
        };
      case "yo_account":
        return { type: "yo_account", accountNumber: form.accountNumber ?? "", email: form.email ?? "", name };
      case "paypal":
        return { type: "paypal", email: form.email ?? "", name };
      case "crypto":
        return { type: "crypto", email: form.email || undefined, name, payCurrency: form.payCurrency || undefined, chain: form.chain || undefined };
      default:
        return { type: "hosted", email: form.email ?? "", name };
    }
  };

  const sendOtp = async () => {
    try {
      const { pinId } = await moneyApi.requestOtp(form.provider, form.msisdn ?? "");
      set("otpPinId", pinId);
      toast.success("Code sent to the payer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the code");
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const common = {
        amount: form.amount,
        description: form.description || undefined,
        reference: form.reference || undefined,
      };
      let created: MoneyIntent;
      if (type === "transfer") {
        created = await moneyApi.createTransfer({ ...common, fromWalletId: form.fromWalletId, toWalletId: form.toWalletId });
      } else {
        const body = {
          ...common,
          currency: form.currency.toUpperCase(),
          provider: form.provider === AUTO ? undefined : form.provider,
          walletId: form.walletId === "none" ? undefined : form.walletId,
        };
        const otp = form.otpPinId && form.otpPin ? { pinId: form.otpPinId, pin: form.otpPin } : undefined;
        created =
          type === "collection"
            ? await moneyApi.createCollection({ ...body, payer: party(), returnUrl: form.returnUrl || undefined, otp })
            : await moneyApi.createPayout({ ...body, payee: party() });
      }
      if (created.status === "failed") {
        toast.error(`${copy[type].create.replace("New ", "")} failed: ${created.failureReason ?? "rejected"}`);
      } else {
        toast.success(`${copy[type].create.replace("New ", "")} ${statusLabels[created.status].toLowerCase()}`);
        if (created.paymentUrl) {
          navigator.clipboard?.writeText(created.paymentUrl).then(() => toast.info("Checkout link copied"), () => undefined);
        } else if (created.paymentDetails) {
          navigator.clipboard?.writeText(created.paymentDetails.address).then(() => toast.info("Deposit address copied"), () => undefined);
        }
      }
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create");
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    if (!verifier) return;
    setLookup("Checking…");
    try {
      const result = await moneyApi.verifyPayee(verifier.provider, party());
      setLookup(result.valid ? `Registered to ${result.name ?? "a valid account (no name returned)"}` : "No account found for this number");
    } catch (e) {
      setLookup(e instanceof Error ? e.message : "Lookup failed");
    }
  };

  const field = (key: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`money-${key}`}>{label}</Label>
      <Input id={`money-${key}`} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy[type].create}</DialogTitle>
          <DialogDescription>
            {type === "collection" && "The payer gets a PIN prompt on their phone, or a link to pay by card, bank or mobile money."}
            {type === "payout" && "Large payouts wait for approval before anything is sent. A payout from a wallet holds the amount straight away."}
            {type === "transfer" && "Moves balance from one wallet to another immediately."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {type === "transfer" ? (
            <>
              <WalletSelect label="From wallet" value={form.fromWalletId} wallets={wallets} onChange={(v) => set("fromWalletId", v)} />
              <WalletSelect
                label="To wallet"
                value={form.toWalletId}
                wallets={wallets.filter((w) => w.id !== form.fromWalletId && (!form.fromWalletId || w.currency === wallets.find((x) => x.id === form.fromWalletId)?.currency))}
                onChange={(v) => set("toWalletId", v)}
              />
              {field("amount", "Amount", { inputMode: "decimal", placeholder: "20000" })}
            </>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_100px] gap-3">
                {field("amount", "Amount", { inputMode: "decimal", placeholder: "50000" })}
                {field("currency", "Currency", { maxLength: 3 })}
              </div>
              <div className="space-y-1.5">
                <Label>{type === "collection" ? "Collect by" : "Pay to"}</Label>
                <Select value={form.partyType} onValueChange={(v) => set("partyType", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {partyTypes[type].map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.partyType === "mobile_money" && (
                <>
                  {field("msisdn", "Phone number", { placeholder: "256771234567" })}
                  <div className="grid grid-cols-2 gap-3">
                    {field("network", "Network (optional)", { placeholder: "MTN_UGANDA" })}
                    {field("name", "Name (optional)")}
                  </div>
                  {type === "payout" && verifier && (
                    <div className="flex items-center gap-2 text-sm">
                      <Button type="button" variant="outline" size="sm" onClick={verify}>
                        Check registered name
                      </Button>
                      {lookup && <span className="text-muted-foreground">{lookup}</span>}
                    </div>
                  )}
                  {type === "collection" && form.provider === "eversend" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Button type="button" variant="outline" size="sm" disabled={!form.msisdn} onClick={sendOtp}>
                          {form.otpPinId ? "Resend code" : "Text the payer a code"}
                        </Button>
                        <span className="text-xs text-muted-foreground">Only if Eversend asks for one</span>
                      </div>
                      {form.otpPinId && field("otpPin", "Code the payer received", { inputMode: "numeric", autoComplete: "one-time-code" })}
                    </div>
                  )}
                </>
              )}
              {form.partyType === "bank" && (
                <>
                  {field("accountName", "Account name")}
                  {field("accountNumber", "Account number")}
                  <div className="grid grid-cols-2 gap-3">
                    {field("bankCode", "Bank code / identifier", { placeholder: "Provider bank code" })}
                    {field("bankName", "Bank name (optional)")}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {field("country", "Country (optional)", { placeholder: "e.g. UG, KE" })}
                    {field("phone", "Account holder phone (optional)", { placeholder: "+256…" })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Yo! Payments only pays bank accounts already registered and verified in your Yo account. Eversend needs
                    the account holder&apos;s full name, a phone number and the bank code from its bank list.
                  </p>
                </>
              )}
              {form.partyType === "yo_account" && (
                <>
                  {field("accountNumber", "Yo account number")}
                  {field("email", "Account email", { type: "email" })}
                </>
              )}
              {form.partyType === "crypto" && (
                <>
                  {["USDT", "USDC"].includes(form.currency.toUpperCase()) ? (
                    <>
                      {field("chain", "Chain (optional)", { placeholder: "TRON, ETHEREUM, BSC, or BINANCE for Binance Pay" })}
                      {field("name", "Payer name (optional)")}
                      <p className="text-xs text-muted-foreground">
                        A {form.currency.toUpperCase()} deposit address is created in your Eversend account. Share it with the payer;
                        the collection settles when the full amount arrives.
                      </p>
                    </>
                  ) : (
                    <>
                      {field("chain", "Bitcoin to your own wallet? Enter BTC (optional)", { placeholder: "BTC" })}
                      {field("payCurrency", "Coin (optional)", { placeholder: "Payer chooses, or e.g. usdttrc20, btc" })}
                      {field("email", "Payer email (optional)", { type: "email" })}
                      {field("returnUrl", "Return link after payment (optional)", { placeholder: "https://yourapp.com/thanks" })}
                      <p className="text-xs text-muted-foreground">
                        Priced in your currency; the payer pays in crypto on the processor&apos;s page and it settles to your own
                        processor account. Set the currency to USDT or USDC for a stablecoin deposit address instead.
                      </p>
                    </>
                  )}
                </>
              )}
              {(form.partyType === "hosted" || form.partyType === "paypal") && (
                <>
                  {field("email", "Payer email", { type: "email" })}
                  {field("name", "Payer name (optional)")}
                  {field("returnUrl", "Return link after payment (optional)", { placeholder: "https://yourapp.com/thanks" })}
                </>
              )}

              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={form.provider} onValueChange={(v) => set("provider", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO}>Automatic{capable[0] ? ` (${capable[0].provider})` : ""}</SelectItem>
                    {capable.map((p) => (
                      <SelectItem key={p.provider} value={p.provider}>
                        <span className="capitalize">{p.provider}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {capable.length === 0 && (
                  <p className="text-xs text-amber-600">No configured provider supports this. Add one under Providers.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>{type === "collection" ? "Credit a wallet (optional)" : "Pay from a wallet (optional)"}</Label>
                <Select value={form.walletId} onValueChange={(v) => set("walletId", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{type === "collection" ? "No wallet" : "Your provider balance"}</SelectItem>
                    {currencyWallets.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name || "Wallet"} · {w.customer?.name || w.customer?.email || w.customerId} ({formatCurrency(w.balance, w.currency)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {field("description", "Description (optional)")}
          {field("reference", "Your reference (optional)", { placeholder: "Reusing it never charges or pays twice" })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !form.amount}>
            {saving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
            {type === "collection" ? "Request payment" : type === "payout" ? "Send payout" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WalletSelect({ label, value, wallets, onChange }: { label: string; value: string; wallets: Wallet[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a wallet" />
        </SelectTrigger>
        <SelectContent>
          {wallets.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name || "Wallet"} · {w.customer?.name || w.customer?.email || w.customerId} ({formatCurrency(w.balance, w.currency)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// --- Settings ---

function SettingsPanel({
  settings,
  providers,
  onSaved,
}: {
  settings: MoneySettings;
  providers: ProviderCapabilities[];
  onSaved: (s: MoneySettings) => void;
}) {
  const [threshold, setThreshold] = useState(settings.payoutApprovalThreshold);
  const [limit, setLimit] = useState(settings.payoutDailyLimit);
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState<Record<string, Record<string, string> | string>>({});
  const canConfigure = useCan("settings.providers");

  const save = async (patch: Partial<MoneySettings>) => {
    setSaving(true);
    try {
      onSaved(await moneyApi.updateSettings(patch));
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const loadBalance = async (provider: string) => {
    try {
      setBalances((b) => ({ ...b, [provider]: "Loading…" }));
      const result = await moneyApi.balance(provider);
      setBalances((b) => ({ ...b, [provider]: result.balances }));
    } catch (e) {
      setBalances((b) => ({ ...b, [provider]: e instanceof Error ? e.message : "Unavailable" }));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
          <CardDescription>Turn on what this account needs. Nothing changes for invoices and subscriptions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Collections"
            hint="One-time payments by mobile money prompt or checkout link"
            checked={settings.collections}
            disabled={saving}
            readOnly={!canConfigure}
            onChange={(v) => save({ collections: v })}
          />
          <ToggleRow
            label="Transfers"
            hint="Move balance between customer wallets"
            checked={settings.transfers}
            disabled={saving}
            readOnly={!canConfigure}
            onChange={(v) => save({ transfers: v })}
          />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Payouts</p>
              <p className="text-xs text-muted-foreground">Enabled by the platform operator after a review of your account</p>
            </div>
            <Badge variant={settings.payouts ? "success" : "outline"}>{settings.payouts ? "On" : "Off"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout controls</CardTitle>
          <CardDescription>Amounts per currency. Leave empty for no rule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canConfigure ? (
            <>
              <CurrencyAmounts label="Needs approval at or above" value={threshold} onChange={setThreshold} />
              <CurrencyAmounts label="Daily limit" value={limit} onChange={setLimit} />
              <Button disabled={saving} onClick={() => save({ payoutApprovalThreshold: threshold, payoutDailyLimit: limit })}>
                Save payout controls
              </Button>
            </>
          ) : (
            <>
              <AmountsSummary label="Needs approval at or above" value={settings.payoutApprovalThreshold} />
              <AmountsSummary label="Daily limit" value={settings.payoutDailyLimit} />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Platform commission</CardTitle>
          <CardDescription>Set by the platform operator. Shown on each movement it applies to.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
          {(["collection", "payout", "transfer"] as const).map((kind) => (
            <div key={kind} className="rounded-md border px-3 py-2">
              <p className="font-medium capitalize">{kind}s</p>
              <p className="text-muted-foreground">{describeCommission(settings.commission?.[kind])}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Providers</CardTitle>
          <CardDescription>What each configured provider can do.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Provider</th>
                <th className="text-left font-medium px-4 py-2">Collects from</th>
                <th className="text-left font-medium px-4 py-2">Pays out to</th>
                <th className="text-left font-medium px-4 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-muted-foreground">
                    No providers configured.
                  </td>
                </tr>
              )}
              {providers.map((p) => {
                const bal = balances[p.provider];
                return (
                  <tr key={p.provider} className="border-t">
                    <td className="px-4 py-2 capitalize">{p.provider}</td>
                    <td className="px-4 py-2">{p.capabilities.collect.map((r) => railLabels[r] ?? r).join(", ") || "—"}</td>
                    <td className="px-4 py-2">{p.capabilities.payout.map((r) => railLabels[r] ?? r).join(", ") || "—"}</td>
                    <td className="px-4 py-2">
                      {!p.capabilities.balance ? (
                        "—"
                      ) : !bal ? (
                        <Button variant="link" size="sm" className="px-0" onClick={() => loadBalance(p.provider)}>
                          Show balance
                        </Button>
                      ) : typeof bal === "string" ? (
                        <span className="text-muted-foreground">{bal}</span>
                      ) : (
                        <span className="tabular-nums">
                          {Object.entries(bal).map(([code, v]) => `${code}: ${Number(v).toLocaleString()}`).join(" · ") || "No balance yet"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  readOnly,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {readOnly ? (
        <Badge variant={checked ? "success" : "outline"}>{checked ? "On" : "Off"}</Badge>
      ) : (
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      )}
    </div>
  );
}

function AmountsSummary({ label, value }: { label: string; value: Record<string, string> }) {
  const entries = Object.entries(value ?? {});
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <p className="text-sm text-muted-foreground">
        {entries.length ? entries.map(([code, amount]) => `${code} ${Number(amount).toLocaleString()}`).join(" · ") : "No rule"}
      </p>
    </div>
  );
}

function CurrencyAmounts({ label, value, onChange }: { label: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  // Rows live here so a half-typed row (amount before currency) is not dropped.
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(value));
  const commit = (next: [string, string][]) => {
    setRows(next);
    onChange(Object.fromEntries(next.filter(([c, a]) => c.length === 3 && a.trim() !== "")));
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {rows.map(([currency, amount], i) => (
        <div key={i} className="flex gap-2">
          <Input
            className="w-24"
            placeholder="UGX"
            value={currency}
            maxLength={3}
            onChange={(e) => commit(rows.map((r, j) => (j === i ? [e.target.value.toUpperCase(), r[1]] : r)))}
          />
          <Input
            value={amount}
            inputMode="decimal"
            placeholder="1000000"
            onChange={(e) => commit(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
          />
          <Button variant="ghost" size="icon" title="Remove" onClick={() => commit(rows.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setRows([...rows, ["", ""]])}>
        <Plus className="mr-1 h-3 w-3" /> Add currency
      </Button>
    </div>
  );
}
