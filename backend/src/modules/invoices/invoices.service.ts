import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { EncryptionService } from '../../services/encryption.service';
import { PdfService } from '../../services/pdf.service';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { CHECKOUT_PROVIDER_NAMES, ProviderFactory } from '../../providers/provider.factory';
import { WalletsService } from '../wallets/wallets.service';
import { nextInvoiceNumber } from '../billing/invoice-number';
import { dec, Dec, roundMoney } from '../billing/pricing';
import {
  EMAIL_QUEUE,
  WEBHOOK_QUEUE,
  EmailJobType,
  WebhookJobType,
} from '../../queues/billing.queue';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly pdfService: PdfService,
    private readonly centralPrisma: CentralPrismaService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    private readonly wallets?: WalletsService,
  ) {}

  async generateInvoiceNumber(db: PrismaClient): Promise<string> {
    return nextInvoiceNumber(db);
  }

  private async getTenantInfo(tenantId: string) {
    const tenant = await this.centralPrisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, email: true, settings: true },
    });
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    return {
      name: tenant?.name || 'Invoice',
      email: tenant?.email,
      address: settings.address as string | undefined,
      country: settings.country as string | undefined,
      taxId: settings.taxId as string | undefined,
    };
  }

  async findAll(db: PrismaClient, query: InvoiceQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
        ...(query.dateTo && { lte: new Date(query.dateTo) }),
      };
    }

    const [data, total] = await Promise.all([
      db.invoice.findMany({
        where,
        skip,
        take: limit,
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
      }),
      db.invoice.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(db: PrismaClient, id: string) {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        subscription: true,
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async create(db: PrismaClient, tenantId: string, dto: CreateInvoiceDto) {
    const customer = await db.customer.findUnique({
      where: { id: dto.customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const currency = dto.currency?.toUpperCase() || customer.currency;
    const totalAmount = roundMoney(
      dto.items.reduce((sum, item) => sum.add(dec(item.quantity).mul(dec(item.unitAmount))), new Dec(0)),
      currency,
    );
    if (dto.invoiceNumber && (await db.invoice.findUnique({ where: { invoiceNumber: dto.invoiceNumber }, select: { id: true } }))) {
      throw new BadRequestException(`Invoice number ${dto.invoiceNumber} is already used`);
    }
    const invoiceNumber = dto.invoiceNumber || await this.generateInvoiceNumber(db);

    const invoice = await db.invoice.create({
      data: {
        invoiceNumber,
        customerId: dto.customerId,
        subscriptionId: dto.subscriptionId,
        amount: totalAmount,
        currency,
        dueDate: new Date(dto.dueDate),
        metadata: { items: dto.items } as any,
        ...(dto.status && { status: dto.status }),
        ...(dto.paidAt && { paidAt: new Date(dto.paidAt) }),
        ...(dto.createdAt && { createdAt: new Date(dto.createdAt) }),
      },
      include: { customer: true },
    });

    // Generate PDF for the new invoice
    const tenantInfo = await this.getTenantInfo(tenantId);
    try {
      const pdfBuffer = await this.pdfService.generateInvoicePDF(
        {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: totalAmount.toString(),
          currency,
          status: invoice.status,
          dueDate: new Date(dto.dueDate),
          createdAt: invoice.createdAt,
          metadata: { items: dto.items },
        },
        {
          name: customer.name,
          email: customer.email,
          country: customer.country,
        },
        tenantInfo,
      );
      const filename = `invoice-${invoice.id}.pdf`;
      await this.pdfService.savePdf(pdfBuffer, filename);
      const pdfUrl = this.pdfService.getPublicUrl(filename);

      await db.invoice.update({
        where: { id: invoice.id },
        data: { pdfUrl },
      });

      (invoice as any).pdfUrl = pdfUrl;
      this.logger.log(`PDF generated for invoice ${invoice.id}`);
    } catch (error) {
      this.logger.error(`Failed to generate PDF for invoice ${invoice.id}`, error);
    }

    return invoice;
  }

  async finalize(db: PrismaClient, tenantId: string, id: string) {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be finalized');
    }

    const updated = await db.invoice.update({
      where: { id },
      data: { status: 'PENDING' },
      include: { customer: true },
    });

    // Email customer the finalized invoice with PDF attachment
    if (invoice.customer?.email) {
      const tenantInfo = await this.getTenantInfo(tenantId);
      let pdfAttachments: { filename: string; content: string; contentType: string }[] | undefined;
      try {
        const pdfBuffer = await this.generateOrGetPdf(db, tenantId, id);
        pdfAttachments = [{
          filename: `${invoice.invoiceNumber || 'invoice'}.pdf`,
          content: pdfBuffer.toString('base64'),
          contentType: 'application/pdf',
        }];
      } catch (error) {
        this.logger.error(`Failed to generate PDF attachment for invoice ${id}`, error);
      }

      await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
        tenantId,
        to: invoice.customer.email,
        subject: `Invoice ${invoice.invoiceNumber} from ${tenantInfo.name}`,
        template: 'invoice',
        context: {
          tenantName: tenantInfo.name,
          customerName: invoice.customer.name || invoice.customer.email,
          invoiceId: invoice.invoiceNumber,
          amount: PdfService.formatAmount(invoice.amount, invoice.currency),
          currency: invoice.currency,
          dueDate: invoice.dueDate?.toISOString().split('T')[0] || '',
        },
        attachments: pdfAttachments,
      });
    }

    // Webhook
    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'invoice.finalized',
      payload: {
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        amount: Number(invoice.amount),
        currency: invoice.currency,
      },
    });

    return updated;
  }

  async void(db: PrismaClient, tenantId: string, id: string) {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('Cannot void a paid invoice');
    }
    if (invoice.status === 'CANCELED') {
      throw new BadRequestException('Invoice is already voided');
    }

    // Compare-and-set, so a payment settling at the same moment wins or loses cleanly.
    const moved = await db.invoice.updateMany({
      where: { id, status: { in: ['DRAFT', 'PENDING', 'FAILED'] } },
      data: { status: 'CANCELED' },
    });
    if (moved.count === 0) throw new BadRequestException('Invoice changed while voiding; reload and try again');
    const updated = await db.invoice.findUniqueOrThrow({ where: { id }, include: { customer: true } });

    // Prepaid credits it used go back to the customer's wallets; stop open retries.
    const refunded = (await this.wallets?.refundInvoice(db, id)) ?? 0;
    if (refunded > 0) this.logger.log(`Returned ${refunded} ${invoice.currency} of wallet credits for voided invoice ${id}`);
    await db.paymentRetry.updateMany({ where: { invoiceId: id, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'CANCELED' } });

    // Email customer
    if (invoice.customer?.email) {
      const tenantInfo = await this.getTenantInfo(tenantId);
      await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
        tenantId,
        to: invoice.customer.email,
        subject: `Invoice ${invoice.invoiceNumber} voided — ${tenantInfo.name}`,
        template: 'invoice-voided',
        context: {
          tenantName: tenantInfo.name,
          customerName: invoice.customer.name || invoice.customer.email,
          invoiceId: invoice.invoiceNumber,
        },
      });
    }

    // Webhook
    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'invoice.voided',
      payload: {
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
      },
    });

    return updated;
  }

  async markPaid(db: PrismaClient, tenantId: string, id: string, paymentMethod?: string) {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('Invoice is already paid');
    }
    if (invoice.status === 'CANCELED') {
      throw new BadRequestException('A voided invoice cannot be marked paid');
    }

    const now = new Date();
    const provider = paymentMethod || 'manual';

    // Invoice and payment record change together, and only from an unpaid state.
    const updatedInvoice = await db.$transaction(async (tx) => {
      const moved = await tx.invoice.updateMany({
        where: { id, status: { in: ['DRAFT', 'PENDING', 'FAILED'] } },
        data: { status: 'PAID', paidAt: now },
      });
      if (moved.count === 0) throw new BadRequestException('Invoice changed meanwhile; reload and try again');
      await tx.payment.create({
        data: { invoiceId: id, provider, amount: invoice.amount, currency: invoice.currency, status: 'SUCCEEDED' },
      });
      return tx.invoice.findUniqueOrThrow({ where: { id }, include: { customer: true } });
    });
    await db.paymentRetry.updateMany({ where: { invoiceId: id, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'SUCCESS' } });

    // Email customer
    if (invoice.customer?.email) {
      const tenantInfo = await this.getTenantInfo(tenantId);
      await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
        tenantId,
        to: invoice.customer.email,
        subject: `Payment received for ${invoice.invoiceNumber} — ${tenantInfo.name}`,
        template: 'invoice-paid',
        context: {
          tenantName: tenantInfo.name,
          customerName: invoice.customer.name || invoice.customer.email,
          invoiceId: invoice.invoiceNumber,
          amount: PdfService.formatAmount(invoice.amount, invoice.currency),
          currency: invoice.currency,
        },
      });
    }

    // Webhook
    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'invoice.paid',
      payload: {
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        amount: Number(invoice.amount),
        currency: invoice.currency,
      },
    });

    return updatedInvoice;
  }

  async generateOrGetPdf(db: PrismaClient, tenantId: string, id: string): Promise<Buffer> {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const tenantInfo = await this.getTenantInfo(tenantId);

    const pdfBuffer = await this.pdfService.generateInvoicePDF(
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
      {
        name: invoice.customer?.name,
        email: invoice.customer?.email || '',
        country: invoice.customer?.country,
      },
      tenantInfo,
    );

    // Save and update pdfUrl if not already set
    if (!invoice.pdfUrl) {
      try {
        const filename = `invoice-${invoice.id}.pdf`;
        await this.pdfService.savePdf(pdfBuffer, filename);
        const pdfUrl = this.pdfService.getPublicUrl(filename);
        await db.invoice.update({
          where: { id: invoice.id },
          data: { pdfUrl },
        });
      } catch (error) {
        this.logger.error(`Failed to save PDF for invoice ${id}`, error);
      }
    }

    return pdfBuffer;
  }

  async sendEmail(db: PrismaClient, tenantId: string, id: string, recipientEmail?: string) {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const email = recipientEmail || invoice.customer?.email;
    if (!email) {
      throw new BadRequestException('No email address provided and customer has no email');
    }

    const tenantInfo = await this.getTenantInfo(tenantId);

    let pdfAttachments: { filename: string; content: string; contentType: string }[] | undefined;
    try {
      const pdfBuffer = await this.generateOrGetPdf(db, tenantId, id);
      pdfAttachments = [{
        filename: `${invoice.invoiceNumber || 'invoice'}.pdf`,
        content: pdfBuffer.toString('base64'),
        contentType: 'application/pdf',
      }];
    } catch (error) {
      this.logger.error(`Failed to generate PDF attachment for invoice ${id}`, error);
    }

    await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
      tenantId,
      to: email,
      subject: `Invoice ${invoice.invoiceNumber} from ${tenantInfo.name}`,
      template: 'invoice',
      context: {
        tenantName: tenantInfo.name,
        customerName: invoice.customer?.name || email,
        invoiceId: invoice.invoiceNumber,
        amount: PdfService.formatAmount(invoice.amount, invoice.currency),
        currency: invoice.currency,
        dueDate: invoice.dueDate?.toISOString().split('T')[0] || '',
      },
      attachments: pdfAttachments,
    });

    return { message: `Invoice email queued for ${email}` };
  }

  async createCheckout(db: PrismaClient, id: string, callbackUrl?: string, providerName?: string, tenantId?: string) {
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('Invoice is already paid');
    }

    if (invoice.status === 'CANCELED') {
      throw new BadRequestException('Invoice has been voided');
    }
    if (dec(invoice.amount).lte(0)) {
      throw new BadRequestException('Nothing to pay on this invoice');
    }

    // The requested provider, or every active one in priority order: when one cannot start a
    // checkout (a revoked key, an outage) the next is tried, managed payments last.
    const candidates = await db.paymentProvider.findMany({
      where: { isActive: true, providerName: providerName ? providerName : { in: CHECKOUT_PROVIDER_NAMES } },
      orderBy: { priority: 'asc' },
    });

    if (!candidates.length) {
      throw new BadRequestException(
        providerName
          ? `Payment provider "${providerName}" is not configured or not active`
          : 'No active payment provider configured',
      );
    }

    let lastError = 'Failed to create checkout session';
    for (const providerConfig of candidates) {
      const credentials = JSON.parse(this.encryptionService.decrypt(providerConfig.credentials));
      if (providerConfig.providerName === 'managed' && tenantId) credentials.tenantId = tenantId;
      const provider = ProviderFactory.create(providerConfig.providerName, credentials);

      // Create a pending payment record
      const payment = await db.payment.create({
        data: {
          invoiceId: id,
          provider: providerConfig.providerName,
          amount: invoice.amount,
          currency: invoice.currency,
          status: 'PROCESSING',
        },
      });

      // Initiate the charge to get a payment URL. Starting a checkout moves no money, so a
      // failure here is safe to follow with the next provider.
      const result = await provider
        .charge({
          amount: Number(invoice.amount),
          currency: invoice.currency,
          email: invoice.customer.email,
          customerName: invoice.customer.name ?? undefined,
          // Each attempt has its own reference (providers refuse a reused one); webhooks match it to this payment.
          reference: payment.id,
          callbackUrl,
          paymentOptions: 'card',
          metadata: { invoiceId: id, paymentId: payment.id, description: `Invoice ${invoice.invoiceNumber}` },
        })
        .catch((error: Error) => ({ success: false, error: error.message, transactionId: undefined, paymentUrl: undefined }));

      if (!result.success || !result.paymentUrl) {
        lastError = result.error || lastError;
        this.logger.warn(`Checkout through ${providerConfig.providerName} failed for invoice ${id}: ${lastError}`);
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', failureReason: lastError },
        });
        continue;
      }

      // Update payment with transaction ID
      await db.payment.update({
        where: { id: payment.id },
        data: { providerTransactionId: result.transactionId },
      });

      return {
        checkoutUrl: result.paymentUrl,
        paymentId: payment.id,
        provider: providerConfig.providerName,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      };
    }
    throw new BadRequestException(lastError);
  }
}
