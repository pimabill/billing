import type {
  Customer,
  Plan,
  Subscription,
  Invoice,
  Payment,
  PaymentProvider,
  PaymentMethod,
  RevenueData,
  ActivityEvent,
  Coupon,
  AddOn,
  CreditNote,
  BillableMetric,
  UsageEvent,
  Charge,
  Wallet,
  WalletTransaction,
  Tax,
  PlanOverride,
  WebhookLog,
  User,
  Organisation,
} from "@/types";

// All calls go to the dashboard's own API routes (same origin).
// The server-side proxy adds auth headers and forwards to the backend.

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set Content-Type for requests with a body
  if (options.method && options.method !== "GET" && options.method !== "HEAD") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`/api/proxy${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    // Session expired — redirect to login
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message || `API error ${res.status}`, body.code);
  }

  // DELETEs answer 204 with no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- Mappers: API response -> Dashboard types ---

function mapCustomer(c: any): Customer {
  return {
    id: c.id,
    externalId: c.externalId || "",
    name: c.name || "",
    email: c.email || "",
    country: c.country || "",
    currency: c.currency || "USD",
    status: (c.activeSubscriptions > 0
      ? "active"
      : "inactive") as Customer["status"],
    totalSpent: Number(c.totalSpent) || 0,
    activeSubscriptions: Number(c.activeSubscriptions) || 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    metadata: c.metadata || {},
  };
}

function mapPlan(p: any): Plan {
  return {
    id: p.id,
    code: p.code || "",
    name: p.name || "",
    description: p.description || "",
    interval: (
      p.billingInterval || "MONTHLY"
    ).toLowerCase() as Plan["interval"],
    prices: (p.prices || []).map((pr: any) => ({
      id: pr.id,
      currency: pr.currency,
      amount: Number(pr.amount),
    })),
    features: p.features || [],
    isActive: p.isActive !== false,
    billingTiming: p.billingTiming || "IN_ARREARS",
    netPaymentTerms: p.netPaymentTerms ?? undefined,
    invoiceGracePeriodDays: p.invoiceGracePeriodDays ?? undefined,
    progressiveBillingThreshold: p.progressiveBillingThreshold != null ? Number(p.progressiveBillingThreshold) : undefined,
    minimumCommitment: p.minimumCommitment != null ? Number(p.minimumCommitment) : undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapSubscription(s: any): Subscription {
  // Find matching price from plan.prices for this subscription's currency
  const price = (s.plan?.prices || []).find(
    (p: any) =>
      p.currency?.toUpperCase() === (s.currency || "USD").toUpperCase(),
  );

  return {
    id: s.id,
    customerId: s.customerId,
    customerName: s.customer?.name || "",
    customerEmail: s.customer?.email || "",
    planId: s.planId,
    planName: s.plan?.name || "",
    planInterval: (
      s.plan?.billingInterval || "MONTHLY"
    ).toLowerCase() as Subscription["planInterval"],
    status: (s.status === "TRIALING"
      ? "trial"
      : (s.status || "ACTIVE").toLowerCase()) as Subscription["status"],
    amount: price ? Number(price.amount) : 0,
    currency: s.currency || "USD",
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    nextBillingDate: s.currentPeriodEnd,
    trialEnd: s.trialEnd || undefined,
    canceledAt: s.canceledAt || undefined,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function mapInvoice(inv: any): Invoice {
  const items = inv.metadata?.items || [];
  const total = Number(inv.amount) || 0;

  // Calculate subtotal from positive line items only
  const subtotal = items.reduce((sum: number, it: any) => {
    const lineAmount = (it.quantity || 1) * (it.unitAmount || it.unitPrice || 0);
    return lineAmount > 0 ? sum + lineAmount : sum;
  }, 0) || total;

  // Sum discount from negative line items (coupons, wallet credits)
  const discount = items.reduce((sum: number, it: any) => {
    const lineAmount = (it.quantity || 1) * (it.unitAmount || it.unitPrice || 0);
    return lineAmount < 0 ? sum + Math.abs(lineAmount) : sum;
  }, 0);

  // Tax from metadata if available
  const tax = Number(inv.metadata?.taxAmount) || 0;

  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber || `INV-${inv.id.slice(-8).toUpperCase()}`,
    customerId: inv.customerId,
    customerName: inv.customer?.name || "",
    customerEmail: inv.customer?.email || undefined,
    subscriptionId: inv.subscriptionId || undefined,
    amount: total,
    currency: inv.currency || "USD",
    status: (inv.status || "PENDING").toLowerCase() as Invoice["status"],
    dueDate: inv.dueDate,
    paidDate: inv.paidAt || undefined,
    lineItems: items.map((it: any) => ({
      description: it.description || "",
      quantity: it.quantity || 1,
      unitPrice: it.unitAmount || it.unitPrice || 0,
      amount: (it.quantity || 1) * (it.unitAmount || it.unitPrice || 0),
    })),
    subtotal,
    tax,
    discount,
    total,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  };
}

function mapPayment(p: any): Payment {
  return {
    id: p.id,
    transactionId: p.providerTransactionId || p.id.slice(-12).toUpperCase(),
    invoiceId: p.invoiceId || "",
    invoiceNumber: p.invoice?.invoiceNumber
      || (p.invoiceId ? `INV-${p.invoiceId.slice(-8).toUpperCase()}` : ""),
    customerId: p.invoice?.customerId || "",
    customerName: p.invoice?.customer?.name || "",
    amount: Number(p.amount) || 0,
    currency: p.currency || "USD",
    provider: (p.provider || "manual").toLowerCase() as Payment["provider"],
    status: (p.status || "PENDING").toLowerCase() as Payment["status"],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    metadata: p.metadata || {},
  };
}

const providerDescriptions: Record<string, string> = {
  stripe: "Global payment processing for cards, wallets, and bank debits across 46+ countries",
  paystack: "Accept payments from customers in Africa via cards, bank transfers, and mobile money",
  flutterwave: "Pan-African payment gateway supporting cards, mobile money, bank transfers, and USSD",
  dpo: "Pan-African payment gateway for cards, mobile wallets, and bank transfers across 40+ countries",
  payu: "Payment gateway for South Africa supporting credit cards, EFT, and instant payments",
  pesapal: "East African payment platform for mobile money, cards, and bank transfers",
  paypal: "Global digital payments platform supporting cards, PayPal balance, and Buy Now Pay Later",
  yo: "Uganda mobile money collections, and payouts to mobile money, registered bank accounts and Yo accounts",
  mtn_momo: "MTN Mobile Money direct: collections (request to pay) and disbursements for MTN subscribers",
  airtel_money: "Airtel Money direct: USSD-push collections and disbursements for Airtel subscribers",
  nowpayments: "Crypto collections on a hosted page (BTC, USDT, ETH and more), priced in your currency",
  eversend: "Mobile money and stablecoin (USDT, USDC) collections, and mobile money and bank payouts across Africa",
  tron_usdt: "USDT on TRON straight to your own wallet address. We only watch the chain; no processor, no custody",
  eth_usdt: "USDT on Ethereum straight to your own wallet address. We only watch the chain; no processor, no custody",
  bsc_usdt: "USDT on BNB Smart Chain straight to your own wallet address. We only watch the chain; no processor, no custody",
  binance_pay: "Payers pay from their Binance account (app, QR or link): no network fee, settles instantly to your Binance Pay balance",
  btc: "Bitcoin straight to your own wallet: a fresh address per payment from your wallet's public key, priced in your currency",
};

const providerDisplayNames: Record<string, string> = {
  stripe: "Stripe",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  dpo: "DPO Group",
  payu: "PayU",
  pesapal: "Pesapal",
  paypal: "PayPal",
  yo: "Yo! Payments",
  mtn_momo: "MTN MoMo",
  airtel_money: "Airtel Money",
  nowpayments: "NOWPayments (crypto)",
  eversend: "Eversend",
  tron_usdt: "USDT on TRON (own wallet)",
  eth_usdt: "USDT on Ethereum (own wallet)",
  bsc_usdt: "USDT on BNB Chain (own wallet)",
  binance_pay: "Binance Pay",
  btc: "Bitcoin (own wallet)",
};

function mapProvider(p: any): PaymentProvider {
  const code = (p.providerName || p.code || "").toLowerCase();
  return {
    id: p.id,
    name: providerDisplayNames[code] || p.providerName || p.name || code,
    code: code as PaymentProvider["code"],
    description: providerDescriptions[code] || "",
    isConfigured: p.isConfigured !== undefined ? p.isConfigured : !!p.id,
    isActive: p.isActive !== false,
    priority: p.priority || 0,
    environment: p.environment ?? null,
  };
}

// --- API Client ---

export interface SessionResult {
  user: User;
  organisations?: Organisation[];
  apiKey?: string;
}

/** The password was right and the account uses two-step sign-in: finish with a code. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

/** An error from the API, with its machine-readable code when it has one (e.g. MFA_REQUIRED). */
export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** Auth calls go to the Next.js route handlers, which keep the tokens in http-only cookies. */
async function sessionCall<T = SessionResult>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.message || "Request failed", json.code);
  return json;
}

export const apiClient = {
  // Auth (calls Next.js API routes directly, not the proxy)
  auth: {
    login: (email: string, password: string, tenantId?: string) =>
      sessionCall<SessionResult | MfaChallenge>("/api/auth/login", { email, password, tenantId }),
    verifyMfa: (mfaToken: string, code: string) => sessionCall("/api/auth/mfa/verify", { mfaToken, code }),
    register: (data: { name: string; email: string; password: string; companyName: string }) =>
      sessionCall("/api/auth/register", data),
    switchOrganisation: (tenantId: string) => sessionCall("/api/auth/switch", { tenantId }),
    createOrganisation: (companyName: string) => sessionCall("/api/auth/organisations", { companyName }),
    acceptInvitation: (token: string, password: string, name?: string, mfaCode?: string) =>
      sessionCall("/api/auth/invitations/accept", { token, password, name, mfaCode }),

    async describeInvitation(token: string): Promise<{ organisation: string; email: string; role: string; existingUser: boolean }> {
      const res = await fetch(`/api/auth/invitations/${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "This invitation is invalid or has expired");
      return body;
    },

    async logout(): Promise<void> {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    },

    async me(): Promise<SessionResult | null> {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  },

  // Customers
  customers: {
    async list(params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    }): Promise<{ data: Customer[]; total: number }> {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.search) qs.set("search", params.search);
      // Don't send status to backend — it's derived client-side from activeSubscriptions
      const result = await apiFetch<any>(`/customers?${qs}`);
      let data = (result.data || result || []).map(mapCustomer);
      let total = result.meta?.total || 0;

      // Client-side status filtering
      if (params?.status && params.status !== "all") {
        data = data.filter((c: Customer) =>
          params.status === "active"
            ? c.activeSubscriptions > 0
            : c.activeSubscriptions === 0,
        );
        total = data.length;
      }

      return { data, total };
    },

    async get(id: string): Promise<Customer> {
      const result = await apiFetch<any>(`/customers/${id}`);
      return mapCustomer(result);
    },

    async create(data: Partial<Customer> & { netPaymentTerms?: number }): Promise<Customer> {
      const payload: any = {
        externalId: data.externalId || `ext_${Date.now()}`,
        email: data.email,
        name: data.name,
        country: data.country,
        currency: data.currency || "USD",
      };
      if (data.netPaymentTerms !== undefined) payload.netPaymentTerms = data.netPaymentTerms;
      const result = await apiFetch<any>(`/customers`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return mapCustomer(result);
    },

    async update(id: string, data: Partial<Customer> & { netPaymentTerms?: number | null }): Promise<Customer> {
      const body: any = {};
      if (data.name !== undefined) body.name = data.name;
      if (data.email !== undefined) body.email = data.email;
      if (data.country !== undefined) body.country = data.country;
      if (data.currency !== undefined) body.currency = data.currency;
      if (data.netPaymentTerms !== undefined) body.netPaymentTerms = data.netPaymentTerms;
      const result = await apiFetch<any>(`/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return mapCustomer(result);
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/customers/${id}`, { method: "DELETE" });
    },

    async getPaymentMethods(customerId: string): Promise<PaymentMethod[]> {
      const result = await apiFetch<any>(`/customers/${customerId}/payment-methods`);
      return result || [];
    },

    async deletePaymentMethod(customerId: string, methodId: string): Promise<void> {
      await apiFetch(`/customers/${customerId}/payment-methods/${methodId}`, { method: "DELETE" });
    },
  },

  // Plans
  plans: {
    async list(): Promise<Plan[]> {
      const result = await apiFetch<any>(`/plans?limit=50`);
      return (result.data || result || []).map(mapPlan);
    },

    async get(id: string): Promise<Plan> {
      const result = await apiFetch<any>(`/plans/${id}`);
      return mapPlan(result);
    },

    async create(data: Partial<Plan> & {
      billingTiming?: string;
      netPaymentTerms?: number;
      invoiceGracePeriodDays?: number;
      progressiveBillingThreshold?: number;
    }): Promise<Plan> {
      const payload: any = {
        name: data.name,
        code: data.code,
        description: data.description,
        billingInterval: (data.interval || "monthly").toUpperCase(),
        billingTiming: data.billingTiming || "IN_ARREARS",
        features: data.features,
        prices: (data.prices || []).map((p) => ({
          amount: p.amount,
          currency: p.currency,
        })),
      };
      if (data.netPaymentTerms !== undefined) payload.netPaymentTerms = data.netPaymentTerms;
      if (data.invoiceGracePeriodDays !== undefined) payload.invoiceGracePeriodDays = data.invoiceGracePeriodDays;
      if (data.progressiveBillingThreshold !== undefined) payload.progressiveBillingThreshold = data.progressiveBillingThreshold;
      const result = await apiFetch<any>(`/plans`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return mapPlan(result);
    },

    async update(id: string, data: Partial<Plan> & {
      billingTiming?: string;
      netPaymentTerms?: number | null;
      invoiceGracePeriodDays?: number | null;
      progressiveBillingThreshold?: number | null;
    }): Promise<Plan> {
      const body: any = {};
      if (data.name) body.name = data.name;
      if (data.description !== undefined) body.description = data.description;
      if (data.isActive !== undefined) body.isActive = data.isActive;
      if (data.features) body.features = data.features;
      if (data.billingTiming) body.billingTiming = data.billingTiming;
      if (data.netPaymentTerms !== undefined) body.netPaymentTerms = data.netPaymentTerms;
      if (data.invoiceGracePeriodDays !== undefined) body.invoiceGracePeriodDays = data.invoiceGracePeriodDays;
      if (data.progressiveBillingThreshold !== undefined) body.progressiveBillingThreshold = data.progressiveBillingThreshold;
      const result = await apiFetch<any>(`/plans/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return mapPlan(result);
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/plans/${id}`, { method: "DELETE" });
    },

    async addPrice(planId: string, data: { currency: string; amount: number }): Promise<any> {
      return apiFetch(`/plans/${planId}/prices`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async updatePrice(planId: string, priceId: string, amount: number): Promise<any> {
      return apiFetch(`/plans/${planId}/prices/${priceId}`, {
        method: "PATCH",
        body: JSON.stringify({ amount }),
      });
    },

    async deletePrice(planId: string, priceId: string): Promise<any> {
      return apiFetch(`/plans/${planId}/prices/${priceId}`, {
        method: "DELETE",
      });
    },
  },

  // Subscriptions
  subscriptions: {
    async list(params?: {
      page?: number;
      limit?: number;
      status?: string;
      planId?: string;
    }): Promise<{ data: Subscription[]; total: number }> {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.status && params.status !== "all") {
        qs.set(
          "status",
          params.status === "trial" ? "TRIALING" : params.status.toUpperCase(),
        );
      }
      const result = await apiFetch<any>(`/subscriptions?${qs}`);
      return {
        data: (result.data || result || []).map(mapSubscription),
        total: result.meta?.total || 0,
      };
    },

    async get(id: string): Promise<Subscription> {
      const result = await apiFetch<any>(`/subscriptions/${id}`);
      return mapSubscription(result);
    },

    async create(
      data: Partial<Subscription> & { trialDays?: number },
    ): Promise<Subscription> {
      const body: any = {
        customerId: data.customerId,
        planId: data.planId,
        currency: data.currency || "USD",
      };
      if (data.trialDays && data.trialDays > 0) {
        body.trialDays = data.trialDays;
      }
      const result = await apiFetch<any>(`/subscriptions`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return mapSubscription(result);
    },

    async update(
      id: string,
      data: Partial<Subscription>,
    ): Promise<Subscription> {
      const result = await apiFetch<any>(`/subscriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return mapSubscription(result);
    },

    async cancel(
      id: string,
      cancelAt: "now" | "period_end" = "now",
    ): Promise<Subscription> {
      const result = await apiFetch<any>(`/subscriptions/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ cancelAt }),
      });
      return mapSubscription(result);
    },

    async pause(id: string): Promise<Subscription> {
      const result = await apiFetch<any>(`/subscriptions/${id}/pause`, {
        method: "POST",
      });
      return mapSubscription(result);
    },

    async resume(id: string): Promise<Subscription> {
      const result = await apiFetch<any>(`/subscriptions/${id}/resume`, {
        method: "POST",
      });
      return mapSubscription(result);
    },

    async changePlan(id: string, planId: string): Promise<Subscription> {
      const result = await apiFetch<any>(`/subscriptions/${id}/change-plan`, {
        method: "POST",
        body: JSON.stringify({ newPlanId: planId }),
      });
      return mapSubscription(result);
    },
  },

  // Invoices
  invoices: {
    async list(params?: {
      page?: number;
      limit?: number;
      status?: string;
    }): Promise<{ data: Invoice[]; total: number }> {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.status && params.status !== "all")
        qs.set("status", params.status.toUpperCase());
      const result = await apiFetch<any>(`/invoices?${qs}`);
      return {
        data: (result.data || result || []).map(mapInvoice),
        total: result.meta?.total || 0,
      };
    },

    async get(id: string): Promise<Invoice> {
      const result = await apiFetch<any>(`/invoices/${id}`);
      return mapInvoice(result);
    },

    async create(data: Partial<Invoice>): Promise<Invoice> {
      const result = await apiFetch<any>(`/invoices`, {
        method: "POST",
        body: JSON.stringify({
          customerId: data.customerId,
          subscriptionId: data.subscriptionId,
          items: (data.lineItems || []).map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitPrice,
          })),
          dueDate: data.dueDate,
        }),
      });
      return mapInvoice(result);
    },

    async update(id: string, data: Partial<Invoice>): Promise<Invoice> {
      if (data.status === "paid") {
        const result = await apiFetch<any>(`/invoices/${id}/mark-paid`, {
          method: "POST",
          body: JSON.stringify({ paymentMethod: "manual" }),
        });
        return mapInvoice(result);
      }
      if (data.status === "canceled") {
        const result = await apiFetch<any>(`/invoices/${id}/void`, {
          method: "POST",
        });
        return mapInvoice(result);
      }
      const result = await apiFetch<any>(`/invoices/${id}/finalize`, {
        method: "POST",
      });
      return mapInvoice(result);
    },

    async markPaid(id: string, paymentMethod?: string): Promise<Invoice> {
      const result = await apiFetch<any>(`/invoices/${id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod: paymentMethod || "manual" }),
      });
      return mapInvoice(result);
    },

    async finalize(id: string): Promise<Invoice> {
      const result = await apiFetch<any>(`/invoices/${id}/finalize`, {
        method: "POST",
      });
      return mapInvoice(result);
    },

    async checkout(
      id: string,
      callbackUrl?: string,
      providerName?: string,
    ): Promise<{
      checkoutUrl: string;
      paymentId: string;
      provider: string;
      expiresAt: string;
    }> {
      return apiFetch<{
        checkoutUrl: string;
        paymentId: string;
        provider: string;
        expiresAt: string;
      }>(`/invoices/${id}/checkout`, {
        method: "POST",
        body: JSON.stringify({
          callbackUrl: callbackUrl || window.location.href,
          ...(providerName ? { providerName } : {}),
        }),
      });
    },

    getPdfUrl(id: string): string {
      return `/api/proxy/invoices/${id}/pdf`;
    },

    async sendEmail(
      id: string,
      email?: string,
    ): Promise<{ message: string }> {
      return apiFetch<{ message: string }>(`/invoices/${id}/send-email`, {
        method: "POST",
        body: JSON.stringify({ email: email || undefined }),
      });
    },
  },

  // Payments
  payments: {
    async list(params?: {
      page?: number;
      limit?: number;
      status?: string;
      provider?: string;
    }): Promise<{ data: Payment[]; total: number }> {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.status && params.status !== "all")
        qs.set("status", params.status.toUpperCase());
      const result = await apiFetch<any>(`/payments?${qs}`);
      return {
        data: (result.data || result || []).map(mapPayment),
        total: result.meta?.total || 0,
      };
    },

    async get(id: string): Promise<Payment> {
      const result = await apiFetch<any>(`/payments/${id}`);
      return mapPayment(result);
    },

    async refund(
      id: string,
      data?: { amount?: number; reason?: string; recordOnly?: boolean },
    ): Promise<Payment> {
      const result = await apiFetch<any>(`/payments/${id}/refund`, {
        method: "POST",
        body: JSON.stringify(data || {}),
      });
      return mapPayment(result);
    },
  },

  // Payment Providers
  providers: {
    async list(): Promise<PaymentProvider[]> {
      // All known providers shown at all times; configured ones override the defaults
      const ALL_PROVIDERS: PaymentProvider[] = [
        {
          id: "default_stripe",
          name: "Stripe",
          code: "stripe" as const,
          description: providerDescriptions.stripe,
          isConfigured: false,
          isActive: false,
          priority: 1,
        },
        {
          id: "default_paypal",
          name: "PayPal",
          code: "paypal" as const,
          description: providerDescriptions.paypal,
          isConfigured: false,
          isActive: false,
          priority: 2,
        },
        {
          id: "default_paystack",
          name: "Paystack",
          code: "paystack" as const,
          description: providerDescriptions.paystack,
          isConfigured: false,
          isActive: false,
          priority: 3,
        },
        {
          id: "default_flutterwave",
          name: "Flutterwave",
          code: "flutterwave" as const,
          description: providerDescriptions.flutterwave,
          isConfigured: false,
          isActive: false,
          priority: 4,
        },
        {
          id: "default_dpo",
          name: "DPO Group",
          code: "dpo" as const,
          description: providerDescriptions.dpo,
          isConfigured: false,
          isActive: false,
          priority: 5,
        },
        {
          id: "default_payu",
          name: "PayU",
          code: "payu" as const,
          description: providerDescriptions.payu,
          isConfigured: false,
          isActive: false,
          priority: 6,
        },
        {
          id: "default_pesapal",
          name: "Pesapal",
          code: "pesapal" as const,
          description: providerDescriptions.pesapal,
          isConfigured: false,
          isActive: false,
          priority: 7,
        },
        {
          id: "default_yo",
          name: "Yo! Payments",
          code: "yo" as const,
          description: providerDescriptions.yo,
          isConfigured: false,
          isActive: false,
          priority: 8,
        },
        {
          id: "default_mtn_momo",
          name: "MTN MoMo",
          code: "mtn_momo" as const,
          description: providerDescriptions.mtn_momo,
          isConfigured: false,
          isActive: false,
          priority: 9,
        },
        {
          id: "default_airtel_money",
          name: "Airtel Money",
          code: "airtel_money" as const,
          description: providerDescriptions.airtel_money,
          isConfigured: false,
          isActive: false,
          priority: 10,
        },
        {
          id: "default_nowpayments",
          name: "NOWPayments (crypto)",
          code: "nowpayments" as const,
          description: providerDescriptions.nowpayments,
          isConfigured: false,
          isActive: false,
          priority: 11,
        },
        {
          id: "default_eversend",
          name: "Eversend",
          code: "eversend" as const,
          description: providerDescriptions.eversend,
          isConfigured: false,
          isActive: false,
          priority: 12,
        },
        {
          id: "default_tron_usdt",
          name: "USDT on TRON (own wallet)",
          code: "tron_usdt" as const,
          description: providerDescriptions.tron_usdt,
          isConfigured: false,
          isActive: false,
          priority: 13,
        },
        {
          id: "default_eth_usdt",
          name: "USDT on Ethereum (own wallet)",
          code: "eth_usdt" as const,
          description: providerDescriptions.eth_usdt,
          isConfigured: false,
          isActive: false,
          priority: 14,
        },
        {
          id: "default_btc",
          name: "Bitcoin (own wallet)",
          code: "btc" as const,
          description: providerDescriptions.btc,
          isConfigured: false,
          isActive: false,
          priority: 15,
        },
        {
          id: "default_bsc_usdt",
          name: "USDT on BNB Chain (own wallet)",
          code: "bsc_usdt" as const,
          description: providerDescriptions.bsc_usdt,
          isConfigured: false,
          isActive: false,
          priority: 16,
        },
        {
          id: "default_binance_pay",
          name: "Binance Pay",
          code: "binance_pay" as const,
          description: providerDescriptions.binance_pay,
          isConfigured: false,
          isActive: false,
          priority: 17,
        },
      ];

      // The API lists every provider; the dashboard keeps its own catalogue and asks for the configured ones.
      const result = await apiFetch<any>(`/payment-providers?configured=true`);
      const configured = (result.data || result || []).map(mapProvider) as PaymentProvider[];

      // Build a map of configured providers by code for quick lookup
      const configuredByCode = new Map<string, PaymentProvider>(
        configured.map((p) => [p.code, p]),
      );

      // Merge: replace default entries with configured data, then sort so
      // configured (isConfigured=true) providers appear first, ordered by priority.
      const merged = ALL_PROVIDERS.map((def) => configuredByCode.get(def.code) ?? def);
      return merged.sort((a, b) => {
        if (a.isConfigured && !b.isConfigured) return -1;
        if (!a.isConfigured && b.isConfigured) return 1;
        return (a.priority ?? 99) - (b.priority ?? 99);
      });
    },

    async update(
      id: string,
      data: Partial<PaymentProvider>,
    ): Promise<PaymentProvider> {
      if (id.startsWith("default_")) {
        const result = await apiFetch<any>(`/payment-providers`, {
          method: "POST",
          body: JSON.stringify({
            providerName: data.code || data.name?.toLowerCase(),
            isActive: data.isActive,
            priority: data.priority || 1,
            credentials: data.config || {},
          }),
        });
        return mapProvider(result);
      }
      const body: any = {};
      if (data.isActive !== undefined) body.isActive = data.isActive;
      if (data.priority !== undefined) body.priority = data.priority;
      if (data.config) body.credentials = data.config;
      const result = await apiFetch<any>(`/payment-providers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return mapProvider(result);
    },

    async create(data: {
      providerName: string;
      credentials: Record<string, string>;
      isActive?: boolean;
      priority?: number;
    }): Promise<PaymentProvider> {
      const result = await apiFetch<any>(`/payment-providers`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return mapProvider(result);
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/payment-providers/${id}`, { method: "DELETE" });
    },

    async test(id: string): Promise<{ success: boolean; message: string }> {
      return apiFetch<{ success: boolean; message: string }>(
        `/payment-providers/${id}/test`,
        { method: "POST" },
      );
    },
  },

  // Analytics
  analytics: {
    async getRevenueData(): Promise<RevenueData[]> {
      const months: RevenueData[] = [];
      const now = new Date();

      // Fetch revenue for each of the past 6 months using date filters
      const promises = [];
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(
          now.getFullYear(),
          now.getMonth() - i + 1,
          0,
          23,
          59,
          59,
        );
        promises.push(
          apiFetch<any>(
            `/analytics/revenue?dateFrom=${start.toISOString()}&dateTo=${end.toISOString()}`,
          ).then((data) => ({
            // The local month, not toISOString's UTC one: east of UTC that is the month before.
            date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
            revenue: Number(data.totalRevenue) || 0,
            mrr: Number(data.mrr) || 0,
            oneTime: 0,
            currency: data.currency || "USD",
          })),
        );
      }

      try {
        const results = await Promise.all(promises);
        return results;
      } catch {
        // If date-filtered analytics fail, fall back to single call
        const revenue = await apiFetch<any>(`/analytics/revenue`);
        const mrr = Number(revenue.mrr) || 0;
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push({
            date: d.toISOString().slice(0, 7),
            revenue: i === 0 ? Number(revenue.totalRevenue) || 0 : 0,
            mrr: i === 0 ? mrr : 0,
            oneTime: 0,
          });
        }
        return months;
      }
    },

    async getMrrBreakdown(): Promise<{
      totalMrr: number;
      newMrr: number;
      expansionMrr: number;
      contractionMrr: number;
      churnMrr: number;
      netNewMrr: number;
      byPlan: Array<{ planId: string; planName: string; mrr: number; subscriptionCount: number }>;
    }> {
      return apiFetch("/analytics/mrr-breakdown");
    },

    async getNetRevenue(params?: { dateFrom?: string; dateTo?: string }): Promise<{
      grossRevenue: number;
      refunds: number;
      creditNotes: number;
      netRevenue: number;
    }> {
      const qs = new URLSearchParams();
      if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
      if (params?.dateTo) qs.set("dateTo", params.dateTo);
      const q = qs.toString();
      return apiFetch(`/analytics/net-revenue${q ? `?${q}` : ""}`);
    },

    async getChurnCohorts(months?: number): Promise<{
      months: string[];
      cohorts: Array<{ month: string; totalCustomers: number; retentionPercentages: number[] }>;
    }> {
      const qs = months ? `?months=${months}` : "";
      return apiFetch(`/analytics/churn-cohorts${qs}`);
    },

    async getLtv(): Promise<{
      avgLtv: number;
      avgLifespanDays: number;
      byPlan: Array<{ planId: string; planName: string; avgLtv: number; avgLifespanDays: number }>;
    }> {
      return apiFetch("/analytics/ltv");
    },

    async getKPIs(): Promise<{
      mrr: number;
      arr: number;
      mrrChange: number;
      activeSubscriptions: number;
      totalSubscriptions: number;
      subscriptionChange: number;
      totalCustomers: number;
      customerChange: number;
      successRate: number;
      successRateChange: number;
      arpu: number;
      avgLtv: number;
      avgLifespanDays: number;
      churnRate: string;
      retentionRate: string;
      /** The reporting currency every amount is in. */
      currency: string;
      ratesAsOf: string | null;
      unconverted: string[];
    }> {
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
      );

      const [kpis, lastMonthRevenue, lastMonthCustomers, lastMonthPayments] =
        await Promise.all([
          apiFetch<any>(`/analytics/kpis`),
          apiFetch<any>(
            `/analytics/revenue?dateFrom=${lastMonthStart.toISOString()}&dateTo=${lastMonthEnd.toISOString()}`,
          ).catch(() => ({ mrr: "0" })),
          apiFetch<any>(
            `/analytics/customers?dateFrom=${lastMonthStart.toISOString()}&dateTo=${lastMonthEnd.toISOString()}`,
          ).catch(() => ({ totalCustomers: 0 })),
          apiFetch<any>(
            `/analytics/payments?dateFrom=${lastMonthStart.toISOString()}&dateTo=${lastMonthEnd.toISOString()}`,
          ).catch(() => ({ totalPayments: 0, succeeded: 0 })),
        ]);

      const currentMrr = Number(kpis.mrr) || 0;
      const previousMrr = Number(lastMonthRevenue.mrr) || 0;
      const mrrChange =
        previousMrr > 0 ? ((currentMrr - previousMrr) / previousMrr) * 100 : 0;

      const currentCustomers = Number(kpis.totalCustomers) || 0;
      const previousCustomers = Number(lastMonthCustomers.totalCustomers) || 0;
      const customerChange =
        previousCustomers > 0
          ? ((currentCustomers - previousCustomers) / previousCustomers) * 100
          : 0;

      const currentSuccessRate = parseFloat(kpis.successRate) || 0;

      const lastTotalPayments = Number(lastMonthPayments.totalPayments) || 1;
      const lastSuccessfulPayments = Number(lastMonthPayments.succeeded) || 0;
      const lastSuccessRate = (lastSuccessfulPayments / lastTotalPayments) * 100;
      const successRateChange = currentSuccessRate - lastSuccessRate;

      return {
        mrr: currentMrr,
        arr: Number(kpis.arr) || currentMrr * 12,
        mrrChange: Math.round(mrrChange * 10) / 10,
        activeSubscriptions: Number(kpis.activeSubscriptions) || 0,
        totalSubscriptions: Number(kpis.totalSubscriptions) || 0,
        subscriptionChange: 0,
        totalCustomers: currentCustomers,
        customerChange: Math.round(customerChange * 10) / 10,
        successRate: currentSuccessRate,
        successRateChange: Math.round(successRateChange * 10) / 10,
        arpu: Number(kpis.arpu) || 0,
        avgLtv: Number(kpis.avgLtv) || 0,
        avgLifespanDays: Number(kpis.avgLifespanDays) || 0,
        churnRate: kpis.churnRate || "0.00%",
        retentionRate: kpis.retentionRate || "100.00%",
        currency: kpis.currency || "USD",
        ratesAsOf: kpis.ratesAsOf ?? null,
        unconverted: kpis.unconverted ?? [],
      };
    },
  },

  // Activity (synthesized from recent events)
  activity: {
    async list(limit: number = 10): Promise<ActivityEvent[]> {
      const events: ActivityEvent[] = [];

      try {
        const [payments, subscriptions, invoices] = await Promise.all([
          apiFetch<any>(`/payments?limit=${limit}&page=1`),
          apiFetch<any>(`/subscriptions?limit=${limit}&page=1`),
          apiFetch<any>(`/invoices?limit=${limit}&page=1`),
        ]);

        for (const p of payments.data || payments || []) {
          const status = (p.status || "").toLowerCase();
          events.push({
            id: `payment_${p.id}`,
            type:
              status === "succeeded" ? "payment.succeeded" : "payment.failed",
            description: `Payment of ${Number(p.amount).toLocaleString()} ${p.currency || "USD"} ${status === "succeeded" ? "succeeded" : "failed"}`,
            entityId: p.id,
            entityType: "payment",
            createdAt: p.createdAt,
          });
        }

        for (const s of subscriptions.data || subscriptions || []) {
          events.push({
            id: `sub_${s.id}`,
            type: "subscription.created",
            description: `${s.customer?.name || "Customer"} subscribed to ${s.plan?.name || "plan"}`,
            entityId: s.id,
            entityType: "subscription",
            createdAt: s.createdAt,
          });
        }

        for (const inv of invoices.data || invoices || []) {
          const status = (inv.status || "").toLowerCase();
          events.push({
            id: `inv_${inv.id}`,
            type: status === "paid" ? "invoice.paid" : "invoice.created",
            description: `Invoice INV-${inv.id.slice(-8).toUpperCase()} ${status === "paid" ? "paid" : "created"} for ${Number(inv.amount).toLocaleString()} ${inv.currency || "USD"}`,
            entityId: inv.id,
            entityType: "invoice",
            createdAt: inv.createdAt,
          });
        }
      } catch (e) {
        console.error("Failed to load activity:", e);
      }

      events.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return events.slice(0, limit);
    },
  },

  // Tenant (settings) — uses JWT auth via proxy
  tenant: {
    async getProfile(): Promise<any> {
      return apiFetch<any>(`/tenants/me`);
    },

    async updateProfile(data: any): Promise<any> {
      return apiFetch<any>(`/tenants/me`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
  },

  // Coupons
  coupons: {
    async list(params?: {
      isActive?: boolean;
      page?: number;
      limit?: number;
    }): Promise<{ data: Coupon[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.isActive !== undefined)
        query.set("isActive", String(params.isActive));
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      const res = await apiFetch<any>(`/coupons${qs ? `?${qs}` : ""}`);
      return { data: res.data || res, meta: res.meta || {} };
    },

    async get(id: string): Promise<Coupon> {
      return apiFetch<Coupon>(`/coupons/${id}`);
    },

    async create(data: {
      code: string;
      name: string;
      description?: string;
      discountType: "PERCENTAGE" | "FIXED_AMOUNT";
      discountValue: number;
      currency?: string;
      maxRedemptions?: number;
      appliesToPlanIds?: string[];
      expiresAt?: string;
    }): Promise<Coupon> {
      return apiFetch<Coupon>("/coupons", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: {
        name?: string;
        description?: string;
        isActive?: boolean;
        expiresAt?: string;
      },
    ): Promise<Coupon> {
      return apiFetch<Coupon>(`/coupons/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/coupons/${id}`, { method: "DELETE" });
    },

    async apply(data: {
      couponId: string;
      customerId: string;
      subscriptionId?: string;
      usesRemaining?: number;
    }): Promise<any> {
      return apiFetch("/coupons/apply", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  },

  // Add-Ons
  addOns: {
    async list(params?: {
      page?: number;
      limit?: number;
    }): Promise<{ data: AddOn[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      const res = await apiFetch<any>(`/add-ons${qs ? `?${qs}` : ""}`);
      return { data: res.data || res, meta: res.meta || {} };
    },

    async get(id: string): Promise<AddOn> {
      return apiFetch<AddOn>(`/add-ons/${id}`);
    },

    async create(data: {
      name: string;
      code: string;
      description?: string;
      invoiceDisplayName?: string;
      prices: { currency: string; amount: number }[];
    }): Promise<AddOn> {
      return apiFetch<AddOn>("/add-ons", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: {
        name?: string;
        description?: string;
        invoiceDisplayName?: string;
        prices?: { currency: string; amount: number }[];
      },
    ): Promise<AddOn> {
      return apiFetch<AddOn>(`/add-ons/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/add-ons/${id}`, { method: "DELETE" });
    },

    async apply(data: {
      addOnId: string;
      customerId: string;
      subscriptionId?: string;
      amount: number;
      currency: string;
    }): Promise<any> {
      return apiFetch("/add-ons/apply", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  },

  // Credit Notes
  creditNotes: {
    async list(params?: {
      customerId?: string;
      invoiceId?: string;
      status?: string;
      page?: number;
      limit?: number;
    }): Promise<{ data: CreditNote[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.customerId) query.set("customerId", params.customerId);
      if (params?.invoiceId) query.set("invoiceId", params.invoiceId);
      if (params?.status) query.set("status", params.status);
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      const res = await apiFetch<any>(`/credit-notes${qs ? `?${qs}` : ""}`);
      return { data: res.data || res, meta: res.meta || {} };
    },

    async get(id: string): Promise<CreditNote> {
      return apiFetch<CreditNote>(`/credit-notes/${id}`);
    },

    async create(data: {
      invoiceId: string;
      customerId: string;
      amount: number;
      currency: string;
      reason: "DUPLICATE" | "PRODUCT_UNSATISFACTORY" | "ORDER_CHANGE" | "OTHER";
      metadata?: Record<string, unknown>;
    }): Promise<CreditNote> {
      return apiFetch<CreditNote>("/credit-notes", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: {
        amount?: number;
        reason?: string;
        metadata?: Record<string, unknown>;
      },
    ): Promise<CreditNote> {
      return apiFetch<CreditNote>(`/credit-notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async finalize(id: string): Promise<CreditNote> {
      return apiFetch<CreditNote>(`/credit-notes/${id}/finalize`, {
        method: "POST",
      });
    },

    async void(id: string): Promise<CreditNote> {
      return apiFetch<CreditNote>(`/credit-notes/${id}/void`, {
        method: "POST",
      });
    },
  },

  // Billable Metrics
  billableMetrics: {
    async list(): Promise<BillableMetric[]> {
      const res = await apiFetch<any>("/billable-metrics");
      return Array.isArray(res) ? res : res.data || [];
    },

    async get(id: string): Promise<BillableMetric> {
      return apiFetch<BillableMetric>(`/billable-metrics/${id}`);
    },

    async create(data: {
      name: string;
      code: string;
      description?: string;
      aggregationType: string;
      fieldName?: string;
      recurring?: boolean;
      filters?: { key: string; values: string[] }[];
    }): Promise<BillableMetric> {
      return apiFetch<BillableMetric>("/billable-metrics", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: {
        name?: string;
        description?: string;
        fieldName?: string;
        recurring?: boolean;
        filters?: { key: string; values: string[] }[];
      },
    ): Promise<BillableMetric> {
      return apiFetch<BillableMetric>(`/billable-metrics/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/billable-metrics/${id}`, { method: "DELETE" });
    },
  },

  // Usage Events
  events: {
    async create(data: {
      transactionId: string;
      subscriptionId: string;
      code: string;
      timestamp?: string;
      properties?: Record<string, any>;
    }): Promise<UsageEvent> {
      return apiFetch<UsageEvent>("/events", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async createBatch(events: {
      transactionId: string;
      subscriptionId: string;
      code: string;
      timestamp?: string;
      properties?: Record<string, any>;
    }[]): Promise<any> {
      return apiFetch("/events/batch", {
        method: "POST",
        body: JSON.stringify({ events }),
      });
    },

    async get(id: string): Promise<UsageEvent> {
      return apiFetch<UsageEvent>(`/events/${id}`);
    },

    async listBySubscription(
      subscriptionId: string,
      params?: { code?: string; from?: string; to?: string; page?: number; perPage?: number },
    ): Promise<{ data: UsageEvent[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.code) query.set("code", params.code);
      if (params?.from) query.set("from", params.from);
      if (params?.to) query.set("to", params.to);
      if (params?.page) query.set("page", String(params.page));
      if (params?.perPage) query.set("perPage", String(params.perPage));
      const qs = query.toString();
      return apiFetch<{ data: UsageEvent[]; meta: any }>(
        `/events/subscription/${subscriptionId}${qs ? `?${qs}` : ""}`,
      );
    },
  },

  // Charges
  charges: {
    async list(planId?: string): Promise<Charge[]> {
      const qs = planId ? `?planId=${planId}` : "";
      const res = await apiFetch<any>(`/charges${qs}`);
      return Array.isArray(res) ? res : res.data || [];
    },

    async get(id: string): Promise<Charge> {
      return apiFetch<Charge>(`/charges/${id}`);
    },

    async listByPlan(planId: string): Promise<Charge[]> {
      const res = await apiFetch<any>(`/charges/plan/${planId}`);
      return Array.isArray(res) ? res : res.data || [];
    },

    async create(data: {
      planId: string;
      billableMetricId: string;
      chargeModel: string;
      billingTiming?: string;
      invoiceDisplayName?: string;
      minAmountCents?: number;
      prorated?: boolean;
      properties?: Record<string, any>;
      graduatedRanges?: { fromValue: number; toValue?: number; perUnitAmount: number; flatAmount?: number }[];
      filters?: { key: string; values: string[]; properties?: Record<string, any> }[];
    }): Promise<Charge> {
      return apiFetch<Charge>("/charges", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: {
        billingTiming?: string;
        invoiceDisplayName?: string;
        minAmountCents?: number;
        prorated?: boolean;
        properties?: Record<string, any>;
        graduatedRanges?: { fromValue: number; toValue?: number; perUnitAmount: number; flatAmount?: number }[];
        filters?: { key: string; values: string[]; properties?: Record<string, any> }[];
      },
    ): Promise<Charge> {
      return apiFetch<Charge>(`/charges/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/charges/${id}`, { method: "DELETE" });
    },
  },

  // Wallets
  wallets: {
    async list(params?: {
      customerId?: string;
      status?: string;
      page?: number;
      limit?: number;
    }): Promise<{ data: Wallet[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.customerId) query.set("customerId", params.customerId);
      if (params?.status) query.set("status", params.status);
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      const res = await apiFetch<any>(`/wallets${qs ? `?${qs}` : ""}`);
      const data = (res.data || res || []).map((w: any) => ({
        ...w,
        rateAmount: Number(w.rateAmount) || 1,
        creditsBalance: Number(w.creditsBalance) || 0,
        balance: Number(w.balance) || 0,
        consumedCredits: Number(w.consumedCredits) || 0,
        consumedAmount: Number(w.consumedAmount) || 0,
      }));
      return { data, meta: res.meta || {} };
    },

    async get(id: string): Promise<Wallet> {
      const w = await apiFetch<any>(`/wallets/${id}`);
      return {
        ...w,
        rateAmount: Number(w.rateAmount) || 1,
        creditsBalance: Number(w.creditsBalance) || 0,
        balance: Number(w.balance) || 0,
        consumedCredits: Number(w.consumedCredits) || 0,
        consumedAmount: Number(w.consumedAmount) || 0,
      };
    },

    async create(data: {
      customerId: string;
      name?: string;
      currency: string;
      rateAmount?: number;
      paidCredits?: number;
      grantedCredits?: number;
      expirationAt?: string;
    }): Promise<Wallet> {
      return apiFetch<Wallet>("/wallets", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: { name?: string; expirationAt?: string; metadata?: Record<string, unknown> },
    ): Promise<Wallet> {
      return apiFetch<Wallet>(`/wallets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async terminate(id: string): Promise<Wallet> {
      return apiFetch<Wallet>(`/wallets/${id}`, { method: "DELETE" });
    },

    async topUp(data: {
      walletId: string;
      paidCredits?: number;
      grantedCredits?: number;
      voidedCredits?: number;
    }): Promise<{ transactions: WalletTransaction[]; wallet: Wallet }> {
      return apiFetch("/wallets/transactions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async listTransactions(
      walletId: string,
      params?: {
        status?: string;
        transactionStatus?: string;
        transactionType?: string;
        page?: number;
        limit?: number;
      },
    ): Promise<{ data: WalletTransaction[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.transactionStatus) query.set("transactionStatus", params.transactionStatus);
      if (params?.transactionType) query.set("transactionType", params.transactionType);
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      const res = await apiFetch<any>(
        `/wallets/${walletId}/transactions${qs ? `?${qs}` : ""}`,
      );
      return { data: res.data || res, meta: res.meta || {} };
    },
  },

  // Taxes
  taxes: {
    async list(params?: {
      page?: number;
      limit?: number;
    }): Promise<{ data: Tax[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      const res = await apiFetch<any>(`/taxes${qs ? `?${qs}` : ""}`);
      const data = (res.data || res || []).map((t: any) => ({
        ...t,
        rate: Number(t.rate) || 0,
      }));
      return { data, meta: res.meta || {} };
    },

    async get(id: string): Promise<Tax> {
      const t = await apiFetch<any>(`/taxes/${id}`);
      return { ...t, rate: Number(t.rate) || 0 };
    },

    async create(data: {
      name: string;
      code: string;
      rate: number;
      description?: string;
      appliedByDefault?: boolean;
    }): Promise<Tax> {
      return apiFetch<Tax>("/taxes", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: {
        name?: string;
        rate?: number;
        description?: string;
        appliedByDefault?: boolean;
      },
    ): Promise<Tax> {
      return apiFetch<Tax>(`/taxes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/taxes/${id}`, { method: "DELETE" });
    },
  },

  planOverrides: {
    async list(params?: {
      customerId?: string;
      planId?: string;
      page?: number;
      limit?: number;
    }): Promise<{ data: PlanOverride[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.customerId) query.set("customerId", params.customerId);
      if (params?.planId) query.set("planId", params.planId);
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      return apiFetch<any>(`/plan-overrides${qs ? `?${qs}` : ""}`);
    },

    async get(id: string): Promise<PlanOverride> {
      return apiFetch<PlanOverride>(`/plan-overrides/${id}`);
    },

    async create(data: {
      customerId: string;
      planId: string;
      overriddenPrices?: Array<{ currency: string; amount: number }>;
      overriddenMinimumCommitment?: number;
      overriddenCharges?: Array<{
        chargeId: string;
        properties?: Record<string, unknown>;
      }>;
      metadata?: Record<string, unknown>;
    }): Promise<PlanOverride> {
      return apiFetch<PlanOverride>("/plan-overrides", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async update(
      id: string,
      data: {
        overriddenPrices?: Array<{ currency: string; amount: number }>;
        overriddenMinimumCommitment?: number;
        overriddenCharges?: Array<{
          chargeId: string;
          properties?: Record<string, unknown>;
        }>;
        metadata?: Record<string, unknown>;
      },
    ): Promise<PlanOverride> {
      return apiFetch<PlanOverride>(`/plan-overrides/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/plan-overrides/${id}`, { method: "DELETE" });
    },
  },

  // Webhook Logs
  webhookLogs: {
    async list(params?: {
      direction?: "inbound" | "outbound";
      page?: number;
      limit?: number;
    }): Promise<{ data: WebhookLog[]; meta: any }> {
      const query = new URLSearchParams();
      if (params?.direction) query.set("direction", params.direction);
      if (params?.page) query.set("page", String(params.page));
      if (params?.limit) query.set("limit", String(params.limit));
      const qs = query.toString();
      return apiFetch<any>(`/tenants/me/webhook-logs${qs ? `?${qs}` : ""}`);
    },
  },
};
