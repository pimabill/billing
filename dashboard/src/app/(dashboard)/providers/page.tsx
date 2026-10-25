"use client";

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Copy, ExternalLink, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import type { PaymentProvider } from "@/types";
import { toast } from "sonner";
import { useCan } from "@/lib/permissions";
import { brand } from "@/lib/brand";
import { useAuthStore } from "@/lib/stores/auth";
import { ProviderLogo } from "@/components/provider-logo";
import { useEnvironment } from "@/lib/environment";
import { BrandMark } from "@/components/brand-mark";


const credentialFields: Record<
  string,
  { key: string; label: string; placeholder: string; multiline?: boolean; optional?: boolean }[]
> = {
  stripe: [
    { key: "secretKey", label: "Secret Key", placeholder: "sk_live_..." },
    { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_..." },
  ],
  paystack: [
    { key: "secretKey", label: "Secret Key", placeholder: "sk_live_..." },
  ],
  flutterwave: [
    { key: "secretKey", label: "Secret Key", placeholder: "FLWSECK_..." },
    { key: "encryptionKey", label: "Encryption Key", placeholder: "" },
    { key: "secretHash", label: "Secret Hash", placeholder: "Your webhook secret hash" },
  ],
  dpo: [
    { key: "companyToken", label: "Company Token", placeholder: "" },
    { key: "serviceType", label: "Service Type", placeholder: "e.g. 5525" },
    { key: "environment", label: "Environment", placeholder: "test or live" },
  ],
  payu: [
    { key: "apiKey", label: "API Key", placeholder: "" },
    { key: "safeKey", label: "Safe Key", placeholder: "" },
    { key: "environment", label: "Environment", placeholder: "staging or production" },
  ],
  pesapal: [
    { key: "consumerKey", label: "Consumer Key", placeholder: "" },
    { key: "consumerSecret", label: "Consumer Secret", placeholder: "" },
    { key: "environment", label: "Environment", placeholder: "sandbox or live" },
  ],
  paypal: [
    { key: "clientId", label: "Client ID", placeholder: "AXxx..." },
    { key: "clientSecret", label: "Client Secret", placeholder: "" },
    { key: "webhookId", label: "Webhook ID", placeholder: "From PayPal Developer Dashboard" },
    { key: "environment", label: "Environment", placeholder: "sandbox or live" },
  ],
  yo: [
    { key: "apiUsername", label: "API Username", placeholder: "From Yo! Payments → API credentials" },
    { key: "apiPassword", label: "API Password", placeholder: "" },
    { key: "environment", label: "Environment", placeholder: "sandbox or live" },
    {
      key: "privateKey",
      label: "Private key (PEM, if Yo has public-key authentication on)",
      placeholder: "-----BEGIN PRIVATE KEY-----",
      multiline: true,
      optional: true,
    },
    {
      key: "notificationPublicKey",
      label: "Yo public key for notifications (PEM)",
      placeholder: "-----BEGIN PUBLIC KEY----- (from Yo; needed to verify payment notifications)",
      multiline: true,
      optional: true,
    },
  ],
  mtn_momo: [
    { key: "environment", label: "Environment", placeholder: "sandbox or production" },
    { key: "targetEnvironment", label: "Target environment", placeholder: "mtnuganda (sandbox: sandbox)" },
    { key: "collectionSubscriptionKey", label: "Collection subscription key", placeholder: "Primary key of the Collection product" },
    { key: "collectionApiUser", label: "Collection API user", placeholder: "UUID" },
    { key: "collectionApiKey", label: "Collection API key", placeholder: "" },
    { key: "disbursementSubscriptionKey", label: "Disbursement subscription key (for payouts)", placeholder: "", optional: true },
    { key: "disbursementApiUser", label: "Disbursement API user", placeholder: "UUID", optional: true },
    { key: "disbursementApiKey", label: "Disbursement API key", placeholder: "", optional: true },
    { key: "baseUrl", label: "API host (only if MTN gave you a different one)", placeholder: "https://proxy.momoapi.mtn.com", optional: true },
  ],
  nowpayments: [
    { key: "apiKey", label: "API key", placeholder: "From NOWPayments → Store settings" },
    { key: "ipnSecret", label: "IPN secret", placeholder: "Needed to verify payment notifications" },
    { key: "environment", label: "Environment", placeholder: "production or sandbox" },
  ],
  eversend: [
    { key: "clientId", label: "Client ID", placeholder: "From Eversend Business → Settings → API" },
    { key: "clientSecret", label: "Client secret", placeholder: "" },
    { key: "defaultChain", label: "Default crypto chain (optional)", placeholder: "e.g. TRON", optional: true },
    { key: "payoutSourceWallet", label: "Pay out from wallet (optional)", placeholder: "Payout currency by default, or e.g. USD", optional: true },
    { key: "defaultCountry", label: "Default payout country (optional)", placeholder: "e.g. UG", optional: true },
    { key: "contactPhone", label: "Fallback phone for bank payouts (optional)", placeholder: "+256…", optional: true },
    { key: "baseUrl", label: "API host (optional)", placeholder: "https://api.eversend.co/v1", optional: true },
  ],
  tron_usdt: [
    { key: "address", label: "Your TRON address (receives the USDT)", placeholder: "T…" },
    { key: "apiKey", label: "TronGrid API key (optional)", placeholder: "From trongrid.io; needed at higher volume", optional: true },
    { key: "network", label: "Network (optional)", placeholder: "mainnet or nile (testnet)", optional: true },
    { key: "expiryMinutes", label: "Minutes to pay before a collection expires (optional)", placeholder: "60", optional: true },
  ],
  eth_usdt: [
    { key: "address", label: "Your Ethereum address (receives the USDT)", placeholder: "0x…" },
    { key: "apiKey", label: "Etherscan API key", placeholder: "Free at etherscan.io" },
    { key: "confirmations", label: "Confirmations before paid (optional)", placeholder: "12", optional: true },
    { key: "expiryMinutes", label: "Minutes to pay before a collection expires (optional)", placeholder: "60", optional: true },
    { key: "network", label: "Network (optional)", placeholder: "mainnet or sepolia (testnet)", optional: true },
    { key: "tokenContract", label: "Token contract (testnet only)", placeholder: "0x…", optional: true },
  ],
  bsc_usdt: [
    { key: "address", label: "Your BNB Chain address (receives the USDT)", placeholder: "0x…" },
    { key: "apiKey", label: "Etherscan API key", placeholder: "Free at etherscan.io; covers BNB Chain where your plan includes it" },
    { key: "apiUrl", label: "Other explorer API (optional)", placeholder: "An Etherscan-compatible BNB Chain API, if not using Etherscan", optional: true },
    { key: "confirmations", label: "Confirmations before paid (optional)", placeholder: "15", optional: true },
    { key: "expiryMinutes", label: "Minutes to pay before a collection expires (optional)", placeholder: "60", optional: true },
    { key: "network", label: "Network (optional)", placeholder: "mainnet or testnet", optional: true },
    { key: "tokenContract", label: "Token contract (testnet only)", placeholder: "0x…", optional: true },
  ],
  binance_pay: [
    { key: "apiKey", label: "Binance Pay API key", placeholder: "Merchant Admin Portal → Developers" },
    { key: "apiSecret", label: "Binance Pay secret key", placeholder: "" },
  ],
  btc: [
    {
      key: "xpub",
      label: "Wallet account public key (zpub, ypub or xpub)",
      placeholder: "From Sparrow, Electrum or BlueWallet. Never paste a private key or seed words.",
      multiline: true,
    },
    { key: "addressType", label: "Address type for an xpub (optional)", placeholder: "p2wpkh (bc1q…), p2sh-p2wpkh (3…) or p2pkh (1…)", optional: true },
    { key: "confirmations", label: "Confirmations before paid (optional)", placeholder: "2", optional: true },
    { key: "expiryMinutes", label: "Minutes a BTC quote holds (optional)", placeholder: "30", optional: true },
    { key: "tolerancePercent", label: "Underpayment accepted, % (optional)", placeholder: "0.5", optional: true },
    { key: "esploraUrl", label: "Blockchain API (optional)", placeholder: "https://blockstream.info/api or https://mempool.space/api", optional: true },
  ],
  airtel_money: [
    { key: "environment", label: "Environment", placeholder: "staging or production" },
    { key: "clientId", label: "Client ID", placeholder: "" },
    { key: "clientSecret", label: "Client secret", placeholder: "" },
    { key: "country", label: "Country", placeholder: "UG" },
    { key: "currency", label: "Currency", placeholder: "UGX" },
    { key: "disbursementPin", label: "Disbursement PIN (for payouts)", placeholder: "", optional: true },
    {
      key: "encryptionPublicKey",
      label: "Airtel public key for PIN encryption (PEM)",
      placeholder: "-----BEGIN PUBLIC KEY-----",
      multiline: true,
      optional: true,
    },
  ],
};

const webhookDocs: Record<string, { label: string; url: string }> = {
  stripe: { label: "Stripe Webhooks", url: "https://dashboard.stripe.com/webhooks" },
  paystack: { label: "Paystack Webhooks", url: "https://dashboard.paystack.com/#/settings/developer" },
  flutterwave: { label: "Flutterwave Webhooks", url: "https://app.flutterwave.com/dashboard/settings/webhooks" },
  dpo: { label: "DPO Settings", url: "https://dpogroup.com" },
  payu: { label: "PayU Settings", url: "https://developers.payu.co.za" },
  pesapal: { label: "Pesapal Settings", url: "https://dashboard.pesapal.com" },
  paypal: { label: "PayPal Webhooks", url: "https://developer.paypal.com/dashboard/webhooks" },
  yo: { label: "Yo! Payments", url: "https://www.yo.co.ug" },
  mtn_momo: { label: "MTN MoMo Developer", url: "https://momodeveloper.mtn.com" },
  airtel_money: { label: "Airtel Developer Portal", url: "https://developers.airtel.africa" },
  nowpayments: { label: "NOWPayments", url: "https://account.nowpayments.io" },
  eversend: { label: "Eversend Business", url: "https://business.eversend.co" },
  tron_usdt: { label: "TronGrid", url: "https://www.trongrid.io" },
  eth_usdt: { label: "Etherscan API keys", url: "https://etherscan.io/myapikey" },
  btc: { label: "Sparrow Wallet", url: "https://sparrowwallet.com" },
  bsc_usdt: { label: "Etherscan API keys", url: "https://etherscan.io/myapikey" },
  binance_pay: { label: "Binance Merchant Portal", url: "https://merchant.binance.com" },
};

/**
 * Providers whose IPN / webhook URL is automatically registered via the
 * provider API when the credentials are saved — no manual setup needed.
 */
const autoIpnProviders = new Set(["pesapal", "yo", "mtn_momo", "nowpayments"]);

/** What to tell the user about notification setup for providers we wire up ourselves. */
function autoIpnNote(code: string, name: string): string {
  return code === "yo" || code === "mtn_momo" || code === "nowpayments"
    ? `${brand.name} sends this notification URL to ${name} with every collection request — nothing to set up on their side.`
    : `${brand.name} automatically registers this IPN URL with ${name} when you save your credentials — no manual setup required.`;
}

const signatureVerification: Record<string, { method: string; detail: string }> = {
  stripe: {
    method: "HMAC-SHA256",
    detail: "Verified using the Webhook Secret (stripe-signature header)",
  },
  paystack: {
    method: "HMAC-SHA512",
    detail: "Verified automatically using your Secret Key (x-paystack-signature header)",
  },
  flutterwave: {
    method: "Secret Hash",
    detail: "Verified using the Secret Hash you set in the Flutterwave dashboard (verif-hash header)",
  },
  dpo: {
    method: "API Callback",
    detail: "Transactions verified via server-to-server API call (no signature header)",
  },
  payu: {
    method: "API Callback",
    detail: "IPN verified via server-to-server API call (no signature header)",
  },
  pesapal: {
    method: "API Callback",
    detail: "IPN verified via server-to-server status fetch (no signature header)",
  },
  paypal: {
    method: "PayPal verification API",
    detail: "Each notification is verified with PayPal using your Webhook ID (verify-webhook-signature)",
  },
  mtn_momo: {
    method: "Status check",
    detail: "MTN callbacks are unsigned, so each one triggers a status request to MTN, which decides the outcome",
  },
  tron_usdt: {
    method: "On-chain",
    detail: "No notifications: confirmed transfers to your address are read from the TRON blockchain every minute",
  },
  eth_usdt: {
    method: "On-chain",
    detail: "No notifications: transfers to your address with enough confirmations are read from Ethereum every minute",
  },
  bsc_usdt: {
    method: "On-chain",
    detail: "No notifications: transfers to your address with enough confirmations are read from BNB Chain every minute",
  },
  binance_pay: {
    method: "RSA-SHA256",
    detail: "Verified with Binance's published certificate, then the order is queried from Binance to confirm status and amount",
  },
  btc: {
    method: "On-chain",
    detail: "No notifications: each payment address is checked on the Bitcoin blockchain every minute",
  },
  eversend: {
    method: "Status check",
    detail: "Each notification triggers a check of the deposit address with Eversend, which decides the outcome",
  },
  nowpayments: {
    method: "HMAC-SHA512",
    detail: "Verified with your IPN secret (x-nowpayments-sig header); underpayments are held for review",
  },
  airtel_money: {
    method: "Status check",
    detail: "Airtel callbacks trigger a status request to Airtel, which decides the outcome",
  },
  yo: {
    method: "RSA-SHA1 + status check",
    detail: "Notifications are signature-checked with Yo's public key, then confirmed with a status request to Yo",
  },
};

function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "https://your-api-domain.com";
  // Derive from NEXT_PUBLIC_API_URL env if set, otherwise from current origin
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  // Convention: if dashboard is app.domain.com, API is api.domain.com
  const { protocol, hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//localhost:4000`;
  }
  return `${protocol}//api.${hostname.replace(/^app\./, "")}`;
}

