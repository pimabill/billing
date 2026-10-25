import { PlanLimits } from '../../common/guards/plan-limits';
import { isSandbox } from '../../config/sandbox';

/**
 * The hosted cloud's plans. Their prices live as ordinary plans in the
 * operator organisation's own billing (edit them there, under Plans); the
 * limits each tier grants live here. Every organisation starts on Free.
 *
 * Priced for African businesses first. Zoho Books in Kenya is KSh 999-1,999
 * a month and Akaunting about $5; billing tools priced for the US (Chargebee
 * ~$599, Zoho Billing $39-79, Stripe Billing 0.7% of volume) are out of reach.
 * Most of the cloud's income is the managed payments fee, so Free is
 * generous and Growth is priced like a phone bundle, not a US subscription.
 */
export type CloudTier = 'free' | 'growth' | 'enterprise' | 'partner';

export const CLOUD_TIERS: Record<CloudTier, { name: string; limits: PlanLimits }> = {
  free: { name: 'Free', limits: { customers: 1000, activeSubscriptions: 1000, invoicesPerMonth: 2500, teamMembers: 5 } },
  // Absent limits are unlimited.
  growth: { name: 'Growth', limits: {} },
  // Priced per customer and invoiced by the operator; no public price. Set by the operator.
  enterprise: { name: 'Enterprise', limits: {} },
  // Cybroid's own products and partners: unlimited, never billed. Set by the operator.
  partner: { name: 'Partner', limits: {} },
};

/** Not sold through checkout: the operator puts an organisation on these from the control panel. */
export const PARTNER_CODE = 'cloud_partner';
export const ENTERPRISE_CODE = 'cloud_enterprise';
const OPERATOR_SET: Record<string, CloudTier> = { [PARTNER_CODE]: 'partner', [ENTERPRISE_CODE]: 'enterprise' };

/**
 * Growth's monthly price in every currency Flutterwave takes, about $15 each,
 * rounded to amounts that read naturally locally. The year is ten months.
 */
export const GROWTH_MONTHLY: Record<string, number> = {
  UGX: 55000,
  KES: 1900,
  TZS: 38000,
  RWF: 20000,
  NGN: 22000,
  GHS: 180,
  ZAR: 270,
  XAF: 9000,
  XOF: 9000,
  ZMW: 380,
  MWK: 26000,
  EGP: 720,
  USD: 15,
  EUR: 14,
  GBP: 12,
};

/** The $10 prices Growth launched with, kept so plans still on them move to the current ones. */
const GROWTH_MONTHLY_V2: Record<string, number> = { UGX: 35000, KES: 1250, TZS: 25000, RWF: 13000, NGN: 15000, GHS: 120, ZAR: 180, XAF: 6000, XOF: 6000, ZMW: 250, MWK: 17000, EGP: 480, USD: 10, EUR: 9, GBP: 8 };
const times = (prices: Record<string, number>, months: number) => Object.fromEntries(Object.entries(prices).map(([c, a]) => [c, a * months]));
const priced = (months: number) => Object.entries(GROWTH_MONTHLY).map(([currency, amount]) => ({ currency, amount: amount * months }));

export interface CloudPlanDefinition {
  code: string;
  tier: CloudTier;
  name: string;
  description: string;
  interval: 'MONTHLY' | 'YEARLY';
  prices: { currency: string; amount: number }[];
  features: string[];
}

export const CLOUD_CATALOGUE: CloudPlanDefinition[] = [
  {
    code: 'cloud_free',
    tier: 'free',
    name: 'Free',
    description: 'Everything you need to run your billing, free for as long as you stay within the limits.',
    interval: 'MONTHLY',
    prices: priced(0),
    features: ['1,000 customers', '1,000 active subscriptions', '2,500 invoices a month', '5 team members', 'Every feature, including managed payments', 'Community support'],
  },
  {
    code: 'cloud_growth_monthly',
    tier: 'growth',
    name: 'Growth',
    description: 'No limits on customers, subscriptions, invoices or team, with priority support.',
    interval: 'MONTHLY',
    prices: priced(1),
    features: ['Unlimited customers and subscriptions', 'Unlimited invoices', 'Unlimited team members', 'Every feature, including managed payments', 'Priority support'],
  },
  {
    code: 'cloud_growth_yearly',
    tier: 'growth',
    name: 'Growth (yearly)',
    description: 'Growth paid yearly: two months free.',
    interval: 'YEARLY',
    prices: priced(10),
    features: ['Everything in Growth', 'Two months free'],
  },
];

/**
 * Earlier catalogue prices. A plan still carrying one of these was never
 * changed by the operator, so it is brought up to the current catalogue;
 * a plan with any other prices was edited in the operator's billing and is kept.
 */
export const SUPERSEDED_PRICES: Record<string, Record<string, number>[]> = {
  cloud_free: [{ UGX: 0, USD: 0 }],
  cloud_growth_monthly: [{ UGX: 110000, USD: 29 }, times(GROWTH_MONTHLY_V2, 1)],
  cloud_growth_yearly: [{ UGX: 1100000, USD: 290 }, times(GROWTH_MONTHLY_V2, 10)],
};

/** Earlier tiers' limits: organisations still on them move to the current ones; limits the operator set by hand are kept. */
export const SUPERSEDED_LIMITS: Partial<Record<CloudTier, PlanLimits[]>> = {
  free: [{ customers: 100, activeSubscriptions: 100, invoicesPerMonth: 300, teamMembers: 2 }],
  growth: [{ customers: 5000, activeSubscriptions: 5000, invoicesPerMonth: 10000, teamMembers: 10 }],
};

export const tierOf = (code: string | null | undefined): CloudTier | null =>
  (code && OPERATOR_SET[code]) || (CLOUD_CATALOGUE.find((p) => p.code === code)?.tier ?? null);
export const PAID_CODES = CLOUD_CATALOGUE.filter((p) => p.tier === 'growth').map((p) => p.code);

/**
 * On when this deployment is the hosted cloud: CLOUD_PLANS=true, or managed
 * payments configured. Off by default in the sandbox, which never charges.
 */
export function cloudPlansEnabled(): boolean {
  if (process.env.CLOUD_PLANS) return process.env.CLOUD_PLANS === 'true';
  if (isSandbox()) return false;
  return Boolean(process.env.MANAGED_PAYMENTS_URL && process.env.MANAGED_PAYMENTS_API_KEY);
}
