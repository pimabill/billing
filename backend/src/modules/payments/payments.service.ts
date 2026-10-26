import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { ProviderFactory } from '../../providers/provider.factory';
import { PdfService } from '../../services/pdf.service';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { applyPayment, isUnapplied, unapplyRefund } from '../invoices/apply-payment';
import {
  EMAIL_QUEUE,
  WEBHOOK_QUEUE,
  EmailJobType,
  WebhookJobType,
} from '../../queues/billing.queue';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly centralPrisma: CentralPrismaService,
    private readonly encryptionService: EncryptionService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  private async getTenantName(tenantId: string): Promise<string> {
    const tenant = await this.centralPrisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return tenant?.name || 'Your billing provider';
  }

  async findAll(db: PrismaClient, query: PaymentQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.provider) where.provider = query.provider;
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
        ...(query.dateTo && { lte: new Date(query.dateTo) }),
      };
    }

    const [data, total] = await Promise.all([
      db.payment.findMany({
        where,
        skip,
        take: limit,
        include: {
          invoice: { include: { customer: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.payment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(db: PrismaClient, id: string) {
    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        invoice: { include: { customer: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async create(db: PrismaClient, tenantId: string, dto: CreatePaymentDto) {
    const invoice = await db.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const paidAt = dto.createdAt ? new Date(dto.createdAt) : new Date();
    // Payment and invoice change together or not at all. A succeeded payment
    // counts toward the invoice; it is paid once the payments cover it.
    const payment = await db.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          invoiceId: dto.invoiceId,
          provider: dto.provider,
          amount: dto.amount,
          currency: dto.currency.toUpperCase(),
          status: dto.status,
          providerTransactionId: dto.providerTransactionId,
          failureReason: dto.failureReason,
          ...(dto.createdAt && { createdAt: paidAt }),
        },
        include: { invoice: { include: { customer: true } } },
      });
      if (dto.status === 'SUCCEEDED') {
        await applyPayment(tx, dto.invoiceId, dto.amount, paidAt, created.id);
      }
      return created;
    });

    // Webhook
    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'payment.created',
      payload: {
        paymentId: payment.id,
        invoiceId: dto.invoiceId,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        status: dto.status,
        provider: dto.provider,
      },
    });

    return payment;
  }

  async refund(db: PrismaClient, tenantId: string, id: string, dto: RefundPaymentDto) {
    const payment = await db.payment.findUnique({
      where: { id },
      include: { invoice: { include: { customer: true } } },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== 'SUCCEEDED') {
      throw new BadRequestException('Only succeeded payments can be refunded');
    }

    const refundAmount = dto.amount ?? Number(payment.amount);

    if (refundAmount > Number(payment.amount)) {
      throw new BadRequestException('Refund amount exceeds payment amount');
    }

    const providerRefund = await this.refundAtProvider(db, payment, refundAmount, dto.recordOnly);

    // The payment is refunded once, and what it paid comes off its invoice in the same step.
    const updatedPayment = await db.$transaction(async (tx) => {
      const moved = await tx.payment.updateMany({
        where: { id, status: 'SUCCEEDED' },
        data: {
          status: 'REFUNDED',
          metadata: {
            ...(payment.metadata as Record<string, unknown> || {}),
            refundAmount,
            refundReason: dto.reason,
            refundedAt: new Date().toISOString(),
            refundMode: providerRefund ? 'provider' : 'recorded',
            ...(providerRefund?.refundId && { providerRefundId: providerRefund.refundId }),
          },
        },
      });
      if (moved.count === 0) throw new BadRequestException('This payment was refunded meanwhile');
      if (!isUnapplied(payment)) await unapplyRefund(tx, payment.invoiceId, refundAmount);
      return tx.payment.findUniqueOrThrow({ where: { id }, include: { invoice: { include: { customer: true } } } });
    });

    // Email customer about refund
    const customer = (payment.invoice as any)?.customer;
    if (customer?.email) {
      const tenantName = await this.getTenantName(tenantId);
      await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
        tenantId,
        to: customer.email,
        subject: `Refund processed — ${tenantName}`,
        template: 'payment-refunded',
        context: {
          tenantName,
          customerName: customer.name || customer.email,
          amount: PdfService.formatAmount(refundAmount, payment.currency),
          currency: payment.currency,
        },
      });
    }

    // Webhook: payment.refunded
    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'payment.refunded',
      payload: {
        paymentId: id,
        invoiceId: payment.invoiceId,
        refundAmount,
        currency: payment.currency,
      },
    });

    return updatedPayment;
  }

  /**
   * Send the refund to the payment provider that took the payment. Returns
   * null when the refund is only being recorded (manual payments, or an
   * explicit recordOnly request); throws when the provider refuses, so the
   * payment is never marked refunded for money that was not returned.
   */
  private async refundAtProvider(
    db: PrismaClient,
    payment: { provider: string; providerTransactionId: string | null; currency: string },
    amount: number,
    recordOnly?: boolean,
  ): Promise<{ refundId?: string } | null> {
    if (recordOnly || payment.provider === 'manual') return null;

    const config = await db.paymentProvider.findFirst({
      where: { providerName: payment.provider, isActive: true },
    });
    if (!config) {
      throw new BadRequestException(
        `The ${payment.provider} provider is not configured or is inactive, so the refund cannot be sent. ` +
          'If you already refunded this payment elsewhere, retry with recordOnly: true.',
      );
    }
    if (!payment.providerTransactionId) {
      throw new BadRequestException(
        'This payment has no provider transaction id to refund against. ' +
          'If you already refunded it elsewhere, retry with recordOnly: true.',
      );
    }

    const provider = ProviderFactory.create(
      config.providerName,
      JSON.parse(this.encryptionService.decrypt(config.credentials)),
    );
    const result = await provider.refund({
      transactionId: payment.providerTransactionId,
      amount,
      currency: payment.currency,
    });
    if (!result.success) {
      throw new BadRequestException(`${payment.provider} refused the refund: ${result.error ?? 'unknown error'}`);
    }
    return { refundId: result.refundId };
  }
}
