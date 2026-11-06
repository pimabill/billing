export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  paymentUrl?: string;
  error?: string;
  /**
   * The outcome is unknown (timeout, network error, provider 5xx): the charge
   * may have gone through. Do not retry it; wait for the webhook or a status check.
   */
  ambiguous?: boolean;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  error?: string;
}

export interface PaymentStatusResult {
  status: 'succeeded' | 'pending' | 'failed';
  transactionId: string;
  amount: number;
  currency: string;
  /** Our reference for the transaction, as the provider reports it. */
  reference?: string;
}

// Card/payment method token extracted from a successful payment
export interface PaymentMethodToken {
  token: string; // Authorization code, card token, etc.
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  email?: string; // Customer email associated with the token
}

export interface WebhookData {
  status: 'succeeded' | 'failed' | 'pending';
  transactionId: string;
  amount: number;
  currency: string;
  /** Our reference for the payment (the payment id, or an invoice id on older payments). */
  invoiceId?: string;
  /**
   * True only when `invoiceId` is trustworthy: it came from a signed payload,
   * or from the provider's own API. An unverified reference is never used to
   * pick which payment a notification settles.
   */
  referenceVerified?: boolean;
  // Card token extracted from first payment (for recurring billing)
  paymentMethodToken?: PaymentMethodToken;
}

/** The ways a payer can choose to pay at checkout. */
export const CHECKOUT_METHODS = ['card', 'mobile_money', 'paypal'] as const;
export type CheckoutMethod = (typeof CHECKOUT_METHODS)[number];

/** Currencies PayPal takes payments in (no African currency among them). */
export const PAYPAL_CURRENCIES = ['AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS', 'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'SGD', 'SEK', 'CHF', 'THB', 'USD'];

/** Currencies with mobile money wallets a hosted checkout can take. */
export const MOBILE_MONEY_CURRENCIES = ['UGX', 'KES', 'GHS', 'RWF', 'TZS', 'ZMW', 'XOF', 'XAF'];

const PROVIDER_METHODS: Record<string, readonly CheckoutMethod[]> = {
  stripe: ['card'],
  payu: ['card'],
  paystack: ['card', 'mobile_money'],
  flutterwave: ['card', 'mobile_money'],
  dpo: ['card', 'mobile_money'],
  'dpo-group': ['card', 'mobile_money'],
  pesapal: ['card', 'mobile_money'],
  paypal: ['paypal'],
};

/** Whether a provider's checkout can take this method in this currency. Managed payments says for itself, per account. */
export function providerTakes(providerName: string, method: CheckoutMethod, currency: string): boolean {
  if (!PROVIDER_METHODS[providerName]?.includes(method)) return false;
  if (method === 'paypal') return PAYPAL_CURRENCIES.includes(currency);
  if (method === 'mobile_money') return (providerName === 'paystack' ? ['GHS', 'KES'] : MOBILE_MONEY_CURRENCIES).includes(currency);
  return true;
}

export interface ChargeParams {
  amount: number;
  currency: string;
  email: string;
  customerName?: string;
  reference: string;
  callbackUrl?: string;
  // Restrict payment methods (e.g., "card" to ensure tokenization for recurring billing)
  paymentOptions?: string;
  /** How the payer chose to pay, for providers that offer several (managed payments). */
  method?: CheckoutMethod;
  metadata?: Record<string, unknown>;
}

export interface RefundParams {
  transactionId: string;
  amount?: number;
  currency?: string;
}

export interface SavedPaymentMethodParams {
  customerId?: string;
  customerEmail: string;
  currency: string;
  callbackUrl: string;
  amount?: number;
  metadata?: Record<string, unknown>;
}

export interface SavedPaymentMethodResult {
  success: boolean;
  paymentMethodId?: string;
  paymentUrl?: string; // Redirect URL if provider requires customer interaction
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  error?: string;
}

export interface ChargePaymentMethodParams {
  paymentMethodId: string;
  amount: number;
  currency: string;
  reference: string;
  customerId?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export abstract class BasePaymentProvider {
  abstract readonly name: string;

  abstract charge(params: ChargeParams): Promise<PaymentResult>;

  abstract refund(params: RefundParams): Promise<RefundResult>;

  abstract getPaymentStatus(transactionId: string): Promise<PaymentStatusResult>;

  abstract handleWebhook(payload: Record<string, unknown>, signature: string, rawBody?: string): Promise<WebhookData>;

  abstract testConnection(): Promise<boolean>;

  // Save a card without charging (Stripe SetupIntent, or provider-specific flow)
  // For most African providers, cards are saved automatically on first charge —
  // the token comes back in handleWebhook().paymentMethodToken
  createPaymentMethod?(params: SavedPaymentMethodParams): Promise<SavedPaymentMethodResult>;

  // Charge a previously saved card token / authorization code
  chargePaymentMethod?(params: ChargePaymentMethodParams): Promise<PaymentResult>;

  // Remove a saved payment method
  deletePaymentMethod?(paymentMethodId: string): Promise<{ success: boolean; error?: string }>;
}
