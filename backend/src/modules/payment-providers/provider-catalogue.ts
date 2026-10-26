/**
 * Every payment provider PimaBill supports, configured or not, so an
 * integration (and the dashboard) can show what can be connected. Never
 * includes credentials.
 */
export interface CatalogueEntry {
  code: string;
  name: string;
  description: string;
}

export const PROVIDER_CATALOGUE: CatalogueEntry[] = [
  { code: 'stripe', name: 'Stripe', description: 'Global payment processing for cards, wallets, and bank debits across 46+ countries' },
  { code: 'paypal', name: 'PayPal', description: 'Global digital payments platform supporting cards, PayPal balance, and Buy Now Pay Later' },
  { code: 'paystack', name: 'Paystack', description: 'Accept payments from customers in Africa via cards, bank transfers, and mobile money' },
  { code: 'flutterwave', name: 'Flutterwave', description: 'Pan-African payment gateway supporting cards, mobile money, bank transfers, and USSD' },
  { code: 'dpo', name: 'DPO Group', description: 'Pan-African payment gateway for cards, mobile wallets, and bank transfers across 40+ countries' },
  { code: 'payu', name: 'PayU', description: 'Payment gateway for South Africa supporting credit cards, EFT, and instant payments' },
  { code: 'pesapal', name: 'Pesapal', description: 'East African payment platform for mobile money, cards, and bank transfers' },
  { code: 'yo', name: 'Yo! Payments', description: 'Uganda mobile money collections, and payouts to mobile money, registered bank accounts and Yo accounts' },
  { code: 'mtn_momo', name: 'MTN MoMo', description: 'MTN Mobile Money direct: collections (request to pay) and disbursements for MTN subscribers' },
  { code: 'airtel_money', name: 'Airtel Money', description: 'Airtel Money direct: USSD-push collections and disbursements for Airtel subscribers' },
  { code: 'nowpayments', name: 'NOWPayments (crypto)', description: 'Crypto collections on a hosted page (BTC, USDT, ETH and more), priced in your currency' },
  { code: 'eversend', name: 'Eversend', description: 'Mobile money and stablecoin (USDT, USDC) collections, and mobile money and bank payouts across Africa' },
  { code: 'tron_usdt', name: 'USDT on TRON (own wallet)', description: 'USDT on TRON straight to your own wallet address. We only watch the chain; no processor, no custody' },
  { code: 'eth_usdt', name: 'USDT on Ethereum (own wallet)', description: 'USDT on Ethereum straight to your own wallet address. We only watch the chain; no processor, no custody' },
  { code: 'bsc_usdt', name: 'USDT on BNB Chain (own wallet)', description: 'USDT on BNB Smart Chain straight to your own wallet address. We only watch the chain; no processor, no custody' },
  { code: 'btc', name: 'Bitcoin (own wallet)', description: "Bitcoin straight to your own wallet: a fresh address per payment from your wallet's public key, priced in your currency" },
  { code: 'binance_pay', name: 'Binance Pay', description: 'Payers pay from their Binance account (app, QR or link): no network fee, settles instantly to your Binance Pay balance' },
];

const NAMES: Record<string, string> = { managed: 'Managed payments', 'dpo-group': 'DPO Group' };

export const providerName = (code: string) => PROVIDER_CATALOGUE.find((p) => p.code === code)?.name ?? NAMES[code] ?? code;

const DESCRIPTIONS: Record<string, string> = {
  managed: 'Payments taken for you by managed payments (card and mobile money), paid out to your account; see GET /money/managed for the methods',
};

export const providerDescription = (code: string) => PROVIDER_CATALOGUE.find((p) => p.code === code)?.description ?? DESCRIPTIONS[code] ?? null;

/** Chains we only watch: no notifications to receive. */
const WATCHED = new Set(['tron_usdt', 'eth_usdt', 'bsc_usdt', 'btc']);
/** Registered for you once (shared URL); the rest notify this organisation's own URL. */
const SHARED = new Set(['pesapal']);
const CALLBACK = new Set(['mtn_momo', 'airtel_money', 'nowpayments', 'eversend', 'binance_pay']);

/** Where this provider sends notifications for this organisation, or null when it sends none. */
export function webhookUrlFor(code: string, tenantId: string): string | null {
  const base = `${(process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')}/webhooks`;
  if (WATCHED.has(code)) return null;
  if (code === 'managed') return `${base}/managed/${tenantId}/callback`;
  if (code === 'yo') return `${base}/yo/${tenantId}/ipn`;
  if (CALLBACK.has(code)) return `${base}/${code}/${tenantId}/callback`;
  if (SHARED.has(code)) return `${base}/${code}`;
  return `${base}/${code}/${tenantId}`;
}

/**
 * Which environment credentials are for, without revealing them: the
 * provider's own environment setting, else what its key looks like.
 */
export function environmentOf(credentials: Record<string, unknown>): 'live' | 'sandbox' | null {
  const env = String(credentials.environment ?? credentials.mode ?? '').trim().toLowerCase();
  if (['sandbox', 'test', 'testing', 'staging', 'demo'].includes(env)) return 'sandbox';
  if (['live', 'production', 'prod'].includes(env)) return 'live';
  const key = String(credentials.secretKey ?? credentials.apiKey ?? '');
  if (/^(FLWSECK_TEST-|sk_test_|pk_test_)/.test(key)) return 'sandbox';
  if (/^(FLWSECK-|sk_live_|pk_live_)/.test(key)) return 'live';
  return null;
}