// Providers we register automatically keep the shared URL they were registered
// with; for the rest, show this tenant's own URL so notifications are only
// checked against this account's credentials.
function webhookUrlFor(code: string): string {
  const tenant = useAuthStore.getState().user?.tenantId;
  if (code === "yo") return `${getApiBaseUrl()}/webhooks/yo/${tenant ?? "{tenantId}"}/ipn`;
  if (code === "mtn_momo" || code === "airtel_money" || code === "nowpayments" || code === "eversend" || code === "binance_pay") {
    return `${getApiBaseUrl()}/webhooks/${code}/${tenant ?? "{tenantId}"}/callback`;
  }
  if (autoIpnProviders.has(code)) return `${getApiBaseUrl()}/webhooks/${code}`;
  const tenantId = useAuthStore.getState().user?.tenantId;
  return tenantId
    ? `${getApiBaseUrl()}/webhooks/${code}/${tenantId}`
    : `${getApiBaseUrl()}/webhooks/${code}`;
}

/** The value a provider's environment field takes on live: "live" or "production", from its placeholder. */
const liveWord = (placeholder: string) => placeholder.split(/\s+or\s+/).map((w) => w.trim()).find((w) => w && !w.startsWith("sandbox")) ?? "live";

/** A key that looks like it belongs to the other environment, for a warning before saving. */
function keyMismatch(code: string, values: Record<string, string>, sandbox: boolean): string | null {
  const secret = values.secretKey ?? "";
  if (!secret) return null;
  const test = code === "flutterwave" ? /^FLWSECK_TEST-/.test(secret) : ["stripe", "paystack"].includes(code) ? /^sk_test_/.test(secret) : null;
  if (test === null) return null;
  if (sandbox && !test) return "This looks like a live key. The sandbox should use the provider's test keys, so no real money moves.";
  if (!sandbox && test) return "This looks like a test key. Live payments need the provider's live keys.";
  return null;
}

