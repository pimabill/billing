import { HttpException, HttpStatus } from '@nestjs/common';

/** What an organisation's plan allows. Absent keys are unlimited. */
export interface PlanLimits {
  customers?: number;
  activeSubscriptions?: number;
  /** Invoices created this calendar month (UTC); only manual creation is refused, renewals still run. */
  invoicesPerMonth?: number;
  /** People plus pending invitations. */
  teamMembers?: number;
  /** Features the plan leaves out, refused for reads and writes alike. */
  disabledFeatures?: PlanFeature[];
}

export const COUNTED = ['customers', 'activeSubscriptions', 'invoicesPerMonth', 'teamMembers'] as const;
export type Counted = (typeof COUNTED)[number];

/** Features a plan can leave out, by the routes that make them up. */
export const FEATURE_ROUTES = {
  usage_billing: ['/events', '/billable-metrics'],
  // Before money_movement: the first matching prefix decides.
  managed_payments: ['/money/managed'],
  money_movement: ['/money', '/collections', '/payouts', '/transfers'],
  wallets: ['/wallets'],
  ledger: ['/ledger'],
} as const;
export type PlanFeature = keyof typeof FEATURE_ROUTES;

const FEATURE_LABELS: Record<PlanFeature, string> = {
  usage_billing: 'Usage billing',
  money_movement: 'Money movement',
  wallets: 'Wallets',
  ledger: 'The ledger',
  managed_payments: 'Managed payments',
};

/** Creating one of these counts against a limit. */
const COUNTED_ROUTES: Record<string, Counted> = {
  '/customers': 'customers',
  '/subscriptions': 'activeSubscriptions',
  '/invoices': 'invoicesPerMonth',
  '/team/invitations': 'teamMembers',
};

const COUNTED_LABELS: Record<Counted, string> = {
  customers: 'customers',
  activeSubscriptions: 'active subscriptions',
  invoicesPerMonth: 'invoices this month',
  teamMembers: 'team members',
};

/**
 * The route without the global prefix, query string or trailing slashes,
 * lowercased and decoded: Express matches routes case-insensitively, so
 * `/api/Customers` must count as `/customers`.
 */
export function routeOf(path: string): string {
  let route = path.split('?')[0].split('#')[0];
  try {
    route = decodeURIComponent(route);
  } catch {
    // Malformed escapes: match on the raw path.
  }
  return route
    .toLowerCase()
    .replace(/\/{2,}/g, '/')
    .replace(/^\/api(?=\/)/, '')
    .replace(/\/+$/, '');
}

export function featureOf(route: string): PlanFeature | undefined {
  return (Object.keys(FEATURE_ROUTES) as PlanFeature[]).find((f) =>
    FEATURE_ROUTES[f].some((prefix) => route === prefix || route.startsWith(`${prefix}/`)),
  );
}

/** The limit a request would use up, if any. */
export function countedBy(method: string, route: string): Counted | undefined {
  return method === 'POST' ? COUNTED_ROUTES[route] : undefined;
}

/** Whether a request might be limited at all, so most requests skip the lookup. */
export function mayBeLimited(method: string, route: string): boolean {
  return Boolean(countedBy(method, route) || featureOf(route));
}

export class PlanLimitException extends HttpException {
  constructor(message: string, plan: { planName?: string | null; manageUrl?: string | null }) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'PLAN_LIMIT',
        message,
        ...(plan.planName && { plan: plan.planName }),
        ...(plan.manageUrl && { upgradeUrl: plan.manageUrl }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/** Refuses a request the plan does not allow; `count` reads current usage only when a limit applies. */
export async function assertPlanAllows(
  plan: { limits: PlanLimits | null; planName?: string | null; manageUrl?: string | null },
  method: string,
  route: string,
  count: (what: Counted) => Promise<number>,
): Promise<void> {
  const limits = plan.limits;
  if (!limits) return;
  const name = plan.planName ? `the ${plan.planName} plan` : 'your plan';

  const feature = featureOf(route);
  if (feature && limits.disabledFeatures?.includes(feature)) {
    throw new PlanLimitException(`${FEATURE_LABELS[feature]} is not included in ${name}.`, plan);
  }

  const counted = countedBy(method, route);
  const max = counted ? limits[counted] : undefined;
  if (counted && typeof max === 'number' && (await count(counted)) >= max) {
    throw new PlanLimitException(`${name[0].toUpperCase()}${name.slice(1)} allows up to ${max} ${COUNTED_LABELS[counted]}.`, plan);
  }
}

/** Keeps only known keys with sensible values, so stored limits are always well formed. */
export function parseLimits(value: unknown): PlanLimits | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const limits: PlanLimits = {};
  for (const key of COUNTED) {
    const n = input[key];
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0) limits[key] = n;
  }
  if (Array.isArray(input.disabledFeatures)) {
    const features = input.disabledFeatures.filter((f): f is PlanFeature => typeof f === 'string' && f in FEATURE_ROUTES);
    if (features.length) limits.disabledFeatures = [...new Set(features)];
  }
  return Object.keys(limits).length ? limits : null;
}

type CentralClient = {
  tenantBilling: { findUnique(args: { where: { tenantId: string }; select: { limits: true; planName: true; manageUrl: true } }): Promise<{ limits: unknown; planName: string | null; manageUrl: string | null } | null> };
  membership: { count(args: { where: { tenantId: string } }): Promise<number> };
  invitation: { count(args: { where: { tenantId: string; acceptedAt: null; expiresAt: { gt: Date } } }): Promise<number> };
};
type TenantClient = {
  customer: { count(): Promise<number> };
  subscription: { count(args: { where: { status: { in: string[] } } }): Promise<number> };
  invoice: { count(args: { where: { createdAt: { gte: Date } } }): Promise<number> };
};

export interface TenantPlan {
  limits: PlanLimits | null;
  planName: string | null;
  manageUrl: string | null;
}

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; plan: TenantPlan }>();

/** The organisation's plan, cached briefly: limits change rarely and this sits on the request path. */
export async function loadPlan(central: CentralClient, tenantId: string, now = Date.now()): Promise<TenantPlan> {
  const hit = cache.get(tenantId);
  if (hit && now - hit.at < CACHE_MS) return hit.plan;
  const row = await central.tenantBilling.findUnique({ where: { tenantId }, select: { limits: true, planName: true, manageUrl: true } });
  const plan = { limits: parseLimits(row?.limits), planName: row?.planName ?? null, manageUrl: row?.manageUrl ?? null };
  cache.set(tenantId, { at: now, plan });
  return plan;
}

/** Drop a cached plan once it changes, so new limits apply at once on this instance. */
export function forgetPlan(tenantId: string): void {
  cache.delete(tenantId);
}

export function usageCounter(central: CentralClient, db: TenantClient, tenantId: string, now = new Date()) {
  return async (what: Counted): Promise<number> => {
    switch (what) {
      case 'customers':
        return db.customer.count();
      case 'activeSubscriptions':
        return db.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED'] } } });
      case 'invoicesPerMonth':
        return db.invoice.count({ where: { createdAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } } });
      case 'teamMembers': {
        const [members, pending] = await Promise.all([
          central.membership.count({ where: { tenantId } }),
          central.invitation.count({ where: { tenantId, acceptedAt: null, expiresAt: { gt: now } } }),
        ]);
        return members + pending;
      }
    }
  };
}
