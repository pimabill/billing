import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Job, Queue } from 'bullmq';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { TenantDatabaseService } from '../../database/tenant-database.service';
import { PdfService } from '../../services/pdf.service';
import {
  BILLING_QUEUE,
  WEBHOOK_QUEUE,
  EMAIL_QUEUE,
  PAYMENT_QUEUE,
  BillingJobType,
  WebhookJobType,
  EmailJobType,
  PaymentJobType,
  GenerateInvoiceData,
  BaseCharge,
  UsageCharge,
  InvoiceKind,
} from '../billing.queue';
import { WalletsService } from '../../modules/wallets/wallets.service';
import { TaxesService } from '../../modules/taxes/taxes.service';
import { PlanOverridesService } from '../../modules/plan-overrides/plan-overrides.service';
import { Prisma, PrismaClient } from '../../generated/prisma-tenant/client';
import { CronLockService } from '../../common/scheduling/cron-lock.service';
import { chargeCost, dec, Dec, roundMoney } from '../../modules/billing/pricing';
import { aggregateUsage } from '../../modules/billing/usage';
import { firstPeriodEnd, nextBoundary } from '../../modules/billing/period';
import { nextInvoiceNumber } from '../../modules/billing/invoice-number';
import { CurrenciesService } from '../../modules/currencies/currencies.service';
import { billingKey, jobIdFor } from '../../modules/billing/billing-keys';

interface LineItem {
  description: string;
  quantity: number;
  unitAmount: string;
  amount: string;
  type: 'plan' | 'usage' | 'minimum_commitment' | 'coupon' | 'add_on' | 'tax' | 'wallet_credit';
  periodStart?: string;
  periodEnd?: string;
}

/** Invoice statuses that count as "billed" for a billing key or period. */
const LIVE_INVOICE: Prisma.EnumInvoiceStatusFilter['in'] = ['DRAFT', 'PENDING', 'PAID', 'FAILED'];

/** How many missed periods one renewal run catches up on. */
const MAX_CATCH_UP_PERIODS = 48;

