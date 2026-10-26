import { createHmac, timingSafeEqual } from 'crypto';
import { Capabilities, CollectRequest, MoneyProvider, ProviderOutcome, Rail } from '../types';

/**
 * Managed payments: for tenants without their own provider accounts. A
 * separate, privately run Managed Payments service opens a Flutterwave
 * subaccount for the tenant and takes payments on it; Flutterwave settles
 * straight to the tenant's bank account and keeps the platform fee as the
 * split, so neither PimaBill nor the service holds the money.
 *
 * This adapter is only the client. The instance's subscription key
 * (MANAGED_PAYMENTS_API_KEY) identifies the PimaBill deployment; the
 * tenant's managed account id is its stored credential.
 *
 * API (v1, JSON, `Authorization: Bearer <instance key>`):
 *   POST /v1/accounts                     open an account (business + bank details)
 *   GET  /v1/accounts/:id                 account status and payment methods
 *   POST /v1/accounts/mirror              sandbox only: the account, set up from the approved live one
 *   POST /v1/collections                  create a checkout (Idempotency-Key: our reference)
 *   GET  /v1/collections/:reference       collection status
 * Notifications: POST to notificationUrl with
 *   X-Managed-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body" with the webhook secret>
 */
export interface ManagedConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret?: string;
}

export interface ManagedCredentials {
  accountId: string;
}

export type ManagedAccountStatus = 'pending_review' | 'active' | 'rejected' | 'suspended';

export interface ManagedAccount {
  id: string;
  status: ManagedAccountStatus;
  businessName: string;
  country: string;
  currency: string;
  bankName?: string;
  accountNumberLast4?: string;
  /** Platform fee taken from each payment, e.g. { type: "percentage", value: 2.5 }. */
  fee?: { type: 'percentage' | 'flat'; value: number };
  /** direct: each payment settles to the bank account; balance: held by the platform and paid out. */
  settlement?: 'direct' | 'balance';
  /** Masked, e.g. "Mobile money ****4567". */
  payoutDestination?: string;
  email?: string;
  phone?: string;
  reason?: string;
  /** When billing saw the status change (returned by GET /money/managed). */
  statusChangedAt?: string;
  /** Payment methods the merchant's customers can use through managed payments. */
  methods?: ('card' | 'mobile_money' | 'paypal')[];
}

export interface ManagedPayoutDestination {
  type: 'mobile_money' | 'bank' | 'paypal';
  msisdn?: string;
  /** Name on the mobile money or PayPal account. */
  name?: string;
  email?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
}

/** Contact details and payout destination, changeable after applying. */
export interface UpdateManagedAccount {
  email?: string;
  phone?: string;
  payoutDestination?: ManagedPayoutDestination;
}

export interface OpenManagedAccount {
  externalId: string;
  businessName: string;
  email: string;
  phone: string;
  country: string;
  currency: string;
  /** For direct settlement where the provider supports it. */
  bank?: { code: string; accountNumber: string; accountName?: string };
  /** Where pooled balances are paid out. Bank details, a payout destination, or both. */
  payoutDestination?: ManagedPayoutDestination;
  /** Where the service reports account status changes for this tenant. */
  notificationUrl?: string;
}

const TIMEOUT_MS = 30_000;
const SIGNATURE_TOLERANCE_S = 600;

/** Managed settings from the environment, or null when this deployment has no subscription. */
export function managedConfig(): ManagedConfig | null {
  const baseUrl = process.env.MANAGED_PAYMENTS_URL;
  const apiKey = process.env.MANAGED_PAYMENTS_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, webhookSecret: process.env.MANAGED_PAYMENTS_WEBHOOK_SECRET };
}

