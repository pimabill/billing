import { PlanLimits } from '../../common/guards/plan-limits';

/**
 * The hosted cloud's plans. Their prices live as ordinary plans in the
 * operator organisation's own billing (edit them there, under Plans); the
 * limits each tier grants live here. Every organisation starts on Free.
 *
 * Priced against Lago (no free cloud tier), Chargebee (free to ~$250K of
 * billing, then ~$599/month), Stripe Billing (0.7% of volume) and Zoho
 * Billing ($39/$79 a month): Growth is well below them, in local currency
 * as well as dollars, so a growing business in East Africa can afford it.
 */
export type CloudTier = 'free' | 'growth';

export const CLOUD_TIERS: Record<CloudTier, { name: string; limits: PlanLimits }> = {
  free: { name: 'Free', limits: { customers: 100, activeSubscriptions: 100, invoicesPerMonth: 300, teamMembers: 2 } },
  growth: { name: 'Growth', limits: { customers: 5000, activeSubscriptions: 5000, invoicesPerMonth: 10000, teamMembers: 10 } },
};

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
    description: 'Everything you need to start billing, free for as long as you stay within the limits.',
    interval: 'MONTHLY',
    prices: [
      { currency: 'UGX', amount: 0 },
      { currency: 'USD', amount: 0 },
    ],
    features: ['100 customers', '100 active subscriptions', '300 invoices a month', '2 team members', 'Every feature, including managed payments', 'Community support'],
  },
  {
    code: 'cloud_growth_monthly',
    tier: 'growth',
    name: 'Growth',
    description: 'For businesses billing every month: higher limits and priority support.',
    interval: 'MONTHLY',
    prices: [
      { currency: 'UGX', amount: 110000 },
      { currency: 'USD', amount: 29 },
    ],
    features: ['5,000 customers', '5,000 active subscriptions', '10,000 invoices a month', '10 team members', 'Every feature, including managed payments', 'Priority email support'],
  },
  {
    code: 'cloud_growth_yearly',
    tier: 'growth',
    name: 'Growth (yearly)',
    description: 'Growth paid yearly: two months free.',
    interval: 'YEARLY',
    prices: [
      { currency: 'UGX', amount: 1100000 },
      { currency: 'USD', amount: 290 },
    ],
    features: ['Everything in Growth', 'Two months free'],
  },
];

export const tierOf = (code: string | null | undefined): CloudTier | null => CLOUD_CATALOGUE.find((p) => p.code === code)?.tier ?? null;
export const PAID_CODES = CLOUD_CATALOGUE.filter((p) => p.tier !== 'free').map((p) => p.code);

/** On when this deployment is the hosted cloud: CLOUD_PLANS=true, or managed payments configured. */
export function cloudPlansEnabled(): boolean {
  if (process.env.CLOUD_PLANS) return process.env.CLOUD_PLANS === 'true';
  return Boolean(process.env.MANAGED_PAYMENTS_URL && process.env.MANAGED_PAYMENTS_API_KEY);
}
