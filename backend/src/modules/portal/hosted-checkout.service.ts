import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { TenantDatabaseService } from '../../database/tenant-database.service';
import { CheckoutTokenPayload, verifyCheckoutToken } from '../../common/auth/tokens';
import { assertTenantAccess } from '../../common/guards/tenant-access';
import { isSandbox } from '../../config/sandbox';
import { CheckoutMethod } from '../../providers/base-payment.provider';
import { amountDue } from '../invoices/apply-payment';
import { InvoicesService } from '../invoices/invoices.service';
import { PortalService } from './portal.service';

const EXPIRED = 'This payment link has expired. Ask for a new one.';

/**
 * The hosted checkout: a page the customer reaches with a link for one
 * invoice, where they choose how to pay from what the organisation takes.
 * The link's token is the only credential, and it reaches this invoice alone.
 */
@Injectable()
export class HostedCheckoutService {
  constructor(
    private readonly central: CentralPrismaService,
    private readonly tenantDb: TenantDatabaseService,
    private readonly invoices: InvoicesService,
    private readonly portal: PortalService,
  ) {}

  private async open(token: string) {
    const claims = verifyCheckoutToken(token, process.env.JWT_SECRET!);
    if (!claims) throw new UnauthorizedException(EXPIRED);
    const tenant = await this.central.client.tenant.findUnique({ where: { id: claims.sub } });
    if (!tenant || !tenant.isActive) throw new NotFoundException('This payment link is no longer available');
    try {
      // Paying is a write, but one a read-only organisation should still allow.
      assertTenantAccess(tenant, 'GET', '/pay');
    } catch {
      // The reason is for the organisation, not its customers.
      throw new NotFoundException('This payment link is no longer available');
    }
    const db = await this.tenantDb.getTenantClient(tenant.id);
    const invoice = await db.invoice.findUnique({ where: { id: claims.inv }, include: { customer: { select: { name: true } } } });
    if (!invoice) throw new NotFoundException('This payment link is no longer available');
    return { claims, tenant, db, invoice };
  }

  /** What to charge now: nothing once the invoice is settled or a part-payment link has been used. */
  private amountNow(claims: CheckoutTokenPayload, invoice: { status: string; amount: unknown; amountPaid: unknown }): number {
    if (invoice.status === 'PAID' || invoice.status === 'CANCELED') return 0;
    const due = Number(amountDue(invoice as never));
    if (claims.amt === undefined) return Math.max(due, 0);
    if (Number(invoice.amountPaid) > (claims.paid ?? 0)) return 0;
    return Math.max(Math.min(claims.amt, due), 0);
  }

  async view(token: string) {
    const { claims, tenant, db, invoice } = await this.open(token);
    const amount = this.amountNow(claims, invoice);
    const stored = (invoice.metadata as { items?: unknown } | null)?.items;
    const items = (Array.isArray(stored) ? stored : []).map((i: { description?: unknown; quantity?: unknown; unitAmount?: unknown }) => ({
      description: String(i.description ?? ''),
      quantity: Number(i.quantity ?? 1),
      unitAmount: Number(i.unitAmount ?? 0),
    }));
    return {
      merchant: { name: tenant.name },
      customer: { name: invoice.customer.name },
      invoice: {
        number: invoice.invoiceNumber,
        status: invoice.status,
        currency: invoice.currency,
        total: Number(invoice.amount),
        paid: Number(invoice.amountPaid),
        dueDate: invoice.dueDate,
        items,
      },
      amount,
      methods: amount > 0 ? await this.portal.checkoutMethods(db, tenant.id, invoice.currency) : [],
      returnUrl: claims.ret ?? null,
      sandbox: isSandbox(),
    };
  }

  /** Start the payment the customer chose; the address is built here, never taken from the page. */
  async pay(token: string, method: CheckoutMethod) {
    const { claims, tenant, db, invoice } = await this.open(token);
    const amount = this.amountNow(claims, invoice);
    if (amount <= 0) throw new BadRequestException('This has already been paid');
    const methods = await this.portal.checkoutMethods(db, tenant.id, invoice.currency);
    if (!methods.includes(method)) throw new BadRequestException('That way of paying is not available for this payment');
    const dashboardUrl = (process.env.DASHBOARD_URL || 'http://localhost:4002').replace(/\/$/, '');
    const result = await this.invoices.createCheckout(db, invoice.id, `${dashboardUrl}/pay/${token}?returned=1`, undefined, tenant.id, claims.amt === undefined ? undefined : amount, method);
    return { checkoutUrl: result.checkoutUrl };
  }
}
