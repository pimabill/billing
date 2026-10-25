export interface Customer {
  id: string;
  externalId: string;
  name: string;
  email: string;
  country: string;
  currency: string;
  status: "active" | "inactive";
  totalSpent: number;
  activeSubscriptions: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface PaymentMethod {
  id: string;
  customerId: string;
  provider: string;
  type: "CARD" | "BANK_ACCOUNT" | "WALLET";
  tokenId: string;
  isDefault: boolean;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  cardholderName?: string;
  country?: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  interval: "hourly" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  prices: PlanPrice[];
  features: string[];
  isActive: boolean;
  billingTiming?: "IN_ADVANCE" | "IN_ARREARS";
  minimumCommitment?: number;
  netPaymentTerms?: number;
  invoiceGracePeriodDays?: number;
  progressiveBillingThreshold?: number;
  charges?: Charge[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanPrice {
  id?: string;
  currency: string;
  amount: number;
}

export interface Subscription {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  planId: string;
  planName: string;
  planInterval: "hourly" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  status: "active" | "trial" | "past_due" | "canceled" | "paused";
  amount: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  trialEnd?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  status: "draft" | "pending" | "paid" | "failed" | "canceled";
  dueDate: string;
  paidDate?: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Payment {
  id: string;
  transactionId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  currency: string;
  provider: "stripe" | "flutterwave" | "paystack" | "dpo" | "payu" | "pesapal" | "paypal";
  status: "succeeded" | "failed" | "pending" | "refunded";
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface PaymentProvider {
  id: string;
  name: string;
  code: "stripe" | "flutterwave" | "paystack" | "dpo" | "payu" | "pesapal" | "paypal" | "yo" | "mtn_momo" | "airtel_money" | "nowpayments" | "eversend" | "tron_usdt" | "eth_usdt" | "bsc_usdt" | "binance_pay" | "btc";
  description: string;
  isConfigured: boolean;
  isActive: boolean;
  priority: number;
  config?: Record<string, any>;
}

export interface ActivityEvent {
  id: string;
  type: string;
  description: string;
  entityId: string;
  entityType: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: MemberRole;
  tenantId: string;
  /** The organisation signed in to. */
  tenantName?: string;
  permissions?: string[];
  /** Two-step sign-in: whether this person uses it, and whether the organisation requires it. */
  mfa?: { enabled: boolean; required: boolean };
}

export type MemberRole = "owner" | "admin" | "finance" | "developer" | "viewer";

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  role: MemberRole;
}

export interface Tenant {
  id: string;
  name: string;
  companyName: string;
  email: string;
  plan: string;
  status: "active" | "trial" | "suspended";
}

export interface RevenueData {
  date: string;
  revenue: number;
  mrr: number;
  oneTime: number;
  /** The reporting currency the amounts are in. */
  currency?: string;
}

export interface ChartData {
  name: string;
  value: number;
  color?: string;
}

// --- Coupons ---

export interface Coupon {
  id: string;
  code: string;
  name: string;
  description?: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  currency?: string;
  maxRedemptions?: number;
  redemptionCount: number;
  appliesToPlanIds: string[];
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Add-Ons ---

export interface AddOn {
  id: string;
  name: string;
  code: string;
  description?: string;
  invoiceDisplayName?: string;
  prices: AddOnPrice[];
  createdAt: string;
  updatedAt: string;
}

export interface AddOnPrice {
  id: string;
  currency: string;
  amount: number;
}

// --- Credit Notes ---

// --- Billable Metrics ---

export interface BillableMetric {
  id: string;
  name: string;
  code: string;
  description?: string;
  aggregationType: "COUNT" | "SUM" | "MAX" | "UNIQUE_COUNT" | "LATEST" | "WEIGHTED_SUM";
  fieldName?: string;
  recurring: boolean;
  filters: BillableMetricFilter[];
  _count?: { charges: number };
  createdAt: string;
  updatedAt: string;
}

export interface BillableMetricFilter {
  id: string;
  key: string;
  values: string[];
}

// --- Usage Events ---

export interface UsageEvent {
  id: string;
  transactionId: string;
  subscriptionId: string;
  code: string;
  timestamp: string;
  properties?: Record<string, any>;
  createdAt: string;
}

// --- Charges ---

export interface Charge {
  id: string;
  planId: string;
  billableMetricId: string;
  chargeModel: "STANDARD" | "GRADUATED" | "VOLUME" | "PACKAGE" | "PERCENTAGE";
  billingTiming: "IN_ADVANCE" | "IN_ARREARS";
  invoiceDisplayName?: string;
  minAmountCents?: number;
  prorated: boolean;
  properties?: Record<string, any>;
  billableMetric?: BillableMetric;
  graduatedRanges: ChargeGraduatedRange[];
  filters: ChargeFilter[];
  createdAt: string;
  updatedAt: string;
}

export interface ChargeGraduatedRange {
  id: string;
  fromValue: number;
  toValue?: number;
  perUnitAmount: number;
  flatAmount: number;
  order: number;
}

export interface ChargeFilter {
  id: string;
  key: string;
  values: string[];
  properties?: Record<string, any>;
}

// --- Credit Notes ---

export interface CreditNote {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  reason: "DUPLICATE" | "PRODUCT_UNSATISFACTORY" | "ORDER_CHANGE" | "OTHER";
  status: "DRAFT" | "FINALIZED" | "VOIDED";
  metadata?: Record<string, any>;
  invoice?: {
    id: string;
    invoiceNumber: string;
    amount: number;
    currency?: string;
  };
  customer?: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

// --- Taxes ---

export interface Tax {
  id: string;
  name: string;
  code: string;
  rate: number;
  description?: string;
  appliedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Plan Overrides ---

export interface PlanOverride {
  id: string;
  customerId: string;
  planId: string;
  overriddenPrices?: Array<{ currency: string; amount: number }>;
  overriddenMinimumCommitment?: number;
  overriddenCharges?: Array<{
    chargeId: string;
    properties?: Record<string, unknown>;
    graduatedRanges?: Array<{
      fromValue: number;
      toValue: number | null;
      perUnitAmount: number;
      flatAmount: number;
    }>;
  }>;
  metadata?: Record<string, unknown>;
  customer?: { id: string; name: string; email: string };
  plan?: { id: string; name: string; code: string };
  createdAt: string;
  updatedAt: string;
}

// --- Wallets ---

export interface Wallet {
  id: string;
  customerId: string;
  name?: string;
  currency: string;
  rateAmount: number;
  creditsBalance: number;
  balance: number;
  consumedCredits: number;
  consumedAmount: number;
  status: "ACTIVE" | "TERMINATED";
  expirationAt?: string;
  terminatedAt?: string;
  customer?: { id: string; name: string; email: string };
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// --- Webhook Logs ---

export interface WebhookLog {
  id: string;
  event: string;
  url: string;
  payload: Record<string, any>;
  response?: Record<string, any> | null;
  statusCode?: number | null;
  success: boolean;
  attemptCount: number;
  direction: "inbound" | "outbound";
  provider?: string | null;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  transactionType: "INBOUND" | "OUTBOUND";
  status: "PENDING" | "SETTLED" | "FAILED";
  transactionStatus: "PURCHASED" | "GRANTED" | "VOIDED" | "INVOICED";
  creditAmount: number;
  amount: number;
  invoiceId?: string;
  settledAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}
