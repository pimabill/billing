import { apiFetch } from "./client";

export type MoneyType = "collection" | "payout" | "transfer";
export type MoneyStatus =
  | "requires_approval"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "stuck"
  | "canceled";

export type Party =
  | { type: "mobile_money"; msisdn: string; network?: string; name?: string }
  | { type: "bank"; accountNumber: string; accountName: string; bankCode?: string; bankName?: string; country?: string; phone?: string; transferType?: string }
  | { type: "paypal"; email: string; name?: string }
  | { type: "yo_account"; accountNumber: string; email: string; name?: string }
  | { type: "hosted"; email: string; name?: string }
  | { type: "crypto"; email?: string; name?: string; payCurrency?: string; chain?: string };

export interface PaymentDetails {
  kind: "crypto_address";
  coin: string;
  chain: string;
  address: string;
  amount: string;
  memo?: string;
}

export interface MoneyIntent {
  id: string;
  type: MoneyType;
  status: MoneyStatus;
  amount: string;
  currency: string;
  provider: string | null;
  rail: string;
  party: Party | null;
  description: string | null;
  reference: string | null;
  providerReference: string | null;
  providerTransactionId: string | null;
  providerStatus: string | null;
  paymentUrl: string | null;
  paymentDetails: PaymentDetails | null;
  failureReason: string | null;
  fee: string | null;
  commission: string | null;
  commissionChargeTo: "tenant" | "payer" | null;
  chargedAmount: string | null;
  customerId: string | null;
  walletId: string | null;
  toWalletId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface MoneySettings {
  collections: boolean;
  transfers: boolean;
  payouts: boolean;
  payoutApprovalThreshold: Record<string, string>;
  payoutDailyLimit: Record<string, string>;
  commission: Partial<Record<"collection" | "payout" | "transfer", CommissionRule>>;
}

export interface CommissionRule {
  rateBps?: number;
  flat?: Record<string, string>;
  min?: Record<string, string>;
  max?: Record<string, string>;
  chargeTo?: "tenant" | "payer";
}

/** "1.5% + 200 UGX (min 500, max 10,000) · paid by payer" */
export function describeCommission(rule: CommissionRule | undefined): string {
  if (!rule) return "None";
  const parts: string[] = [];
  if (rule.rateBps) parts.push(`${rule.rateBps / 100}%`);
  for (const [c, v] of Object.entries(rule.flat ?? {})) parts.push(`${Number(v).toLocaleString()} ${c}`);
  const bounds = [
    ...Object.entries(rule.min ?? {}).map(([c, v]) => `min ${Number(v).toLocaleString()} ${c}`),
    ...Object.entries(rule.max ?? {}).map(([c, v]) => `max ${Number(v).toLocaleString()} ${c}`),
  ];
  const text = parts.join(" + ") || "0";
  return `${text}${bounds.length ? ` (${bounds.join(", ")})` : ""}${rule.chargeTo === "payer" ? " · added to what the payer pays" : ""}`;
}

export interface CryptoDeposit {
  id: string;
  chain: string;
  token: string;
  address: string;
  txHash: string;
  from: string | null;
  amount: string;
  blockTime: string;
  status: "matched" | "assigned" | "unmatched" | "confirming";
  collectionId: string | null;
}

export interface ManagedAccount {
  id: string;
  status: "pending_review" | "active" | "rejected" | "suspended";
  businessName: string;
  country: string;
  currency: string;
  bankName?: string;
  accountNumberLast4?: string;
  fee?: { type: "percentage" | "flat"; value: number };
  /** direct: each payment settles to the bank account; balance: held by the platform and paid out. */
  settlement?: "direct" | "balance";
  /** Masked, e.g. "Mobile money ****4567". */
  payoutDestination?: string;
  email?: string;
  phone?: string;
  reason?: string;
  /** What the merchant's customers can pay with through managed payments. */
  methods?: ("card" | "mobile_money" | "paypal")[];
  /** When the status last changed. */
  statusChangedAt?: string;
}

export type ManagedPayoutType = "mobile_money" | "bank" | "paypal";

export interface OpenManagedAccount {
  businessName: string;
  email: string;
  phone: string;
  country: string;
  currency: string;
  bank?: { code: string; accountNumber: string; accountName?: string };
  payoutDestination?: ManagedPayoutDestination;
}

export interface ManagedPayoutDestination {
  type: ManagedPayoutType;
  msisdn?: string;
  name?: string;
  email?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
}

export interface UpdateManagedAccount {
  email?: string;
  phone?: string;
  payoutDestination?: ManagedPayoutDestination;
}

export interface ProviderCapabilities {
  provider: string;
  capabilities: { collect: string[]; payout: string[]; balance: boolean; verifyPayee: boolean };
}

const path: Record<MoneyType, string> = { collection: "collections", payout: "payouts", transfer: "transfers" };

/** Each create call carries an Idempotency-Key so a double-click or retry never moves money twice. */
function idempotent(body: unknown): RequestInit {
  const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  return { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": key } };
}

export const moneyApi = {
  capabilities: () =>
    apiFetch<{ settings: MoneySettings; providers: ProviderCapabilities[] }>("/money/capabilities"),
  updateSettings: (patch: Partial<MoneySettings>) =>
    apiFetch<MoneySettings>("/money/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  list: (type: MoneyType, params: { status?: string; page?: number } = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
    ).toString();
    return apiFetch<{ data: MoneyIntent[]; meta: { total: number; page: number; totalPages: number } }>(
      `/${path[type]}${q ? `?${q}` : ""}`,
    );
  },
  createCollection: (body: Record<string, unknown>) => apiFetch<MoneyIntent>("/collections", idempotent(body)),
  createPayout: (body: Record<string, unknown>) => apiFetch<MoneyIntent>("/payouts", idempotent(body)),
  createTransfer: (body: Record<string, unknown>) => apiFetch<MoneyIntent>("/transfers", idempotent(body)),
  approve: (id: string) => apiFetch<MoneyIntent>(`/payouts/${id}/approve`, { method: "POST" }),
  cancel: (type: MoneyType, id: string) => apiFetch<MoneyIntent>(`/${path[type]}/${id}/cancel`, { method: "POST" }),
  refresh: (type: MoneyType, id: string) => apiFetch<MoneyIntent>(`/${path[type]}/${id}/refresh`, { method: "POST" }),
  verifyPayee: (provider: string, payee: Party) =>
    apiFetch<{ valid: boolean; name?: string }>(`/money/providers/${provider}/verify-payee`, {
      method: "POST",
      body: JSON.stringify({ payee }),
    }),
  cryptoDeposits: (params: { status?: string; page?: number } = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
    ).toString();
    return apiFetch<{ data: CryptoDeposit[]; meta: { total: number; page: number; totalPages: number } }>(
      `/money/crypto-deposits${q ? `?${q}` : ""}`,
    );
  },
  assignDeposit: (id: string, collectionId: string) =>
    apiFetch<MoneyIntent>(`/money/crypto-deposits/${id}/assign`, { method: "POST", body: JSON.stringify({ collectionId }) }),
  managedStatus: () => apiFetch<{ available: boolean; account: ManagedAccount | null }>("/money/managed"),
  openManaged: (body: OpenManagedAccount) =>
    apiFetch<ManagedAccount>("/money/managed", { method: "POST", body: JSON.stringify(body) }),
  updateManaged: (body: UpdateManagedAccount) =>
    apiFetch<ManagedAccount>("/money/managed", { method: "PATCH", body: JSON.stringify(body) }),
  requestOtp: (provider: string, phone: string) =>
    apiFetch<{ pinId: string }>(`/money/providers/${provider}/otp`, { method: "POST", body: JSON.stringify({ phone }) }),
  balance: (provider: string) =>
    apiFetch<{ provider: string; balances: Record<string, string> }>(`/money/providers/${provider}/balance`),
};

export const statusLabels: Record<MoneyStatus, string> = {
  requires_approval: "Needs approval",
  pending: "Pending",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  stuck: "Needs review",
  canceled: "Canceled",
};

export const railLabels: Record<string, string> = {
  mobile_money: "Mobile money",
  bank: "Bank account",
  paypal: "PayPal",
  yo_account: "Yo account",
  hosted: "Checkout link",
  crypto: "Crypto",
  wallet: "Wallet",
};

export function describeParty(party: Party | null): string {
  if (!party) return "—";
  switch (party.type) {
    case "mobile_money":
      return `${party.name ? `${party.name} · ` : ""}+${party.msisdn.replace(/^\+/, "")}`;
    case "bank":
      return `${party.accountName} · ${party.bankName ?? party.bankCode ?? "bank"} ${party.accountNumber}`;
    case "paypal":
    case "hosted":
      return party.email;
    case "crypto":
      return `Crypto${party.payCurrency ? ` (${party.payCurrency.toUpperCase()})` : party.chain ? ` (${party.chain})` : ""}${party.email ? ` · ${party.email}` : ""}`;
    case "yo_account":
      return `Yo ${party.accountNumber}`;
  }
}