export class ManagedPaymentsClient {
  constructor(
    private readonly config: ManagedConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  openAccount(input: OpenManagedAccount) {
    return this.request<ManagedAccount>('POST', '/v1/accounts', input, input.externalId);
  }

  updateAccount(id: string, changes: UpdateManagedAccount) {
    return this.request<ManagedAccount>('POST', `/v1/accounts/${encodeURIComponent(id)}`, changes);
  }

  getAccount(id: string) {
    return this.request<ManagedAccount>('GET', `/v1/accounts/${encodeURIComponent(id)}`);
  }

  /** Sandbox deployments: the merchant's account, set up from their approved live one (404 when they are not approved there). */
  mirrorAccount(externalId: string, notificationUrl: string) {
    return this.request<ManagedAccount>('POST', '/v1/accounts/mirror', { externalId, notificationUrl });
  }

  /** "t=…,v1=…" over the raw body, within ten minutes; constant-time compare. */
  verifySignature(rawBody: string, header: string | undefined): boolean {
    if (!this.config.webhookSecret || !header) return false;
    const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
    const t = Number(parts.t);
    if (!parts.v1 || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_S) return false;
    const expected = createHmac('sha256', this.config.webhookSecret).update(`${parts.t}.${rawBody}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(parts.v1);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<{ status: number; data: T | null; error?: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'application/json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`Could not reach managed payments: ${error instanceof Error ? error.message : error}`);
    }
    const json = (await response.json().catch(() => null)) as (T & { message?: string }) | { message?: string } | null;
    if (!response.ok) return { status: response.status, data: null, error: json?.message ?? `HTTP ${response.status}` };
    return { status: response.status, data: json as T };
  }
}

interface ManagedCollection {
  reference: string;
  status: 'pending' | 'succeeded' | 'failed';
  amount: string;
  currency: string;
  checkoutUrl?: string;
  providerReference?: string;
  /** Processor fee plus platform fee, in major units. */
  fees?: string;
  failureReason?: string;
}

/** What managed payments can collect; the service routes each method to a provider. */
export const MANAGED_COLLECT: Rail[] = ['hosted', 'mobile_money', 'paypal'];

export class ManagedAdapter implements MoneyProvider {
  readonly name = 'managed';
  // Hosted: the payer picks on the checkout page. Mobile money: a prompt on the payer's phone.
  // PayPal: PayPal's checkout. The service routes each to the provider it has for it.
  readonly capabilities: Capabilities = { collect: MANAGED_COLLECT, payout: [], balance: false, verifyPayee: false };
  private readonly client: ManagedPaymentsClient;

  constructor(
    private readonly credentials: ManagedCredentials,
    config: ManagedConfig,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new ManagedPaymentsClient(config, fetchImpl);
  }

  async collect(request: CollectRequest): Promise<ProviderOutcome> {
    const payer = request.payer;
    let method: 'card' | 'mobile_money' | 'paypal';
    let customer: { email?: string; name?: string; phone?: string };
    if (payer.type === 'hosted') {
      method = 'card';
      customer = { email: payer.email, name: payer.name };
    } else if (payer.type === 'mobile_money') {
      method = 'mobile_money';
      customer = { name: payer.name, phone: `+${payer.msisdn.replace(/[^\d]/g, '')}` };
    } else if (payer.type === 'paypal') {
      method = 'paypal';
      customer = { email: payer.email, name: payer.name };
    } else {
      return { state: 'failed', failureReason: `Managed payments cannot collect from ${payer.type.replace('_', ' ')}` };
    }
    // Creating a checkout moves no money, so errors here are clean failures; the
    // Idempotency-Key makes a retry return the same checkout.
    const r = await this.client
      .request<ManagedCollection>(
        'POST',
        '/v1/collections',
        {
          account: this.credentials.accountId,
          reference: request.reference,
          amount: request.amount,
          currency: request.currency,
          description: request.description,
          method,
          customer,
          redirectUrl: request.callbackUrl,
          notificationUrl: request.notificationUrl,
        },
        request.reference,
      )
      .catch((error: Error) => ({ status: 0, data: null, error: error.message }));
    if (!r.data) return { state: 'failed', failureReason: r.error ?? 'Managed payments could not start the payment' };
    if (r.data.status === 'failed') return { state: 'failed', failureReason: r.data.failureReason ?? 'Payment failed' };
    if (r.data.checkoutUrl) return { state: 'pending', paymentUrl: r.data.checkoutUrl, providerStatus: 'CHECKOUT_CREATED' };
    // Mobile money: the payer approves a prompt on their phone; no page to visit.
    if (method === 'mobile_money') return { state: 'pending', providerStatus: 'PROMPT_SENT' };
    return { state: 'failed', failureReason: 'Managed payments could not start the checkout' };
  }

  /** The service's answer decides; a settled amount other than the one asked for is held for review. */
  async getCollection(reference: string, _txn?: string | null, expected?: string): Promise<ProviderOutcome> {
    const r = await this.client.request<ManagedCollection>(
      'GET',
      `/v1/collections/${encodeURIComponent(reference)}?account=${encodeURIComponent(this.credentials.accountId)}`,
    );
    if (r.status === 404) return { state: 'failed', providerStatus: 'NOT_FOUND', failureReason: 'Managed payments has no record of this collection' };
    if (!r.data) return { state: 'pending', providerStatus: `HTTP_${r.status}` };
    const c = r.data;
    const fee = c.fees !== undefined ? Number(c.fees) : undefined;
    const outcome: ProviderOutcome = {
      state: c.status,
      providerStatus: c.status.toUpperCase(),
      providerTxnId: c.providerReference,
      ...(fee !== undefined && Number.isFinite(fee) && { fee }),
      ...(c.status === 'failed' && { failureReason: c.failureReason ?? 'Payment failed' }),
    };
    if (c.status === 'succeeded' && expected && Number(c.amount) !== Number(expected)) {
      return { ...outcome, state: 'pending', indeterminate: true, failureReason: `Held for review: paid ${c.amount} ${c.currency}` };
    }
    return outcome;
  }
}