export default function ProvidersPage() {
  const canConfigure = useCan("settings.providers");
  // Live and the sandbox each keep their own providers: test credentials belong in the sandbox.
  const env = useEnvironment();
  const sandbox = env?.sandbox ?? false;
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Config dialog state
  const [configOpen, setConfigOpen] = useState(false);
  const [configProvider, setConfigProvider] = useState<PaymentProvider | null>(
    null,
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  async function loadProviders() {
    try {
      const data = await apiClient.providers.list();
      setProviders(data);
    } catch (error) {
      toast.error("Failed to load providers");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleActive(provider: PaymentProvider) {
    if (!provider.isConfigured) {
      toast.error("Please configure the provider before activating");
      return;
    }

    try {
      await apiClient.providers.update(provider.id, {
        isActive: !provider.isActive,
      });
      toast.success(
        `Provider ${provider.isActive ? "deactivated" : "activated"}`,
      );
      loadProviders();
    } catch (error) {
      toast.error("Failed to update provider");
    }
  }

  function openConfigDialog(provider: PaymentProvider) {
    setConfigProvider(provider);
    const fields = credentialFields[provider.code] || [];
    const creds: Record<string, string> = {};
    fields.forEach((f) => {
      // The environment field starts as the one being viewed.
      creds[f.key] = f.key === "environment" ? (sandbox ? "sandbox" : liveWord(f.placeholder)) : "";
    });
    setCredentials(creds);
    setConfigOpen(true);
  }

  async function handleSaveConfig() {
    if (!configProvider) return;
    const fields = credentialFields[configProvider.code] || [];
    const hasEmpty = fields.some((f) => !f.optional && !credentials[f.key]);
    if (hasEmpty) {
      toast.error("Fill in every required credential field");
      return;
    }
    setIsSaving(true);
    try {
      if (configProvider.id.startsWith("default_")) {
        await apiClient.providers.create({
          providerName: configProvider.code,
          // Optional fields left blank are not sent.
          credentials: Object.fromEntries(Object.entries(credentials).filter(([, v]) => v)),
          isActive: true,
          priority: configProvider.priority,
        });
      } else {
        await apiClient.providers.update(configProvider.id, {
          config: credentials,
        });
      }
      toast.success("Provider configured");
      setConfigOpen(false);
      loadProviders();
    } catch (error: any) {
      toast.error(error.message || "Failed to configure provider");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest(provider: PaymentProvider) {
    if (provider.id.startsWith("default_")) {
      toast.error("Configure the provider first");
      return;
    }
    setIsTesting(provider.id);
    try {
      const result = await apiClient.providers.test(provider.id);
      if (result.success) {
        toast.success(result.message || "Connection successful");
      } else {
        toast.error(result.message || "Connection failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Connection test failed");
    } finally {
      setIsTesting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-shimmer rounded" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 animate-shimmer rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payment Providers</h1>
          <p className="text-muted-foreground">
            Configure and manage payment providers
          </p>
          {!canConfigure && (
            <p className="text-sm text-muted-foreground">You have view-only access.</p>
          )}
        </div>
      </div>

      {sandbox && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          These are your <strong>sandbox</strong> providers, separate from live. Connect each one with its test credentials (for example a Flutterwave <code className="font-mono">FLWSECK_TEST-</code> key or PayPal sandbox app): nothing here moves real money.
        </div>
      )}

      {/* Provider Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {

          return (
            <Card key={provider.id} className="relative overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <ProviderLogo code={provider.code} name={provider.name} />
                    <div>
                      <CardTitle>{provider.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {provider.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status Badges */}
                <div className="flex flex-wrap gap-2">
                  {provider.isConfigured && provider.environment && (
                    <Badge variant={(provider.environment === "sandbox") === sandbox ? "secondary" : "warning"}>
                      {provider.environment === "sandbox" ? "Test keys" : "Live keys"}
                    </Badge>
                  )}
                  <Badge
                    variant={provider.isConfigured ? "success" : "outline"}
                  >
                    {provider.isConfigured ? "Configured" : "Not Configured"}
                  </Badge>
                  <Badge variant={provider.isActive ? "success" : "outline"}>
                    {provider.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant="secondary">
                    Priority: {provider.priority}
                  </Badge>
                </div>

                {/* Configuration Status */}
                {!provider.isConfigured && (
                  <div className="p-3 bg-muted border border-border rounded-md">
                    <p className="text-sm text-muted-foreground">
                      This provider needs to be configured before it can be
                      activated.
                    </p>
                  </div>
                )}

                {/* Actions */}
                {canConfigure && (
                  <div className="pt-4 border-t border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Active</span>
                      <Switch
                        checked={provider.isActive}
                        onCheckedChange={() => handleToggleActive(provider)}
                        disabled={!provider.isConfigured}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => openConfigDialog(provider)}
                      >
                        <SettingsIcon className="mr-2 h-4 w-4" />
                        {provider.isConfigured ? "Reconfigure" : "Configure"}
                      </Button>
                      {provider.isConfigured && (
                        <Button
                          variant="outline"
                          onClick={() => handleTest(provider)}
                          disabled={isTesting === provider.id}
                        >
                          {isTesting === provider.id ? (
                            <BrandMark animated tight className="h-4 w-4" />
                          ) : (
                            "Test"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Webhook URL */}
                <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Webhook URL</p>
                    <div className="flex items-center gap-2">
                      {autoIpnProviders.has(provider.code) && (
                        <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0">
                          <Zap className="h-2.5 w-2.5" />
                          Auto-registered
                        </Badge>
                      )}
                      {!autoIpnProviders.has(provider.code) && webhookDocs[provider.code] && (
                        <a
                          href={webhookDocs[provider.code].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Set up
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 px-2 py-1.5 bg-background border border-border rounded font-mono text-xs truncate select-all">
                      {webhookUrlFor(provider.code)}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          webhookUrlFor(provider.code),
                        );
                        toast.success("Webhook URL copied");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {autoIpnProviders.has(provider.code)
                      ? autoIpnNote(provider.code, provider.name)
                      : `Paste this URL in your ${provider.name} dashboard to receive payment notifications.`}
                  </p>
                </div>

                {/* Signature Verification */}
                {signatureVerification[provider.code] && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-600" />
                    <div>
                      <span className="font-medium text-foreground">
                        {signatureVerification[provider.code].method}
                      </span>
                      {" — "}
                      {signatureVerification[provider.code].detail}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
          <CardDescription>
            Learn how to configure payment providers and integrate them with
            your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <h4 className="font-medium mb-2">Stripe</h4>
              <a
                href="https://stripe.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Documentation &rarr;
              </a>
            </div>
            <div>
              <h4 className="font-medium mb-2">Flutterwave</h4>
              <a
                href="https://developer.flutterwave.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Documentation &rarr;
              </a>
            </div>
            <div>
              <h4 className="font-medium mb-2">Paystack</h4>
              <a
                href="https://paystack.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Documentation &rarr;
              </a>
            </div>
            <div>
              <h4 className="font-medium mb-2">DPO Group</h4>
              <a
                href="https://dpogroup.com/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Documentation &rarr;
              </a>
            </div>
            <div>
              <h4 className="font-medium mb-2">PayU</h4>
              <a
                href="https://developers.payu.co.za"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Documentation &rarr;
              </a>
            </div>
            <div>
              <h4 className="font-medium mb-2">Pesapal</h4>
              <a
                href="https://developer.pesapal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Documentation &rarr;
              </a>
            </div>
            <div>
              <h4 className="font-medium mb-2">PayPal</h4>
              <a
                href="https://developer.paypal.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View Documentation &rarr;
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configure Provider Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure {configProvider?.name}</DialogTitle>
            <DialogDescription>
              Enter your API credentials. These will be encrypted and stored
              securely.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {configProvider &&
              (credentialFields[configProvider.code] || []).map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  {field.multiline ? (
                    <Textarea
                      id={field.key}
                      rows={4}
                      className="font-mono text-xs"
                      placeholder={field.placeholder}
                      value={credentials[field.key] || ""}
                      onChange={(e) =>
                        setCredentials({
                          ...credentials,
                          [field.key]: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <Input
                      id={field.key}
                      type={field.key === "environment" || field.key === "targetEnvironment" ? "text" : "password"}
                      placeholder={field.placeholder}
                      value={credentials[field.key] || ""}
                      onChange={(e) =>
                        setCredentials({
                          ...credentials,
                          [field.key]: e.target.value,
                        })
                      }
                    />
                  )}
                  {field.key === "environment" && credentials.environment && (sandbox ? credentials.environment.trim().toLowerCase() !== "sandbox" : credentials.environment.trim().toLowerCase() === "sandbox") && (
                    <p className="text-xs text-amber-600">
                      {sandbox
                        ? "This is the sandbox: set the provider to its sandbox environment."
                        : "This is live: a provider in its sandbox environment is never used for live payments."}
                    </p>
                  )}
                  {field.key === "secretKey" && configProvider && keyMismatch(configProvider.code, credentials, sandbox) && (
                    <p className="text-xs text-amber-600">{keyMismatch(configProvider.code, credentials, sandbox)}</p>
                  )}
                </div>
              ))}

            {/* Webhook URL in dialog */}
            {configProvider && (
              <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Webhook URL</Label>
                  {autoIpnProviders.has(configProvider.code) && (
                    <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0">
                      <Zap className="h-2.5 w-2.5" />
                      Auto-registered
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 px-2 py-1.5 bg-background border border-border rounded font-mono text-xs truncate select-all">
                    {webhookUrlFor(configProvider.code)}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        webhookUrlFor(configProvider.code),
                      );
                      toast.success("Webhook URL copied");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                {autoIpnProviders.has(configProvider.code) ? (
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {autoIpnNote(configProvider.code, configProvider.name)}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Add this URL to your{" "}
                    {webhookDocs[configProvider.code] ? (
                      <a
                        href={webhookDocs[configProvider.code].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {configProvider.name} dashboard
                      </a>
                    ) : (
                      `${configProvider.name} dashboard`
                    )}{" "}
                    to receive payment notifications.
                  </p>
                )}
              </div>
            )}

            {/* Signature verification info in dialog */}
            {configProvider && signatureVerification[configProvider.code] && (
              <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3 text-xs">
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium text-foreground">
                    Signature Verification: {signatureVerification[configProvider.code].method}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {signatureVerification[configProvider.code].detail}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} disabled={isSaving}>
              {isSaving && <BrandMark animated tight className="mr-2 h-4 w-4" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