@Processor(BILLING_QUEUE)
export class BillingProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingProcessor.name);

  constructor(
    private readonly centralPrisma: CentralPrismaService,
    private readonly tenantDbService: TenantDatabaseService,
    private readonly pdfService: PdfService,
    private readonly walletsService: WalletsService,
    private readonly taxesService: TaxesService,
    private readonly planOverridesService: PlanOverridesService,
    @InjectQueue(BILLING_QUEUE) private readonly billingQueue: Queue,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    @InjectQueue(PAYMENT_QUEUE) private readonly paymentQueue: Queue,
    @Optional() private readonly cronLock?: CronLockService,
    @Optional() private readonly currencies?: CurrenciesService,
  ) {
    super();
  }

  // ============================================================
  // Schedules. Every process registers them; the lock lets one run each.
  // ============================================================

  private exclusive(name: string, holdMs: number, fn: () => Promise<unknown>): Promise<unknown> {
    return this.cronLock ? this.cronLock.runExclusive(name, holdMs, fn) : fn();
  }

  private async activeTenantIds(): Promise<string[]> {
    const connections = await this.centralPrisma.client.databaseConnection.findMany({
      where: { isHealthy: true },
      include: { tenant: { select: { id: true, isActive: true } } },
    });
    return connections.filter((c) => c.tenant.isActive).map((c) => c.tenantId);
  }

  /** One job per tenant per run; the job id keeps a second scheduler from queueing it again. */
  private async queuePerTenant(type: BillingJobType, runKey: string): Promise<void> {
    for (const tenantId of await this.activeTenantIds()) {
      await this.billingQueue.add(type, { tenantId }, { jobId: jobIdFor(`${type}-${tenantId}-${runKey}`) });
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduleDailyBilling(): Promise<void> {
    await this.exclusive('daily-billing', 23 * 3600_000, () => this.billingQueue.add(BillingJobType.DAILY_BILLING_CYCLE, {}));
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async schedulePaymentReminders(): Promise<void> {
    await this.exclusive('payment-reminders', 23 * 3600_000, () =>
      this.queuePerTenant(BillingJobType.PAYMENT_REMINDERS, new Date().toISOString().slice(0, 10)),
    );
  }

  /** Hourly, so hourly plans renew on time and periods close within the hour. */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduleSubscriptionRenewals(): Promise<void> {
    await this.exclusive('subscription-renewals', 55 * 60_000, () =>
      this.queuePerTenant(BillingJobType.SUBSCRIPTION_RENEWAL, new Date().toISOString().slice(0, 13)),
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduleDraftFinalization(): Promise<void> {
    await this.exclusive('draft-finalization', 55 * 60_000, () =>
      this.queuePerTenant(BillingJobType.FINALIZE_DRAFT_INVOICES, new Date().toISOString().slice(0, 13)),
    );
  }

  async process(job: Job): Promise<void> {
    // A job for one organisation runs in its currency context, so its own currencies round right.
    const tenantId: string | undefined = job.data?.tenantId;
    if (tenantId && this.currencies) {
      const db = await this.tenantDbService.getTenantClient(tenantId);
      return this.currencies.runFor(db, tenantId, () => this.dispatch(job));
    }
    return this.dispatch(job);
  }

  private async dispatch(job: Job): Promise<void> {
    switch (job.name) {
      case BillingJobType.DAILY_BILLING_CYCLE:
        return this.handleDailyBillingCycle(job);
      case BillingJobType.GENERATE_INVOICE:
        return this.handleGenerateInvoice(job);
      case BillingJobType.SUBSCRIPTION_RENEWAL:
        return this.handleSubscriptionRenewal(job);
      case BillingJobType.PAYMENT_REMINDERS:
        return this.handlePaymentReminders(job);
      case BillingJobType.FINALIZE_DRAFT_INVOICES:
        return this.handleFinalizeDraftInvoices(job);
      case BillingJobType.CHECK_PROGRESSIVE_BILLING:
        return this.handleCheckProgressiveBilling(job);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  /** Queue an invoice; the job id and the invoice's billing key both stop duplicates. */
  async queueInvoice(data: GenerateInvoiceData): Promise<void> {
    await this.billingQueue.add(BillingJobType.GENERATE_INVOICE, data, data.billingKey ? { jobId: jobIdFor(data.billingKey) } : undefined);
  }

  // ============================================================
  // Daily: trial-ending reminders (once per trial)
  // ============================================================

  private async handleDailyBillingCycle(_job: Job): Promise<void> {
    for (const tenantId of await this.activeTenantIds()) {
      try {
        const db = await this.tenantDbService.getTenantClient(tenantId);
        const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 3600_000);
        const expiringTrials = await db.subscription.findMany({
          where: { status: 'TRIALING', trialEnd: { lte: threeDaysFromNow, gt: new Date() } },
          include: { customer: true, plan: true },
        });

        for (const trial of expiringTrials) {
          const meta = (trial.metadata as Record<string, unknown> | null) ?? {};
          const trialEndIso = trial.trialEnd?.toISOString();
          if (!trial.customer?.email || !trialEndIso || meta.trialReminderSentFor === trialEndIso) continue;
          await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
            tenantId,
            to: trial.customer.email,
            subject: 'Your free trial is ending soon',
            template: 'trial-ending-soon',
            context: {
              customerName: trial.customer.name || trial.customer.email,
              planName: trial.plan.name,
              trialEnd: trialEndIso.split('T')[0],
            },
          });
          await db.subscription.update({ where: { id: trial.id }, data: { metadata: { ...meta, trialReminderSentFor: trialEndIso } } });
        }
      } catch (error) {
        this.logger.error(`Failed to send trial reminders for tenant ${tenantId}`, error);
      }
    }
  }

  // ============================================================
  // Renewals: close each ended period exactly once
  // ============================================================

  private async handleSubscriptionRenewal(job: Job<{ tenantId: string }>): Promise<void> {
    const { tenantId } = job.data;
    const db = await this.tenantDbService.getTenantClient(tenantId);
    const now = new Date();

    // --- Trials that have ended become active, from the trial's end ---
    const expiredTrials = await db.subscription.findMany({
      where: { status: 'TRIALING', trialEnd: { lte: now } },
      include: { plan: { include: { prices: true } }, customer: true },
    });
    for (const trial of expiredTrials) {
      const start = trial.trialEnd!;
      const end = firstPeriodEnd(start, trial.plan.billingInterval);
      const moved = await db.subscription.updateMany({
        where: { id: trial.id, status: 'TRIALING' },
        data: { status: 'ACTIVE', currentPeriodStart: start, currentPeriodEnd: end, billingAnchor: start },
      });
      if (moved.count === 0) continue;

      if (trial.billingTiming === 'IN_ADVANCE') {
        await this.queueInvoice({
          tenantId,
          subscriptionId: trial.id,
          customerId: trial.customerId,
          kind: 'start',
          billingKey: billingKey(trial.id, 'start', start),
          bases: [{ planId: trial.planId, periodStart: start.toISOString(), periodEnd: end.toISOString() }],
        });
      }
      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
        tenantId,
        event: 'subscription.trial_ended',
        payload: { subscriptionId: trial.id, customerId: trial.customerId, planId: trial.planId, status: 'ACTIVE' },
      });
      if (trial.customer?.email) {
        const price = trial.plan.prices.find((p) => p.currency === trial.currency);
        await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
          tenantId,
          to: trial.customer.email,
          subject: 'Your trial has ended - Subscription is now active',
          template: 'trial-converted',
          context: {
            customerName: trial.customer.name || trial.customer.email,
            planName: trial.plan.name,
            amount: price ? PdfService.formatAmount(price.amount, trial.currency) : '0',
            currency: trial.currency,
          },
        });
      }
      this.logger.log(`Converted trial subscription ${trial.id} to ACTIVE`);
    }

    // --- Active subscriptions whose period has ended ---
    const ended = await db.subscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lte: now } },
      include: { plan: true },
    });
    for (const sub of ended) {
      try {
        await this.renewSubscription(db, tenantId, sub, now);
      } catch (error) {
        this.logger.error(`Failed to renew subscription ${sub.id}`, error);
      }
    }

    // --- Cancellations due on subscriptions that are not active (past due, paused) ---
    const canceling = await db.subscription.findMany({
      where: { cancelAt: { lte: now }, status: { in: ['PAST_DUE', 'PAUSED', 'TRIALING'] } },
    });
    for (const sub of canceling) {
      const moved = await db.subscription.updateMany({
        where: { id: sub.id, status: sub.status },
        data: { status: 'CANCELED', canceledAt: sub.cancelAt ?? now },
      });
      if (moved.count) this.logger.log(`Canceled subscription ${sub.id}`);
    }
  }

  /**
   * Closes every ended period of one subscription, oldest first. Each step is
   * a compare-and-set on the period end, so two runs cannot close the same
   * period twice, and each closed period queues exactly one invoice (by key):
   * usage and in-arrears price for the period that ended, plus the in-advance
   * price of the next one. A scheduled plan change or cancellation takes
   * effect at the boundary.
   */
  private async renewSubscription(
    db: PrismaClient,
    tenantId: string,
    sub: Prisma.SubscriptionGetPayload<{ include: { plan: true } }>,
    now: Date,
  ): Promise<void> {
    let current = sub;
    for (let i = 0; i < MAX_CATCH_UP_PERIODS; i++) {
      const start = current.currentPeriodStart;
      const end = current.currentPeriodEnd;
      if (end > now) return;

      const meta = { ...((current.metadata as Record<string, unknown> | null) ?? {}) };
      const pending = meta.pendingPlanChange as { newPlanId?: string } | undefined;
      delete meta.pendingPlanChange;
      const ending = Boolean(current.cancelAt && current.cancelAt <= end);

      let nextPlan = current.plan;
      if (!ending && pending?.newPlanId && pending.newPlanId !== current.planId) {
        const candidate = await db.plan.findUnique({ where: { id: pending.newPlanId } });
        if (candidate?.isActive) nextPlan = candidate;
        else this.logger.warn(`Scheduled plan change for ${current.id} skipped: plan ${pending.newPlanId} is not active`);
      }
      const planChanged = nextPlan.id !== current.planId;
      // Counting from the original anchor keeps month-end dates; a new interval starts counting at the boundary.
      const anchor =
        planChanged && nextPlan.billingInterval !== current.plan.billingInterval ? end : (current.billingAnchor ?? start);
      const nextEnd = nextBoundary(anchor, end, nextPlan.billingInterval);

      const moved = await db.subscription.updateMany({
        where: { id: current.id, status: 'ACTIVE', currentPeriodEnd: end },
        data: ending
          ? { status: 'CANCELED', canceledAt: current.cancelAt ?? end, metadata: meta as Prisma.InputJsonValue }
          : {
              currentPeriodStart: end,
              currentPeriodEnd: nextEnd,
              billingAnchor: anchor,
              metadata: meta as Prisma.InputJsonValue,
              ...(planChanged && { previousPlanId: current.planId, planId: nextPlan.id, billingTiming: nextPlan.billingTiming }),
            },
      });
      if (moved.count === 0) return; // Another run closed this period.

      const bases: BaseCharge[] = [];
      if (current.billingTiming === 'IN_ARREARS') {
        bases.push({ planId: current.planId, periodStart: start.toISOString(), periodEnd: end.toISOString() });
      }
      if (!ending && nextPlan.billingTiming === 'IN_ADVANCE') {
        bases.push({ planId: nextPlan.id, periodStart: end.toISOString(), periodEnd: nextEnd.toISOString() });
      }
      const kind: InvoiceKind = ending ? 'cancellation' : 'renewal';
      await this.queueInvoice({
        tenantId,
        subscriptionId: current.id,
        customerId: current.customerId,
        kind,
        billingKey: billingKey(current.id, 'renewal', end),
        bases,
        usage: { planId: current.planId, periodStart: start.toISOString(), from: start.toISOString(), to: end.toISOString() },
      });

      if (ending) {
        await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
          tenantId,
          event: 'subscription.canceled',
          payload: { subscriptionId: current.id, customerId: current.customerId, planId: current.planId, canceledAt: (current.cancelAt ?? end).toISOString() },
        });
        this.logger.log(`Canceled subscription ${current.id} at period end`);
        return;
      }

      if (planChanged) {
        await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
          tenantId,
          event: 'subscription.plan_changed',
          payload: { subscriptionId: current.id, customerId: current.customerId, oldPlanId: current.planId, newPlanId: nextPlan.id, effectiveAt: end.toISOString() },
        });
        this.logger.log(`Applied scheduled plan change for subscription ${current.id} to plan ${nextPlan.id}`);
      }
      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
        tenantId,
        event: 'subscription.renewed',
        payload: {
          subscriptionId: current.id,
          customerId: current.customerId,
          planId: nextPlan.id,
          currentPeriodStart: end.toISOString(),
          currentPeriodEnd: nextEnd.toISOString(),
        },
      });

      current = {
        ...current,
        currentPeriodStart: end,
        currentPeriodEnd: nextEnd,
        billingAnchor: anchor,
        metadata: meta as Prisma.JsonValue,
        ...(planChanged && { previousPlanId: current.planId, planId: nextPlan.id, plan: nextPlan, billingTiming: nextPlan.billingTiming }),
      };
    }
    this.logger.warn(`Subscription ${sub.id} is more than ${MAX_CATCH_UP_PERIODS} periods behind; the next run continues`);
  }

  // ============================================================
  // Invoice generation
  // ============================================================

  private async handleGenerateInvoice(job: Job<GenerateInvoiceData>): Promise<void> {
    const data = job.data;
    const { tenantId, subscriptionId, customerId } = data;
    const db = await this.tenantDbService.getTenantClient(tenantId);

    const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription) {
      this.logger.warn(`Subscription ${subscriptionId} not found`);
      return;
    }

    // Jobs queued before invoices had keys: bill the current period's price once.
    const usage = data.usage;
    let { bases = [], kind, billingKey: key } = data;
    if (!data.bases && !data.usage) {
      kind = 'renewal';
      key = billingKey(subscription.id, 'start', subscription.currentPeriodStart);
      bases = [{
        planId: subscription.planId,
        periodStart: subscription.currentPeriodStart.toISOString(),
        periodEnd: subscription.currentPeriodEnd.toISOString(),
      }];
      if (await db.invoice.findFirst({
        where: { subscriptionId, createdAt: { gte: subscription.currentPeriodStart }, status: { in: LIVE_INVOICE } },
        select: { id: true },
      })) {
        this.logger.log(`Invoice already exists for subscription ${subscriptionId} in current period — skipping`);
        return;
      }
    }

    if (key) {
      const existing = await db.invoice.findUnique({ where: { billingKey: key } });
      if (existing) {
        // An earlier attempt created it; finish anything it did not get to.
        if (!(existing.metadata as Record<string, unknown> | null)?.postProcessed) await this.finishInvoice(db, tenantId, existing.id);
        return;
      }
    }

    const currency = subscription.currency;
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    const tenant = await this.centralPrisma.client.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const settings = (tenant?.settings || {}) as Record<string, unknown>;

    const lines: LineItem[] = [];
    let primaryPlan: Prisma.PlanGetPayload<{ include: { prices: true } }> | null = null;

    // 1) Recurring prices
    for (const base of bases) {
      const plan = await db.plan.findUnique({ where: { id: base.planId }, include: { prices: true } });
      if (!plan) {
        this.logger.warn(`Plan ${base.planId} not found for subscription ${subscriptionId}`);
        continue;
      }
      primaryPlan ??= plan;
      const override = await this.planOverridesService.resolvePrice(db, customerId, plan.id, currency).catch(() => null);
      const listPrice = plan.prices.find((p) => p.currency === currency)?.amount;
      if (override === null && listPrice === undefined) {
        this.logger.warn(`No ${currency} price on plan ${plan.id}`);
        continue;
      }
      const fraction = base.fraction ?? 1;
      const amount = roundMoney(dec(override ?? listPrice).mul(fraction), currency);
      const prorated = fraction < 1 ? ` (prorated ${Math.round(fraction * 100)}%)` : '';
      lines.push({
        description: `${plan.name} (${plan.billingInterval.toLowerCase()})${override !== null ? ' [custom pricing]' : ''}${prorated}`,
        quantity: 1,
        unitAmount: amount.toString(),
        amount: amount.toString(),
        type: 'plan',
        periodStart: base.periodStart,
        periodEnd: base.periodEnd,
      });
    }

    // 2) Usage
    const usageByCharge: Record<string, string> = {};
    let periodUsage = new Dec(0);
    if (usage) {
      const plan = await db.plan.findUnique({ where: { id: usage.planId }, include: { prices: true } });
      primaryPlan ??= plan;
      const result = await this.usageLines(db, subscriptionId, customerId, usage, kind, currency);
      lines.push(...result.lines);
      Object.assign(usageByCharge, result.byCharge);
      periodUsage = result.periodTotal;

      // 3) Minimum commitment, when a whole period closes
      if (kind === 'renewal' && plan) {
        const commitmentOverride = await this.planOverridesService.resolveMinimumCommitment(db, customerId, plan.id).catch(() => null);
        const minimum = commitmentOverride ?? (plan.minimumCommitment !== null ? dec(plan.minimumCommitment) : null);
        if (minimum !== null && dec(minimum).gt(0)) {
          const price = dec(plan.prices.find((p) => p.currency === currency)?.amount);
          const periodTotal = price.add(periodUsage);
          if (periodTotal.lt(dec(minimum))) {
            const trueUp = roundMoney(dec(minimum).sub(periodTotal), currency);
            lines.push({ description: 'Minimum commitment true-up', quantity: 1, unitAmount: trueUp.toString(), amount: trueUp.toString(), type: 'minimum_commitment' });
          }
        }
      }
    }

    if (lines.length === 0) {
      this.logger.log(`Nothing to bill for subscription ${subscriptionId} (${kind ?? 'invoice'})`);
      return;
    }

    const gracePeriodDays = primaryPlan?.invoiceGracePeriodDays ?? (settings.invoiceGracePeriodDays as number | undefined) ?? 0;
    const isDraft = gracePeriodDays > 0 && kind !== 'progressive';
    const netPaymentTerms =
      customer?.netPaymentTerms ?? primaryPlan?.netPaymentTerms ?? (settings.netPaymentTerms as number | undefined) ?? 30;
    const dueDate = new Date(Date.now() + netPaymentTerms * 24 * 3600_000);
    const periodStart = usage?.periodStart ?? bases[0]?.periodStart;
    const periodEnd = usage?.to ?? bases[0]?.periodEnd;

    let invoiceId: string;
    try {
      invoiceId = await db.$transaction(async (tx) => {
        let subtotal = lines.reduce((sum, l) => sum.add(l.amount), new Dec(0));

        // 4) Coupons: each use is claimed with a compare-and-set, in the same transaction as the invoice.
        const appliedCoupons = await tx.appliedCoupon.findMany({
          where: { customerId, OR: [{ subscriptionId }, { subscriptionId: null }] },
          include: { coupon: true },
        });
        let discount = new Dec(0);
        for (const ac of appliedCoupons) {
          if (!ac.coupon.isActive) continue;
          if (ac.coupon.expiresAt && ac.coupon.expiresAt < new Date()) continue;
          if (ac.usesRemaining !== null && ac.usesRemaining <= 0) continue;
          if (ac.coupon.appliesToPlanIds.length && !ac.coupon.appliesToPlanIds.includes(subscription.planId)) continue;
          const remaining = Dec.max(0, subtotal.sub(discount));
          if (remaining.lte(0)) break;
          let off = new Dec(0);
          if (ac.coupon.discountType === 'PERCENTAGE') {
            off = remaining.mul(dec(ac.coupon.discountValue)).div(100);
          } else if (!ac.coupon.currency || ac.coupon.currency === currency) {
            off = Dec.min(remaining, dec(ac.coupon.discountValue));
          }
          off = roundMoney(off, currency);
          if (off.lte(0)) continue;
          if (ac.usesRemaining !== null) {
            const claimed = await tx.appliedCoupon.updateMany({
              where: { id: ac.id, usesRemaining: ac.usesRemaining },
              data: { usesRemaining: ac.usesRemaining - 1 },
            });
            if (claimed.count === 0) continue;
            if (ac.usesRemaining - 1 <= 0) await tx.appliedCoupon.delete({ where: { id: ac.id } });
          }
          discount = discount.add(off);
          lines.push({
            description: `Coupon: ${ac.coupon.code} (${ac.coupon.discountType === 'PERCENTAGE' ? `${ac.coupon.discountValue}%` : `-${ac.coupon.discountValue}`})`,
            quantity: 1,
            unitAmount: off.neg().toString(),
            amount: off.neg().toString(),
            type: 'coupon',
          });
        }
        subtotal = subtotal.sub(discount);

        // 5) Pending add-ons
        const addOns = kind === 'progressive'
          ? []
          : await tx.appliedAddOn.findMany({ where: { customerId, invoiceId: null, currency } });
        for (const addon of addOns) {
          const amount = roundMoney(dec(addon.amount), currency);
          lines.push({ description: `Add-on charge (${addon.addOnId})`, quantity: 1, unitAmount: amount.toString(), amount: amount.toString(), type: 'add_on' });
          subtotal = subtotal.add(amount);
        }

        // 6) Taxes
        let taxAmount = new Dec(0);
        const taxes = await this.taxesService.resolveTaxes(db, customerId, subscription.planId).catch((error) => {
          this.logger.error('Failed to resolve taxes', error);
          throw error;
        });
        const taxable = Dec.max(0, subtotal);
        for (const tax of taxes) {
          const amount = roundMoney(taxable.mul(dec(tax.rate)).div(100), currency);
          taxAmount = taxAmount.add(amount);
          lines.push({ description: `Tax: ${tax.name} (${tax.rate}%)`, quantity: 1, unitAmount: amount.toString(), amount: amount.toString(), type: 'tax' });
        }
        const total = Dec.max(0, subtotal.add(taxAmount));

        const created = await tx.invoice.create({
          data: {
            invoiceNumber: await nextInvoiceNumber(tx),
            subscriptionId,
            customerId,
            amount: total,
            currency,
            dueDate,
            status: isDraft ? 'DRAFT' : 'PENDING',
            billingKey: key,
            kind: kind ?? null,
            periodStart: periodStart ? new Date(periodStart) : null,
            periodEnd: periodEnd ? new Date(periodEnd) : null,
            metadata: {
              planName: primaryPlan?.name,
              billingInterval: primaryPlan?.billingInterval,
              items: lines,
              taxAmount: taxAmount.toString(),
              usageByCharge,
              ...(isDraft && { gracePeriodEndsAt: new Date(Date.now() + gracePeriodDays * 24 * 3600_000).toISOString() }),
            } as unknown as Prisma.InputJsonValue,
          },
        });

        if (addOns.length) {
          const attached = await tx.appliedAddOn.updateMany({
            where: { id: { in: addOns.map((a) => a.id) }, invoiceId: null },
            data: { invoiceId: created.id },
          });
          // Another invoice took some of them meanwhile: start over so none is billed twice.
          if (attached.count !== addOns.length) throw new Error('Add-ons changed while invoicing; retrying');
        }
        return created.id;
      });
    } catch (error) {
      if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String((error.meta as { target?: unknown } | undefined)?.target ?? '');
        if (target.includes('billingKey')) {
          this.logger.log(`Invoice ${key} was created by another worker`);
          return;
        }
      }
      throw error;
    }

    if (kind === 'progressive') {
      await db.subscription.update({ where: { id: subscriptionId }, data: { lastProgressiveBillingAt: new Date() } });
    }
    await this.finishInvoice(db, tenantId, invoiceId);
  }

  /**
   * Usage lines for one period. Each charge is priced on the whole period's
   * usage so far (so tiers apply across the period), less what progressive
   * invoices already billed for it in this period.
   */
  private async usageLines(
    db: PrismaClient,
    subscriptionId: string,
    customerId: string,
    usage: UsageCharge,
    kind: InvoiceKind | undefined,
    currency: string,
  ): Promise<{ lines: LineItem[]; byCharge: Record<string, string>; periodTotal: Dec }> {
    const periodStart = new Date(usage.periodStart);
    const to = new Date(usage.to);
    const charges = await db.charge.findMany({
      where: { planId: usage.planId },
      include: { billableMetric: true, graduatedRanges: { orderBy: { order: 'asc' } } },
    });
    if (charges.length === 0) return { lines: [], byCharge: {}, periodTotal: new Dec(0) };

    const already = await this.progressiveBilled(db, subscriptionId, periodStart);
    const lines: LineItem[] = [];
    const byCharge: Record<string, string> = {};
    let periodTotal = new Dec(0);

    for (const charge of charges) {
      const units = await aggregateUsage(db, {
        subscriptionId,
        code: charge.billableMetric.code,
        aggregationType: charge.billableMetric.aggregationType,
        fieldName: charge.billableMetric.fieldName,
        from: periodStart,
        to,
      });
      if (units.lte(0)) continue;

      const override = await this.planOverridesService.resolveChargeProperties(db, customerId, usage.planId, charge.id).catch(() => null);
      const properties = ((override?.properties as Record<string, unknown> | undefined) ?? (charge.properties as Record<string, unknown> | null) ?? {});
      const ranges = (override?.graduatedRanges as typeof charge.graduatedRanges | undefined) ?? charge.graduatedRanges;
      let cost = chargeCost(charge.chargeModel, units, properties, ranges);
      if (kind !== 'progressive' && charge.minAmountCents) cost = Dec.max(cost, new Dec(charge.minAmountCents).div(100));
      cost = roundMoney(cost, currency);
      periodTotal = periodTotal.add(cost);

      const due = roundMoney(cost.sub(already[charge.id] ?? 0), currency);
      if (due.lte(0)) continue;
      byCharge[charge.id] = due.toString();
      lines.push({
        description: charge.invoiceDisplayName || `${charge.billableMetric.name} (${units.toString()} units${already[charge.id] ? ', less amounts already billed this period' : ''})`,
        quantity: 1,
        unitAmount: due.toString(),
        amount: due.toString(),
        type: 'usage',
        periodStart: usage.periodStart,
        periodEnd: usage.to,
      });
    }
    return { lines, byCharge, periodTotal };
  }

  /** Usage already billed per charge by progressive invoices in the period starting `periodStart`. */
  private async progressiveBilled(db: PrismaClient, subscriptionId: string, periodStart: Date): Promise<Record<string, Dec>> {
    const invoices = await db.invoice.findMany({
      where: { subscriptionId, kind: 'progressive', periodStart, status: { in: LIVE_INVOICE } },
      select: { metadata: true },
    });
    const totals: Record<string, Dec> = {};
    for (const inv of invoices) {
      const byCharge = ((inv.metadata as Record<string, unknown> | null)?.usageByCharge ?? {}) as Record<string, string>;
      for (const [chargeId, amount] of Object.entries(byCharge)) totals[chargeId] = (totals[chargeId] ?? new Dec(0)).add(dec(amount));
    }
    return totals;
  }

  /**
   * After an invoice exists: prepaid credits, PDF, notifications and
   * auto-charge. Safe to repeat: credits are applied once per invoice and the
   * charge job is keyed on the invoice.
   */
  private async finishInvoice(db: PrismaClient, tenantId: string, invoiceId: string): Promise<void> {
    let invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true, subscription: true } });
    const meta = (invoice.metadata as Record<string, unknown> | null) ?? {};
    const items = (meta.items as LineItem[] | undefined) ?? [];
    let total = dec(invoice.amount);

    // Prepaid wallet credits (after coupons, add-ons and taxes)
    if (total.gt(0) && !meta.prepaidCreditAmount) {
      try {
        const deducted = roundMoney(
          dec(await this.walletsService.applyToInvoice(db, tenantId, invoice.customerId, invoice.id, Number(total), invoice.currency)),
          invoice.currency,
        );
        if (deducted.gt(0)) {
          total = Dec.max(0, total.sub(deducted));
          items.push({ description: 'Prepaid credits applied', quantity: 1, unitAmount: deducted.neg().toString(), amount: deducted.neg().toString(), type: 'wallet_credit' });
          // Merge, never replace: the grace period and tax total stay.
          invoice = await db.invoice.update({
            where: { id: invoice.id },
            data: { amount: total, metadata: { ...meta, items, prepaidCreditAmount: deducted.toString() } as unknown as Prisma.InputJsonValue },
            include: { customer: true, subscription: true },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to apply wallet credits for invoice ${invoice.id}`, error);
      }
    }

    const tenant = await this.centralPrisma.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true, email: true, settings: true } });
    const tenantSettings = (tenant?.settings || {}) as Record<string, unknown>;
    const tenantInfo = {
      name: tenant?.name || 'Invoice',
      email: tenant?.email,
      address: tenantSettings.address as string | undefined,
      country: tenantSettings.country as string | undefined,
      taxId: tenantSettings.taxId as string | undefined,
    };

    let pdfBuffer: Buffer | undefined;
    try {
      pdfBuffer = await this.pdfService.generateInvoicePDF(
        {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: total.toString(),
          currency: invoice.currency,
          status: invoice.status,
          dueDate: invoice.dueDate,
          createdAt: invoice.createdAt,
          metadata: { items },
        },
        { name: invoice.customer?.name, email: invoice.customer?.email || '', country: invoice.customer?.country },
        tenantInfo,
      );
      const filename = `invoice-${invoice.id}.pdf`;
      await this.pdfService.savePdf(pdfBuffer, filename);
      await db.invoice.update({ where: { id: invoice.id }, data: { pdfUrl: this.pdfService.getPublicUrl(filename) } });
    } catch (pdfError) {
      this.logger.error(`Failed to generate PDF for invoice ${invoice.id}`, pdfError);
    }

    const isDraft = invoice.status === 'DRAFT';
    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: isDraft ? 'invoice.drafted' : 'invoice.created',
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        subscriptionId: invoice.subscriptionId,
        amount: Number(total),
        currency: invoice.currency,
        dueDate: invoice.dueDate.toISOString(),
        status: invoice.status,
        kind: invoice.kind,
      },
    });

    if (!isDraft) {
      if (invoice.customer?.email) {
        await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
          tenantId,
          to: invoice.customer.email,
          subject: `Invoice ${invoice.invoiceNumber} from ${tenantInfo.name}`,
          template: 'invoice',
          context: {
            tenantName: tenantInfo.name,
            customerName: invoice.customer.name || invoice.customer.email,
            invoiceId: invoice.invoiceNumber,
            amount: PdfService.formatAmount(total.toString(), invoice.currency),
            currency: invoice.currency,
            dueDate: invoice.dueDate.toISOString().split('T')[0],
          },
          attachments: pdfBuffer
            ? [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer.toString('base64'), contentType: 'application/pdf' }]
            : undefined,
        });
      }
      await this.queueAutoCharge(tenantId, invoice.id, total, invoice.subscriptionId, invoice.subscription?.paymentMethodId ?? null);
    }

    const latest = await db.invoice.findUnique({ where: { id: invoice.id }, select: { metadata: true } });
    await db.invoice.update({
      where: { id: invoice.id },
      data: { metadata: { ...((latest?.metadata as Record<string, unknown> | null) ?? {}), postProcessed: true } as Prisma.InputJsonValue },
    });
    this.logger.log(`Invoice ${invoice.invoiceNumber} (${invoice.kind ?? 'invoice'}) issued for subscription ${invoice.subscriptionId}`);
  }

  private async queueAutoCharge(tenantId: string, invoiceId: string, total: Dec, subscriptionId: string | null, paymentMethodId: string | null) {
    if (!total.gt(0) || !paymentMethodId || !subscriptionId) return;
    await this.paymentQueue.add(
      PaymentJobType.AUTO_CHARGE_PAYMENT_METHOD,
      { tenantId, invoiceId, subscriptionId, paymentMethodId },
      // One automatic charge per invoice, however often this runs.
      { jobId: jobIdFor(`charge-${invoiceId}`), attempts: 1 },
    );
  }

  // ============================================================
  // Payment Reminders
  // ============================================================

  private async handlePaymentReminders(job: Job<{ tenantId: string }>): Promise<void> {
    const { tenantId } = job.data;
    const db = await this.tenantDbService.getTenantClient(tenantId);
    const now = new Date();

    const tenant = await this.centralPrisma.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const tenantName = tenant?.name || 'Your billing provider';

    const unpaidInvoices = await db.invoice.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] } },
      include: { customer: true },
    });

    let sentCount = 0;
    for (const invoice of unpaidInvoices) {
      if (!invoice.customer?.email || !invoice.dueDate) continue;

      const dueDateStr = invoice.dueDate.toISOString().split('T')[0];
      const daysUntilDue = Math.round((invoice.dueDate.getTime() - now.getTime()) / (24 * 3600_000));
      const meta = (invoice.metadata as Record<string, unknown>) || {};
      const remindersSent = (meta.remindersSent as string[]) || [];

      let reminderKey: string | null = null;
      let template: string | null = null;
      let subject: string | null = null;

      if (daysUntilDue >= 2 && daysUntilDue <= 3 && !remindersSent.includes('upcoming')) {
        reminderKey = 'upcoming';
        template = 'payment-reminder-upcoming';
        subject = `Payment reminder: ${invoice.invoiceNumber} due ${dueDateStr} — ${tenantName}`;
      } else if (daysUntilDue >= 0 && daysUntilDue < 1 && !remindersSent.includes('due_today')) {
        reminderKey = 'due_today';
        template = 'payment-reminder-due-today';
        subject = `Payment due today: ${invoice.invoiceNumber} — ${tenantName}`;
      } else if (daysUntilDue <= -3 && daysUntilDue > -4 && !remindersSent.includes('overdue_3')) {
        reminderKey = 'overdue_3';
        template = 'payment-reminder-overdue';
        subject = `Overdue: ${invoice.invoiceNumber} was due ${dueDateStr} — ${tenantName}`;
      } else if (daysUntilDue <= -7 && daysUntilDue > -8 && !remindersSent.includes('overdue_7')) {
        reminderKey = 'overdue_7';
        template = 'payment-reminder-overdue';
        subject = `Overdue: ${invoice.invoiceNumber} was due ${dueDateStr} — ${tenantName}`;
      } else if (daysUntilDue <= -14 && daysUntilDue > -15 && !remindersSent.includes('overdue_14')) {
        reminderKey = 'overdue_14';
        template = 'payment-reminder-overdue';
        subject = `Final notice: ${invoice.invoiceNumber} is ${Math.abs(daysUntilDue)} days overdue — ${tenantName}`;
      }

      if (!reminderKey || !template || !subject) continue;

      // Record the reminder first, so a crash cannot send it twice.
      await db.invoice.update({
        where: { id: invoice.id },
        data: { metadata: { ...meta, remindersSent: [...remindersSent, reminderKey] } as Prisma.InputJsonValue },
      });

      let pdfAttachments: { filename: string; content: string; contentType: string }[] | undefined;
      try {
        const pdf = await this.pdfService.generateInvoicePDF(
          {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: String(invoice.amount),
            currency: invoice.currency,
            status: invoice.status,
            dueDate: invoice.dueDate,
            createdAt: invoice.createdAt,
            metadata: invoice.metadata as Record<string, unknown> | null,
          },
          { name: invoice.customer.name, email: invoice.customer.email, country: invoice.customer.country },
          { name: tenantName },
        );
        pdfAttachments = [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf.toString('base64'), contentType: 'application/pdf' }];
      } catch (pdfErr) {
        this.logger.error(`Failed to generate PDF for reminder ${invoice.id}`, pdfErr);
      }

      await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
        tenantId,
        to: invoice.customer.email,
        subject,
        template,
        context: {
          tenantName,
          customerName: invoice.customer.name || invoice.customer.email,
          invoiceId: invoice.invoiceNumber,
          amount: PdfService.formatAmount(invoice.amount, invoice.currency),
          currency: invoice.currency,
          dueDate: dueDateStr,
          daysOverdue: daysUntilDue < 0 ? String(Math.abs(daysUntilDue)) : '0',
        },
        attachments: pdfAttachments,
      });
      sentCount++;
    }

    if (sentCount > 0) this.logger.log(`Sent ${sentCount} payment reminders for tenant ${tenantId}`);
  }

  // ============================================================
  // Grace period: finalize draft invoices
  // ============================================================

  private async handleFinalizeDraftInvoices(job: Job<{ tenantId: string }>): Promise<void> {
    const { tenantId } = job.data;
    const db = await this.tenantDbService.getTenantClient(tenantId);
    const now = new Date();

    const drafts = await db.invoice.findMany({ where: { status: 'DRAFT' }, include: { customer: true, subscription: true } });
    let finalized = 0;
    for (const invoice of drafts) {
      const meta = (invoice.metadata as Record<string, unknown> | null) ?? {};
      // Engine-made drafts carry their grace period; drafts made by hand are finalized by hand.
      const endsAt = meta.gracePeriodEndsAt ? new Date(String(meta.gracePeriodEndsAt)) : null;
      if (!endsAt || endsAt > now) continue;

      const moved = await db.invoice.updateMany({ where: { id: invoice.id, status: 'DRAFT' }, data: { status: 'PENDING' } });
      if (moved.count === 0) continue;

      const tenant = await this.centralPrisma.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      const tenantName = tenant?.name || 'Your billing provider';

      if (invoice.customer?.email) {
        let attachments: { filename: string; content: string; contentType: string }[] | undefined;
        try {
          const pdf = await this.pdfService.generateInvoicePDF(
            {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              amount: String(invoice.amount),
              currency: invoice.currency,
              status: 'PENDING',
              dueDate: invoice.dueDate,
              createdAt: invoice.createdAt,
              metadata: meta,
            },
            { name: invoice.customer.name, email: invoice.customer.email, country: invoice.customer.country },
            { name: tenantName },
          );
          attachments = [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf.toString('base64'), contentType: 'application/pdf' }];
        } catch (pdfErr) {
          this.logger.error(`Failed to generate PDF for finalized invoice ${invoice.id}`, pdfErr);
        }
        await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
          tenantId,
          to: invoice.customer.email,
          subject: `Invoice ${invoice.invoiceNumber} from ${tenantName}`,
          template: 'invoice',
          context: {
            tenantName,
            customerName: invoice.customer.name || invoice.customer.email,
            invoiceId: invoice.invoiceNumber,
            amount: PdfService.formatAmount(invoice.amount, invoice.currency),
            currency: invoice.currency,
            dueDate: invoice.dueDate?.toISOString().split('T')[0] || '',
          },
          attachments,
        });
      }

      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
        tenantId,
        event: 'invoice.finalized',
        payload: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerId: invoice.customerId,
          amount: Number(invoice.amount),
          currency: invoice.currency,
        },
      });

      await this.queueAutoCharge(tenantId, invoice.id, dec(invoice.amount), invoice.subscriptionId, invoice.subscription?.paymentMethodId ?? null);
      finalized++;
    }
    if (finalized > 0) this.logger.log(`Finalized ${finalized} draft invoices for tenant ${tenantId}`);
  }

  // ============================================================
  // Progressive billing: invoice usage mid-period past a threshold
  // ============================================================

  private async handleCheckProgressiveBilling(job: Job<{ tenantId: string; subscriptionId: string }>): Promise<void> {
    const { tenantId, subscriptionId } = job.data;
    try {
      const db = await this.tenantDbService.getTenantClient(tenantId);
      const subscription = await db.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } });
      if (!subscription || subscription.status !== 'ACTIVE') return;

      const threshold = dec(subscription.plan.progressiveBillingThreshold);
      if (threshold.lte(0)) return;

      const now = new Date();
      const usage: UsageCharge = {
        planId: subscription.planId,
        periodStart: subscription.currentPeriodStart.toISOString(),
        from: subscription.currentPeriodStart.toISOString(),
        to: now.toISOString(),
      };
      // What would be billed now beyond earlier progressive invoices this period.
      const { lines } = await this.usageLines(db, subscriptionId, subscription.customerId, usage, 'progressive', subscription.currency);
      const unbilled = lines.reduce((sum, l) => sum.add(l.amount), new Dec(0));
      if (unbilled.lt(threshold)) return;

      this.logger.log(`Progressive billing triggered for subscription ${subscriptionId}: unbilled usage ${unbilled} >= threshold ${threshold}`);
      await this.queueInvoice({
        tenantId,
        subscriptionId,
        customerId: subscription.customerId,
        kind: 'progressive',
        billingKey: billingKey(subscriptionId, 'progressive', now),
        usage,
      });
    } catch (error) {
      this.logger.error(`Failed to check progressive billing for subscription ${subscriptionId}`, error);
    }
  }
}
