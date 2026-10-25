import { apiFetch } from "./client";

export interface CloudPlanOption {
  code: string;
  tier: "free" | "growth";
  name: string;
  description: string | null;
  interval: "MONTHLY" | "YEARLY" | string;
  prices: { currency: string; amount: string }[];
  features: unknown;
}

export interface PlanStatus {
  enabled: boolean;
  plan: { code: string | null; name: string | null; tier: "free" | "growth" | null; status: string | null; limits: Record<string, unknown> | null };
  usage: Record<"customers" | "activeSubscriptions" | "invoicesPerMonth" | "teamMembers", number>;
  subscription: { plan: string; status: string; paidThrough: string | null; cancelAt: string | null; openInvoice: { id: string; amount: string; currency: string } | null } | null;
  plans: CloudPlanOption[];
}

export const planApi = {
  status: () => apiFetch<PlanStatus>("/tenants/me/plan"),
  checkout: (plan: string, currency: string) =>
    apiFetch<{ url: string }>("/tenants/me/plan/checkout", { method: "POST", body: JSON.stringify({ plan, currency }) }),
  sync: () => apiFetch<PlanStatus>("/tenants/me/plan/sync", { method: "POST" }),
  cancel: () => apiFetch<PlanStatus>("/tenants/me/plan/cancel", { method: "POST" }),
};
