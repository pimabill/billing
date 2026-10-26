import { BadRequestException, ForbiddenException, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { TenantDatabaseService } from '../../database/tenant-database.service';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { CronLockService } from '../../common/scheduling/cron-lock.service';
import { COUNTED, forgetPlan, parseLimits, PlanLimits, usageCounter } from '../../common/guards/plan-limits';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { InvoicesService } from '../invoices/invoices.service';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { isSandbox } from '../../config/sandbox';
import { CLOUD_CATALOGUE, CLOUD_TIERS, cloudPlansEnabled, CloudTier, ENTERPRISE_CODE, PAID_CODES, PARTNER_CODE, SUPERSEDED_LIMITS, SUPERSEDED_PRICES, tierOf } from './cloud-plans.catalogue';

const DAY = 86_400_000;
/** A Growth plan stays on this long after its paid period while the renewal is unpaid. */
const GRACE_DAYS = 7;
const LIVE_SUBSCRIPTION = ['ACTIVE', 'PAST_DUE', 'TRIALING'] as const;
const OPEN_INVOICE = ['DRAFT', 'PENDING', 'FAILED'] as const;

/**
 * The hosted cloud bills its organisations with its own product: the cloud
 * plans are plans in the operator organisation's billing, each organisation
 * is a customer there (its id as the external id), and paying the Growth
 * invoice (by checkout through managed payments) moves the organisation onto
 * Growth. Everyone else is on Free. Only on the hosted cloud (see
 * cloudPlansEnabled); self-hosted deployments have no plans or limits.
 */
@Injectable()
export class CloudPlansService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CloudPlansService.name);
  private operatorId: string | null = null;
  private running = false;

  constructor(
    private readonly central: CentralPrismaService,
    private readonly tenantDb: TenantDatabaseService,
    private readonly subscriptions: SubscriptionsService,
    private readonly invoices: InvoicesService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly cronLock?: CronLockService,
  ) {}

  get enabled(): boolean {
    return cloudPlansEnabled();
  }

  onApplicationBootstrap() {
    if (!this.enabled) return;
    // In the background: startup must not wait on the operator's database. The
    // API and the workers start together; one of them sets up the plans.
    const setup = () => (this.cronLock ? this.cronLock.runExclusive('cloud-plans-bootstrap', 2 * 60_000, () => this.run()) : this.run());
    setTimeout(() => void setup().catch((e) => this.logger.warn(`Cloud plans setup failed: ${e instanceof Error ? e.message : e}`)), 5_000).unref();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduled(): Promise<void> {
    if (!this.enabled) return;
    if (!this.cronLock) return void (await this.run());
    await this.cronLock.runExclusive('cloud-plans', 9 * 60_000, () => this.run());
  }

  /** Make sure the plans exist, put new organisations on Free, and follow payments. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ensureCatalogue();
      await this.assignFree();
      await this.refreshLimits();
      const db = await this.operatorDb();
      const customers = await db.customer.findMany({
        where: { subscriptions: { some: { plan: { code: { in: PAID_CODES } } } } },
        select: { externalId: true },
      });
      for (const c of customers) await this.sync(c.externalId).catch((e) => this.logger.warn(`Plan sync for ${c.externalId} failed: ${e instanceof Error ? e.message : e}`));
    } finally {
      this.running = false;
    }
  }

  /** The operator organisation: CLOUD_BILLING_TENANT_ID, or the platform operator. */
  async operator(): Promise<{ id: string; name: string }> {
    const configured = process.env.CLOUD_BILLING_TENANT_ID;
    const tenant = configured
      ? await this.central.client.tenant.findUnique({ where: { id: configured }, select: { id: true, name: true } })
      : await this.central.client.tenant.findFirst({ where: { isPlatformOperator: true, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
    if (!tenant) throw new BadRequestException('Cloud plans need an operator organisation (CLOUD_BILLING_TENANT_ID or a platform operator)');
    this.operatorId = tenant.id;
    return tenant;
  }

  private async operatorDb(): Promise<PrismaClient> {
    return this.tenantDb.getTenantClient(this.operatorId ?? (await this.operator()).id);
  }

  /**
   * Create the cloud plans in the operator's billing if they are missing, and
   * bring plans still on an earlier catalogue's prices up to date. Prices the
   * operator set there are kept.
   */
  async ensureCatalogue(): Promise<void> {
    const db = await this.operatorDb();
    for (const plan of CLOUD_CATALOGUE) {
      const existing = await db.plan.findUnique({ where: { code: plan.code }, include: { prices: { where: { isActive: true } } } });
      const details = { name: plan.name, description: plan.description, features: plan.features };
      if (!existing) {
        await db.plan.create({
          data: {
            code: plan.code,
            ...details,
            billingInterval: plan.interval,
            billingTiming: 'IN_ADVANCE',
            prices: { create: plan.prices.map((p) => ({ currency: p.currency, amount: p.amount })) },
          },
        });
        this.logger.log(`Created cloud plan ${plan.code}`);
        continue;
      }
      const current = Object.fromEntries(existing.prices.map((p) => [p.currency, Number(p.amount)]));
      const superseded = (SUPERSEDED_PRICES[plan.code] ?? []).some(
        (old) => Object.keys(old).length === Object.keys(current).length && Object.entries(old).every(([c, a]) => current[c] === a),
      );
      if (!superseded) continue;
      await db.$transaction([
        db.plan.update({ where: { id: existing.id }, data: details }),
        ...plan.prices.map((p) =>
          db.planPrice.upsert({
            where: { planId_currency: { planId: existing.id, currency: p.currency } },
            create: { planId: existing.id, currency: p.currency, amount: p.amount },
            update: { amount: p.amount, isActive: true },
          }),
        ),
      ]);
      this.logger.log(`Updated cloud plan ${plan.code} to the current prices`);
    }
  }

  /** Organisations with no plan yet go on Free; plans an operator set by hand are left alone. */
  async assignFree(): Promise<number> {
    const operatorId = this.operatorId ?? (await this.operator()).id;
    const tenants = await this.central.client.tenant.findMany({
      where: { id: { not: operatorId }, isPlatformOperator: false, OR: [{ tenantBilling: null }, { tenantBilling: { planId: null, planName: null } }] },
      select: { id: true },
    });
    for (const t of tenants) await this.setTier(t.id, 'free', 'cloud_free');
    if (tenants.length) this.logger.log(`Put ${tenants.length} organisation(s) on the Free plan`);
    return tenants.length;
  }

  /** Organisations still on an earlier tier's limits move to the current ones. */
  async refreshLimits(): Promise<number> {
    const rows = await this.central.client.tenantBilling.findMany({ where: { planId: { startsWith: 'cloud_' } }, select: { tenantId: true, planId: true, limits: true } });
    const same = (a: PlanLimits | null, b: PlanLimits) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b).sort());
    let moved = 0;
    for (const row of rows) {
      const tier = tierOf(row.planId);
      if (!tier || !(SUPERSEDED_LIMITS[tier] ?? []).some((old) => same(parseLimits(row.limits), old))) continue;
      await this.central.client.tenantBilling.update({ where: { tenantId: row.tenantId }, data: { limits: CLOUD_TIERS[tier].limits as object } });
      forgetPlan(row.tenantId);
      moved++;
    }
    if (moved) this.logger.log(`Moved ${moved} organisation(s) to the current plan limits`);
    return moved;
  }

  private async setTier(tenantId: string, tier: CloudTier, planId: string, extra: { status?: string; manageUrl?: string | null } = {}) {
    const data = {
      planId,
      planName: CLOUD_TIERS[tier].name,
      limits: CLOUD_TIERS[tier].limits as object,
      status: extra.status ?? (tier === 'free' ? 'free' : 'active'),
      manageUrl: extra.manageUrl ?? this.manageUrl(),
      trialEndsAt: null,
    };
    await this.central.client.tenantBilling.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
    forgetPlan(tenantId);
  }

  private manageUrl(): string {
    return `${(process.env.DASHBOARD_URL || 'http://localhost:4002').replace(/\/$/, '')}/settings/plan`;
  }

  /**
   * Bring an organisation's plan in line with what it has paid: a Growth
   * invoice paid for the current period (or within the grace period after it)
   * keeps it on Growth; otherwise it is on Free. Open managed checkouts are
   * checked first, in case their notification was missed.
   */
  async sync(tenantId: string): Promise<void> {
    if (!this.enabled) return;
    const operatorId = this.operatorId ?? (await this.operator()).id;
    if (tenantId === operatorId) return;
    const db = await this.operatorDb();
    const customer = await db.customer.findUnique({ where: { externalId: tenantId } });
    const current = await this.central.client.tenantBilling.findUnique({ where: { tenantId } });
    if (!customer) {
      if (!current?.planId && !current?.planName) await this.setTier(tenantId, 'free', 'cloud_free');
      return;
    }

    await this.settleOpenCheckouts(db, operatorId, customer.id);

    const now = Date.now();
    const subscriptions = await db.subscription.findMany({
      where: { customerId: customer.id, plan: { code: { in: PAID_CODES } }, status: { in: [...LIVE_SUBSCRIPTION] } },
      include: { plan: true, invoices: { where: { status: 'PAID' }, orderBy: { periodEnd: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    const paying = subscriptions.find((s) => {
      const end = s.invoices[0]?.periodEnd?.getTime();
      return end !== undefined && end + GRACE_DAYS * DAY > now;
    });

    if (paying) {
      const lapsed = (paying.invoices[0]!.periodEnd!.getTime() ?? 0) < now;
      if (current?.planId !== paying.plan.code || current?.status !== (lapsed ? 'past_due' : 'active')) {
        // Limits are set when the plan changes, so an operator's adjustment to one organisation stays.
        if (current?.planId === paying.plan.code) {
          await this.central.client.tenantBilling.update({ where: { tenantId }, data: { status: lapsed ? 'past_due' : 'active' } });
        } else {
          await this.setTier(tenantId, 'growth', paying.plan.code, { status: lapsed ? 'past_due' : 'active' });
          this.logger.log(`Organisation ${tenantId} is now on ${paying.plan.name}`);
        }
      }
      return;
    }
    if (tierOf(current?.planId) === 'growth' || !current?.planId) {
      await this.setTier(tenantId, 'free', 'cloud_free');
      if (tierOf(current?.planId) === 'growth') this.logger.log(`Organisation ${tenantId} is back on Free`);
    }
  }

  /** Managed checkouts still processing for this customer: ask managed payments and settle them. */
  private async settleOpenCheckouts(db: PrismaClient, operatorId: string, customerId: string) {
    const open = await db.payment.findMany({
      where: { provider: 'managed', status: 'PROCESSING', invoice: { customerId, status: { in: [...OPEN_INVOICE] } }, createdAt: { gt: new Date(Date.now() - 7 * DAY) } },
      select: { id: true },
      take: 10,
    });
    if (!open.length) return;
    const webhooks = this.moduleRef.get(WebhooksController, { strict: false });
    for (const p of open) await webhooks.settleManagedPayment(db, operatorId, p.id).catch(() => undefined);
  }

  /** What an organisation is on, what it uses, and what it can move to. */
  async status(tenantId: string) {
    const [billing, operator] = await Promise.all([this.central.client.tenantBilling.findUnique({ where: { tenantId } }), this.enabled ? this.operator() : null]);
    const org = await this.tenantDb.getTenantClient(tenantId);
    const count = usageCounter(this.central.client as never, org as never, tenantId);
    const usage = Object.fromEntries(await Promise.all(COUNTED.map(async (k) => [k, await count(k)] as const)));

    let plans: { code: string; tier: CloudTier; name: string; description: string | null; interval: string; prices: { currency: string; amount: string }[]; features: unknown }[] = [];
    let subscription: { plan: string; status: string; paidThrough: Date | null; cancelAt: Date | null; openInvoice: { id: string; amount: string; currency: string } | null } | null = null;
    if (operator && tenantId !== operator.id) {
      const db = await this.operatorDb();
      const rows = await db.plan.findMany({ where: { code: { in: CLOUD_CATALOGUE.map((p) => p.code) }, isActive: true }, include: { prices: { where: { isActive: true } } } });
      plans = CLOUD_CATALOGUE.flatMap((def) => {
        const row = rows.find((r) => r.code === def.code);
        return row
          ? [{ code: row.code, tier: def.tier, name: row.name, description: row.description, interval: row.billingInterval, features: row.features, prices: row.prices.map((p) => ({ currency: p.currency, amount: p.amount.toString() })) }]
          : [];
      });
      const customer = await db.customer.findUnique({ where: { externalId: tenantId } });
      const sub = customer
        ? await db.subscription.findFirst({
            where: { customerId: customer.id, plan: { code: { in: PAID_CODES } }, status: { in: [...LIVE_SUBSCRIPTION] } },
            include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 5 } },
            orderBy: { createdAt: 'desc' },
          })
        : null;
      if (sub) {
        const paid = sub.invoices.filter((i) => i.status === 'PAID').sort((a, b) => (b.periodEnd?.getTime() ?? 0) - (a.periodEnd?.getTime() ?? 0))[0];
        const open = sub.invoices.find((i) => (OPEN_INVOICE as readonly string[]).includes(i.status));
        subscription = {
          plan: sub.plan.code,
          status: sub.status,
          paidThrough: paid?.periodEnd ?? null,
          cancelAt: sub.cancelAt ?? null,
          openInvoice: open ? { id: open.id, amount: open.amount.toString(), currency: open.currency } : null,
        };
      }
    }
    const contact = process.env.CLOUD_SALES_EMAIL?.trim() || process.env.BRAND_SUPPORT_EMAIL?.trim() || null;
    return {
      enabled: this.enabled,
      /** The sandbox has no plans: it never charges. */
      sandbox: isSandbox(),
      /** Where to ask about Enterprise, which has no public price. */
      enterpriseContact: contact,
      plan: {
        code: billing?.planId ?? null,
        name: billing?.planName ?? null,
        tier: tierOf(billing?.planId),
        status: billing?.status ?? null,
        limits: billing?.limits ?? null,
      },
      usage,
      subscription,
      plans,
    };
  }

  /**
   * Start paying for Growth: the organisation becomes a customer of the
   * operator, gets a subscription to the plan, and is sent to checkout for its
   * first invoice. Asking again reuses the open invoice.
   */
  async checkout(tenantId: string, planCode: string, currency: string, returnUrl?: string): Promise<{ url: string }> {
    if (!this.enabled) throw new BadRequestException('Plans are not offered on this deployment');
    if (!PAID_CODES.includes(planCode)) throw new BadRequestException(`Unknown plan ${planCode}`);
    const operator = await this.operator();
    if (tenantId === operator.id) throw new ForbiddenException('The operator organisation does not pay for a plan');
    const billing = await this.central.client.tenantBilling.findUnique({ where: { tenantId }, select: { planId: true } });
    if (billing?.planId === PARTNER_CODE) throw new BadRequestException('Your organisation is a partner: it has no limits and nothing to pay');
    if (billing?.planId === ENTERPRISE_CODE) throw new BadRequestException('Your organisation is on Enterprise: your plan is invoiced to you directly');
    const db = await this.operatorDb();
    const plan = await db.plan.findUnique({ where: { code: planCode }, include: { prices: { where: { isActive: true } } } });
    const cur = currency.toUpperCase();
    if (!plan?.isActive || !plan.prices.some((p) => p.currency === cur)) throw new BadRequestException(`${planCode} is not offered in ${cur}`);

    const tenant = await this.central.client.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true, email: true } });
    const customer = await db.customer.upsert({
      where: { externalId: tenant.id },
      create: { externalId: tenant.id, email: tenant.email, name: tenant.name, currency: cur, metadata: { cloudOrganisation: true } },
      update: { email: tenant.email, name: tenant.name },
    });

    // An existing Growth subscription: reuse it if it is this plan in this currency; otherwise end it first.
    const existing = await db.subscription.findMany({
      where: { customerId: customer.id, plan: { code: { in: PAID_CODES } }, status: { in: [...LIVE_SUBSCRIPTION] } },
      include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 3 } },
    });
    let subscription = existing.find((s) => s.plan.code === planCode && s.currency === cur);
    for (const s of existing) {
      if (s === subscription) continue;
      if (s.invoices.some((i) => i.status === 'PAID' && (i.periodEnd?.getTime() ?? 0) > Date.now())) {
        throw new BadRequestException('You are already on a paid plan for this period; change it when it renews, or contact support');
      }
      await this.subscriptions.cancel(db, operator.id, s.id, { cancelAt: 'now' } as never);
    }
    if (subscription?.invoices.some((i) => i.status === 'PAID' && (i.periodEnd?.getTime() ?? 0) > Date.now()) && !subscription.invoices.some((i) => (OPEN_INVOICE as readonly string[]).includes(i.status))) {
      throw new BadRequestException(`You are already on ${subscription.plan.name}`);
    }
    if (!subscription) {
      const created = await this.subscriptions.create(db, operator.id, { customerId: customer.id, planId: plan.id, currency: cur } as never);
      subscription = { ...created, plan, invoices: [] } as never;
    }

    // The first invoice is generated in the background; wait for it briefly.
    let invoice = null as { id: string } | null;
    for (let i = 0; i < 30 && !invoice; i++) {
      invoice = await db.invoice.findFirst({ where: { subscriptionId: subscription!.id, status: { in: [...OPEN_INVOICE] } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      if (!invoice) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!invoice) throw new BadRequestException('Your invoice is still being prepared; try again in a minute');

    const back = returnUrl ?? `${this.manageUrl()}?checkout=done`;
    const provider = process.env.CLOUD_BILLING_PROVIDER || 'managed';
    const result = await this.invoices.createCheckout(db, invoice.id, back, provider, operator.id);
    return { url: result.checkoutUrl! };
  }

  /** Stop at the end of the paid period; the organisation then goes back to Free. */
  async cancel(tenantId: string): Promise<void> {
    const operator = await this.operator();
    const db = await this.operatorDb();
    const customer = await db.customer.findUnique({ where: { externalId: tenantId } });
    if (!customer) throw new BadRequestException('You are not on a paid plan');
    const subs = await db.subscription.findMany({ where: { customerId: customer.id, plan: { code: { in: PAID_CODES } }, status: { in: [...LIVE_SUBSCRIPTION] } } });
    if (!subs.length) throw new BadRequestException('You are not on a paid plan');
    for (const s of subs) await this.subscriptions.cancel(db, operator.id, s.id, { cancelAt: 'period_end' } as never);
  }
}
