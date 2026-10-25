import { Injectable, Logger, Optional } from '@nestjs/common';
import { CurrenciesService } from '../currencies/currencies.service';
import { Converter } from '../currencies/converter';
import { PrismaClient } from '../../generated/prisma-tenant/client';

interface DateRange {
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Optional() private readonly currencies?: CurrenciesService) {}

  /**
   * Converts into the organisation's reporting currency at each amount's own
   * day. Without an organisation (or the currencies service), amounts are
   * taken as they are, in USD.
   */
  private async converter(db: PrismaClient, tenantId: string | undefined, currencies: Iterable<string>, dates: Date[]): Promise<Converter> {
    if (!tenantId || !this.currencies) return new Converter('USD', [], new Map());
    const times = dates.map((d) => d.getTime());
    const from = new Date(times.length ? Math.min(...times) : Date.now());
    return this.currencies.converter(db, tenantId, currencies, from, new Date());
  }

  async getRevenueAnalytics(db: PrismaClient, params: DateRange & { currency?: string }, tenantId?: string) {
    const where: Record<string, unknown> = { status: 'PAID' };

    if (params.dateFrom || params.dateTo) {
      where.paidAt = {
        ...(params.dateFrom && { gte: new Date(params.dateFrom) }),
        ...(params.dateTo && { lte: new Date(params.dateTo) }),
      };
    }

    if (params.currency) {
      where.currency = params.currency;
    }

    const [paidInvoices, invoiceCount, mrrData] = await Promise.all([
      db.invoice.findMany({
        where,
        select: { amount: true, currency: true, paidAt: true, createdAt: true },
      }),
      db.invoice.count({ where }),
      db.subscription.findMany({
        where: { status: 'ACTIVE' },
        include: { plan: { include: { prices: true } } },
      }),
    ]);

    const fx = await this.converter(
      db,
      tenantId,
      [...paidInvoices.map((i) => i.currency), ...mrrData.map((s) => s.currency)],
      paidInvoices.map((i) => i.paidAt ?? i.createdAt),
    );
    // Revenue at the rate of the day each invoice was paid; per currency exactly as collected.
    let totalRevenue = 0;
    const byCurrency = new Map<string, number>();
    for (const inv of paidInvoices) {
      totalRevenue += fx.sum(Number(inv.amount), inv.currency, inv.paidAt ?? inv.createdAt);
      byCurrency.set(inv.currency, (byCurrency.get(inv.currency) ?? 0) + Number(inv.amount));
    }

    // MRR from active subscriptions, at today's rates.
    let mrr = 0;
    for (const sub of mrrData) {
      const price = sub.plan.prices.find((p: any) => p.currency === sub.currency);
      if (price) {
        const amount = Number(price.amount);
        let monthlyAmount: number;
        switch (sub.plan.billingInterval) {
          case 'MONTHLY':
            monthlyAmount = amount;
            break;
          case 'QUARTERLY':
            monthlyAmount = amount / 3;
            break;
          case 'YEARLY':
            monthlyAmount = amount / 12;
            break;
          default:
            monthlyAmount = amount;
        }
        mrr += fx.sum(monthlyAmount, sub.currency);
      }
    }

    return {
      totalRevenue: totalRevenue.toFixed(2),
      invoiceCount,
      mrr: mrr.toFixed(2),
      arr: (mrr * 12).toFixed(2),
      byCurrency: [...byCurrency.entries()].sort().map(([currency, amount]) => ({ currency, amount: amount.toFixed(4) })),
      ...fx.describe(),
    };
  }

  async getSubscriptionAnalytics(db: PrismaClient, params: DateRange) {
    const dateFilter: Record<string, unknown> = {};
    if (params.dateFrom || params.dateTo) {
      dateFilter.createdAt = {
        ...(params.dateFrom && { gte: new Date(params.dateFrom) }),
        ...(params.dateTo && { lte: new Date(params.dateTo) }),
      };
    }

    const [total, active, canceled, trialing, paused, newSubs] = await Promise.all([
      db.subscription.count(),
      db.subscription.count({ where: { status: 'ACTIVE' } }),
      db.subscription.count({
        where: { status: 'CANCELED', ...dateFilter },
      }),
      db.subscription.count({ where: { status: 'TRIALING' } }),
      db.subscription.count({ where: { status: 'PAUSED' } }),
      db.subscription.count({ where: dateFilter }),
    ]);

    const churnRate = total > 0 ? ((canceled / total) * 100).toFixed(2) : '0';
    const retentionRate = (100 - parseFloat(churnRate)).toFixed(2);

    return {
      total,
      active,
      canceled,
      trialing,
      paused,
      newSubscriptions: newSubs,
      churnRate: `${churnRate}%`,
      retentionRate: `${retentionRate}%`,
    };
  }

  async getCustomerAnalytics(db: PrismaClient, params: DateRange, tenantId?: string) {
    const dateFilter: Record<string, unknown> = {};
    if (params.dateFrom || params.dateTo) {
      dateFilter.createdAt = {
        ...(params.dateFrom && { gte: new Date(params.dateFrom) }),
        ...(params.dateTo && { lte: new Date(params.dateTo) }),
      };
    }

    const [totalCustomers, newCustomers, paidInvoices] = await Promise.all([
      db.customer.count(),
      db.customer.count({ where: dateFilter }),
      db.invoice.findMany({
        where: { status: 'PAID' },
        select: { amount: true, currency: true, paidAt: true, createdAt: true },
      }),
    ]);

    const fx = await this.converter(db, tenantId, paidInvoices.map((i) => i.currency), paidInvoices.map((i) => i.paidAt ?? i.createdAt));
    let totalRevenue = 0;
    for (const inv of paidInvoices) {
      totalRevenue += fx.sum(Number(inv.amount), inv.currency, inv.paidAt ?? inv.createdAt);
    }
    const arpu = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

    return {
      totalCustomers,
      newCustomers,
      arpu: arpu.toFixed(2),
      totalRevenue: totalRevenue.toFixed(2),
      ...fx.describe(),
    };
  }

  /**
   * MRR breakdown: total, new, expansion, contraction, churn, net-new, by plan
   */
  async getMrrBreakdown(db: PrismaClient, params: DateRange, tenantId?: string) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Current active subscriptions for total MRR + by-plan
    const activeSubs = await db.subscription.findMany({
      where: { status: 'ACTIVE' },
      include: { plan: { include: { prices: true } } },
    });

    const fx = await this.converter(db, tenantId, activeSubs.map((s) => s.currency), []);

    // Compute MRR by plan
    const planMap = new Map<string, { planName: string; mrr: number; count: number }>();
    let totalMrr = 0;

    for (const sub of activeSubs) {
      const price = sub.plan.prices.find((p: any) => p.currency === sub.currency);
      if (!price) continue;
      const amount = Number(price.amount);
      let monthly: number;
      switch (sub.plan.billingInterval) {
        case 'QUARTERLY': monthly = amount / 3; break;
        case 'YEARLY': monthly = amount / 12; break;
        default: monthly = amount;
      }
      const mrrUsd = fx.sum(monthly, sub.currency);
      totalMrr += mrrUsd;

      const existing = planMap.get(sub.planId);
      if (existing) {
        existing.mrr += mrrUsd;
        existing.count += 1;
      } else {
        planMap.set(sub.planId, { planName: sub.plan.name, mrr: mrrUsd, count: 1 });
      }
    }

    // New MRR = subscriptions created this month
    const newSubs = activeSubs.filter(s => s.createdAt >= thisMonthStart);
    let newMrr = 0;
    for (const sub of newSubs) {
      const price = sub.plan.prices.find((p: any) => p.currency === sub.currency);
      if (!price) continue;
      const amount = Number(price.amount);
      let monthly: number;
      switch (sub.plan.billingInterval) {
        case 'QUARTERLY': monthly = amount / 3; break;
        case 'YEARLY': monthly = amount / 12; break;
        default: monthly = amount;
      }
      newMrr += fx.sum(monthly, sub.currency);
    }

    // Churn MRR = subscriptions canceled this month
    const churned = await db.subscription.findMany({
      where: {
        status: 'CANCELED',
        canceledAt: { gte: thisMonthStart },
      },
      include: { plan: { include: { prices: true } } },
    });
    let churnMrr = 0;
    for (const sub of churned) {
      const price = sub.plan.prices.find((p: any) => p.currency === sub.currency);
      if (!price) continue;
      const amount = Number(price.amount);
      let monthly: number;
      switch (sub.plan.billingInterval) {
        case 'QUARTERLY': monthly = amount / 3; break;
        case 'YEARLY': monthly = amount / 12; break;
        default: monthly = amount;
      }
      churnMrr += fx.sum(monthly, sub.currency);
    }

    // Expansion/contraction from plan changes this month
    const changedSubs = activeSubs.filter(
      s => (s as any).previousPlanId && s.updatedAt >= thisMonthStart,
    );
    let expansionMrr = 0;
    let contractionMrr = 0;
    for (const sub of changedSubs) {
      const prevPlan = await db.plan.findUnique({
        where: { id: (sub as any).previousPlanId },
        include: { prices: true },
      });
      if (!prevPlan) continue;
      const oldPrice = prevPlan.prices.find((p: any) => p.currency === sub.currency);
      const newPrice = sub.plan.prices.find((p: any) => p.currency === sub.currency);
      if (!oldPrice || !newPrice) continue;
      const diff = fx.sum(Number(newPrice.amount), sub.currency) - fx.sum(Number(oldPrice.amount), sub.currency);
      if (diff > 0) expansionMrr += diff;
      else contractionMrr += Math.abs(diff);
    }

    const netNewMrr = newMrr + expansionMrr - contractionMrr - churnMrr;

    const byPlan = Array.from(planMap.entries()).map(([planId, data]) => ({
      planId,
      planName: data.planName,
      mrr: Math.round(data.mrr * 100) / 100,
      subscriptionCount: data.count,
    }));

    return {
      totalMrr: Math.round(totalMrr * 100) / 100,
      newMrr: Math.round(newMrr * 100) / 100,
      expansionMrr: Math.round(expansionMrr * 100) / 100,
      contractionMrr: Math.round(contractionMrr * 100) / 100,
      churnMrr: Math.round(churnMrr * 100) / 100,
      netNewMrr: Math.round(netNewMrr * 100) / 100,
      byPlan,
      ...fx.describe(),
    };
  }

  /**
   * Net revenue: gross revenue - refunds - credit notes
   */
  async getNetRevenue(db: PrismaClient, params: DateRange, tenantId?: string) {
    const dateFilter: Record<string, unknown> = {};
    if (params.dateFrom || params.dateTo) {
      dateFilter.createdAt = {
        ...(params.dateFrom && { gte: new Date(params.dateFrom) }),
        ...(params.dateTo && { lte: new Date(params.dateTo) }),
      };
    }

    const [paidInvoices, refunds, creditNotes] = await Promise.all([
      db.invoice.findMany({
        where: { status: 'PAID', ...dateFilter },
        select: { amount: true, currency: true, paidAt: true, createdAt: true },
      }),
      db.payment.findMany({
        where: { status: 'REFUNDED', ...dateFilter },
        select: { amount: true, currency: true, createdAt: true },
      }),
      db.creditNote.findMany({
        where: { status: 'FINALIZED', ...dateFilter },
        select: { amount: true, currency: true, createdAt: true },
      }),
    ]);

    const all = [...paidInvoices, ...refunds, ...creditNotes];
    const fx = await this.converter(db, tenantId, all.map((r) => r.currency), all.map((r) => r.createdAt));

    let grossRevenue = 0;
    for (const inv of paidInvoices) {
      grossRevenue += fx.sum(Number(inv.amount), inv.currency, inv.paidAt ?? inv.createdAt);
    }

    let refundTotal = 0;
    for (const r of refunds) {
      refundTotal += fx.sum(Number(r.amount), r.currency, r.createdAt);
    }

    let creditNoteTotal = 0;
    for (const cn of creditNotes) {
      creditNoteTotal += fx.sum(Number(cn.amount), cn.currency, cn.createdAt);
    }

    return {
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      refunds: Math.round(refundTotal * 100) / 100,
      creditNotes: Math.round(creditNoteTotal * 100) / 100,
      netRevenue: Math.round((grossRevenue - refundTotal - creditNoteTotal) * 100) / 100,
      ...fx.describe(),
    };
  }

  /**
   * Churn cohort analysis: retention matrix by month
   */
  async getChurnCohorts(db: PrismaClient, params: { months?: number }) {
    const numMonths = params.months || 12;
    const now = new Date();
    const months: string[] = [];
    const cohorts: Array<{ month: string; totalCustomers: number; retentionPercentages: number[] }> = [];

    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }

    for (let i = 0; i < months.length; i++) {
      const cohortMonth = months[i];
      const [year, month] = cohortMonth.split('-').map(Number);
      const cohortStart = new Date(year, month - 1, 1);
      const cohortEnd = new Date(year, month, 0, 23, 59, 59);

      // Customers who created their first subscription in this month
      const cohortSubs = await db.subscription.findMany({
        where: {
          createdAt: { gte: cohortStart, lte: cohortEnd },
        },
        select: { customerId: true },
      });
      const cohortCustomerIds = [...new Set(cohortSubs.map(s => s.customerId))];
      const totalCustomers = cohortCustomerIds.length;

      if (totalCustomers === 0) {
        cohorts.push({ month: cohortMonth, totalCustomers: 0, retentionPercentages: [] });
        continue;
      }

      // For each subsequent month, check how many still had active subscription
      const retentionPercentages: number[] = [];
      for (let j = i; j < months.length; j++) {
        const [checkYear, checkMonth] = months[j].split('-').map(Number);
        const checkEnd = new Date(checkYear, checkMonth, 0, 23, 59, 59);

        // Count customers who still have a subscription that was active at check month end
        const retained = await db.subscription.findMany({
          where: {
            customerId: { in: cohortCustomerIds },
            createdAt: { lte: checkEnd },
            OR: [
              { status: 'ACTIVE' },
              { status: 'TRIALING' },
              { canceledAt: { gt: checkEnd } },
            ],
          },
          select: { customerId: true },
          distinct: ['customerId'],
        });

        retentionPercentages.push(
          Math.round((retained.length / totalCustomers) * 10000) / 100,
        );
      }

      cohorts.push({ month: cohortMonth, totalCustomers, retentionPercentages });
    }

    return { months, cohorts };
  }

  /**
   * Customer LTV: average lifetime value + by plan
   */
  async getLtv(db: PrismaClient, tenantId?: string) {
    // Get all subscriptions with their total paid amounts
    const subscriptions = await db.subscription.findMany({
      include: {
        plan: { select: { id: true, name: true } },
        invoices: {
          where: { status: 'PAID' },
          select: { amount: true, currency: true, paidAt: true, createdAt: true },
        },
      },
    });
    const invoices = subscriptions.flatMap((s) => ((s as any).invoices ?? []) as { currency: string; paidAt: Date | null; createdAt: Date }[]);
    const fx = await this.converter(db, tenantId, invoices.map((i) => i.currency), invoices.map((i) => i.paidAt ?? i.createdAt));

    const now = new Date();
    let totalLtv = 0;
    let totalLifespanDays = 0;
    let subCount = 0;

    const planLtv = new Map<string, { planName: string; totalLtv: number; totalLifespan: number; count: number }>();

    for (const sub of subscriptions) {
      const endDate = sub.canceledAt || now;
      const lifespanMs = endDate.getTime() - sub.createdAt.getTime();
      const lifespanDays = Math.max(1, lifespanMs / (1000 * 60 * 60 * 24));

      let ltv = 0;
      for (const inv of (sub as any).invoices || []) {
        ltv += fx.sum(Number(inv.amount), inv.currency, inv.paidAt ?? inv.createdAt);
      }

      totalLtv += ltv;
      totalLifespanDays += lifespanDays;
      subCount++;

      const existing = planLtv.get(sub.planId);
      if (existing) {
        existing.totalLtv += ltv;
        existing.totalLifespan += lifespanDays;
        existing.count += 1;
      } else {
        planLtv.set(sub.planId, {
          planName: sub.plan.name,
          totalLtv: ltv,
          totalLifespan: lifespanDays,
          count: 1,
        });
      }
    }

    const byPlan = Array.from(planLtv.entries()).map(([planId, data]) => ({
      planId,
      planName: data.planName,
      avgLtv: Math.round((data.totalLtv / data.count) * 100) / 100,
      avgLifespanDays: Math.round(data.totalLifespan / data.count),
    }));

    return {
      avgLtv: subCount > 0 ? Math.round((totalLtv / subCount) * 100) / 100 : 0,
      avgLifespanDays: subCount > 0 ? Math.round(totalLifespanDays / subCount) : 0,
      byPlan,
      ...fx.describe(),
    };
  }

  async getPaymentAnalytics(db: PrismaClient, params: DateRange & { provider?: string }) {
    const where: Record<string, unknown> = {};
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom && { gte: new Date(params.dateFrom) }),
        ...(params.dateTo && { lte: new Date(params.dateTo) }),
      };
    }
    if (params.provider) {
      where.provider = params.provider;
    }

    const [total, succeeded, failed] = await Promise.all([
      db.payment.count({ where }),
      db.payment.count({ where: { ...where, status: 'SUCCEEDED' } }),
      db.payment.count({ where: { ...where, status: 'FAILED' } }),
    ]);

    const successRate = total > 0 ? ((succeeded / total) * 100).toFixed(2) : '0';

    return {
      totalPayments: total,
      succeeded,
      failed,
      pending: total - succeeded - failed,
      successRate: `${successRate}%`,
    };
  }

  /**
   * Aggregated KPIs endpoint – returns all headline metrics in a single call.
   */
  async getKpis(db: PrismaClient, tenantId?: string) {
    const [revenueData, subData, custData, payData, ltvData] = await Promise.all([
      this.getRevenueAnalytics(db, {}, tenantId),
      this.getSubscriptionAnalytics(db, {}),
      this.getCustomerAnalytics(db, {}, tenantId),
      this.getPaymentAnalytics(db, {}),
      this.getLtv(db, tenantId),
    ]);

    return {
      mrr: Number(revenueData.mrr),
      arr: Number(revenueData.arr),
      totalRevenue: Number(revenueData.totalRevenue),
      activeSubscriptions: subData.active,
      totalSubscriptions: subData.total,
      totalCustomers: custData.totalCustomers,
      newCustomers: custData.newCustomers,
      churnRate: subData.churnRate,
      retentionRate: subData.retentionRate,
      successRate: payData.successRate,
      arpu: Number(custData.arpu),
      avgLtv: ltvData.avgLtv,
      avgLifespanDays: ltvData.avgLifespanDays,
      currency: revenueData.currency,
      ratesAsOf: revenueData.ratesAsOf,
      unconverted: [...new Set([...revenueData.unconverted, ...custData.unconverted, ...ltvData.unconverted])].sort(),
    };
  }

  /**
   * Money per currency, exactly as it is (nothing converted), like a
   * provider's balances: collected this month and last, what is still owed,
   * and recurring revenue. Each with its value in the reporting currency.
   */
  async getByCurrency(db: PrismaClient, tenantId?: string) {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [paid, open, subs] = await Promise.all([
      db.invoice.findMany({ where: { status: 'PAID', paidAt: { gte: lastMonth } }, select: { amount: true, currency: true, paidAt: true } }),
      db.invoice.findMany({ where: { status: { in: ['PENDING', 'FAILED'] } }, select: { amount: true, currency: true } }),
      db.subscription.findMany({ where: { status: 'ACTIVE' }, include: { plan: { include: { prices: true } } } }),
    ]);
    const rows = new Map<string, { collectedThisMonth: number; collectedLastMonth: number; outstanding: number; mrr: number }>();
    const row = (c: string) => rows.get(c) ?? rows.set(c, { collectedThisMonth: 0, collectedLastMonth: 0, outstanding: 0, mrr: 0 }).get(c)!;
    for (const i of paid) row(i.currency)[i.paidAt && i.paidAt >= thisMonth ? 'collectedThisMonth' : 'collectedLastMonth'] += Number(i.amount);
    for (const i of open) row(i.currency).outstanding += Number(i.amount);
    for (const sub of subs) {
      const price = sub.plan.prices.find((p) => p.currency === sub.currency);
      if (!price) continue;
      const amount = Number(price.amount);
      row(sub.currency).mrr += sub.plan.billingInterval === 'YEARLY' ? amount / 12 : sub.plan.billingInterval === 'QUARTERLY' ? amount / 3 : amount;
    }
    const fx = await this.converter(db, tenantId, rows.keys(), []);
    const currencies = [...rows.entries()]
      .map(([currency, r]) => ({
        currency,
        collectedThisMonth: r.collectedThisMonth.toFixed(4),
        collectedLastMonth: r.collectedLastMonth.toFixed(4),
        outstanding: r.outstanding.toFixed(4),
        mrr: r.mrr.toFixed(4),
        /** One unit in the reporting currency, at today's rate; null when there is no rate. */
        rate: fx.convert(1, currency),
      }))
      .sort((a, b) => (fx.convert(Number(b.collectedThisMonth) + Number(b.outstanding), b.currency) ?? 0) - (fx.convert(Number(a.collectedThisMonth) + Number(a.outstanding), a.currency) ?? 0));
    return { currencies, ...fx.describe() };
  }
}
