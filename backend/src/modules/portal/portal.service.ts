import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { amountDue } from '../invoices/apply-payment';
import { PAYPAL_CURRENCIES, type CheckoutMethod } from '../../providers/base-payment.provider';
import { ManagedAccountsService } from '../money/managed.service';
import { InvoicesService } from '../invoices/invoices.service';

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly invoices: InvoicesService,
    private readonly managed: ManagedAccountsService,
  ) {}

  /**
   * Whether this organisation's customers can pay by PayPal: through its own
   * PayPal, or through managed payments when its account offers PayPal.
   */
  async paymentOptions(db: PrismaClient, tenantId: string): Promise<{ paypal: boolean; paypalCurrencies: string[] }> {
    const active = await db.paymentProvider.findMany({ where: { isActive: true, providerName: { in: ['paypal', 'managed'] } }, select: { providerName: true } });
    let paypal = active.some((p) => p.providerName === 'paypal');
    if (!paypal && active.some((p) => p.providerName === 'managed')) {
      const status = await this.managed.status(db, tenantId).catch(() => null);
      paypal = status?.account?.status === 'active' && (status.account.methods ?? []).includes('paypal');
    }
    return { paypal, paypalCurrencies: PAYPAL_CURRENCIES };
  }

  async getCustomerByExternalId(db: PrismaClient, externalId: string) {
    const customer = await db.customer.findUnique({
      where: { externalId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async getBillingOverview(db: PrismaClient, customerId: string) {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, externalId: true, name: true, email: true, currency: true, country: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const [subscriptions, invoices, payments] = await Promise.all([
      db.subscription.findMany({
        where: { customerId, status: { in: ['ACTIVE', 'TRIALING', 'PAUSED'] } },
        include: { plan: { include: { prices: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.invoice.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.payment.findMany({
        where: { invoice: { customerId } },
        include: { invoice: { select: { id: true, invoiceNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const totalSpent = await db.invoice.aggregate({
      where: { customerId, status: 'PAID' },
      _sum: { amount: true },
    });

    return {
      customer,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        plan: {
          id: s.plan.id,
          name: s.plan.name,
          billingInterval: s.plan.billingInterval,
          prices: s.plan.prices,
        },
        currency: s.currency,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        trialStart: s.trialStart,
        trialEnd: s.trialEnd,
        cancelAt: s.cancelAt,
        createdAt: s.createdAt,
      })),
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.amount),
        currency: inv.currency,
        status: inv.status,
        dueDate: inv.dueDate,
        paidAt: inv.paidAt,
        // Downloaded through the portal route, with the same credentials.
        pdfUrl: inv.pdfUrl ? `/api/portal/customers/${encodeURIComponent(customer.externalId)}/invoices/${inv.id}/pdf` : null,
        createdAt: inv.createdAt,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        invoiceNumber: (p as any).invoice?.invoiceNumber,
        createdAt: p.createdAt,
      })),
      summary: {
        activeSubscriptions: subscriptions.filter((s) => s.status === 'ACTIVE').length,
        totalSpent: Number(totalSpent._sum.amount || 0),
        currency: customer.currency,
        pendingInvoices: invoices.filter((i) => i.status === 'PENDING').length,
      },
    };
  }

  async getSubscriptions(db: PrismaClient, customerId: string) {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    return db.subscription.findMany({
      where: { customerId },
      include: { plan: { include: { prices: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvoices(db: PrismaClient, customerId: string, query: { status?: string; page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { externalId: true } });

    const where: Record<string, unknown> = { customerId };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      db.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.invoice.count({ where }),
    ]);

    return {
      data: data.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: Number(inv.amount),
        currency: inv.currency,
        status: inv.status,
        dueDate: inv.dueDate,
        paidAt: inv.paidAt,
        // Downloaded through the portal route, with the same credentials.
        pdfUrl: inv.pdfUrl ? `/api/portal/customers/${encodeURIComponent(customer.externalId)}/invoices/${inv.id}/pdf` : null,
        createdAt: inv.createdAt,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getInvoiceCheckout(db: PrismaClient, customerId: string, invoiceId: string, callbackUrl?: string, tenantId?: string, method?: CheckoutMethod) {
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.customerId !== customerId) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') throw new BadRequestException('Invoice is already paid');
    if (invoice.status === 'CANCELED') throw new BadRequestException('Invoice has been voided');
    if (amountDue(invoice).lte(0)) throw new BadRequestException('Nothing to pay on this invoice');

    // The same checkout as the API: providers in priority order, managed payments last.
    const result = await this.invoices.createCheckout(db, invoiceId, callbackUrl, undefined, tenantId, undefined, method);

    return {
      checkoutUrl: result.checkoutUrl,
      paymentId: result.paymentId,
      provider: result.provider,
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(amountDue(invoice)),
      currency: invoice.currency,
    };
  }

  async getPayments(db: PrismaClient, customerId: string, query: { page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const invoiceIds = await db.invoice.findMany({
      where: { customerId },
      select: { id: true },
    });

    const where = { invoiceId: { in: invoiceIds.map((i) => i.id) } };

    const [data, total] = await Promise.all([
      db.payment.findMany({
        where,
        skip,
        take: limit,
        include: { invoice: { select: { id: true, invoiceNumber: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.payment.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        invoiceId: p.invoiceId,
        invoiceNumber: (p as any).invoice?.invoiceNumber,
        createdAt: p.createdAt,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
