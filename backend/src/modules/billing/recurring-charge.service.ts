import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { PdfService } from '../../services/pdf.service';
import { ProviderFactory } from '../../providers/provider.factory';
import { EMAIL_QUEUE, WEBHOOK_QUEUE, EmailJobType, WebhookJobType } from '../../queues/billing.queue';
import { amountDue, applyPayment } from '../invoices/apply-payment';
import { dec } from './pricing';

export type ChargeOutcome =
  | { result: 'succeeded'; paymentId: string }
  | { result: 'failed'; paymentId: string; error: string }
  /** The provider's answer is unknown: wait for its webhook, do not charge again. */
  | { result: 'pending'; paymentId: string }
  /** Nothing was charged: the invoice is not payable, or the card cannot be used. */
  | { result: 'skipped'; reason: string; invoiceStatus?: string };

/**
 * Charges an invoice to a saved payment method, for automatic renewals and
 * dunning retries. Each attempt is its own payment with its own provider
 * reference; an invoice is charged only while unpaid and only when no earlier
 * attempt is still unresolved, so retries and duplicate jobs cannot charge
 * a customer twice.
 */
@Injectable()
export class RecurringChargeService {
  private readonly logger = new Logger(RecurringChargeService.name);

  constructor(
    private readonly centralPrisma: CentralPrismaService,
    private readonly encryption: EncryptionService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  async chargeInvoice(
    db: PrismaClient,
    tenantId: string,
    invoiceId: string,
    paymentMethodId: string | null | undefined,
    source: 'auto' | 'dunning',
  ): Promise<ChargeOutcome> {
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
    if (!invoice) return { result: 'skipped', reason: 'Invoice not found' };
    if (invoice.status !== 'PENDING' && invoice.status !== 'FAILED') {
      return { result: 'skipped', reason: `Invoice is ${invoice.status.toLowerCase()}`, invoiceStatus: invoice.status };
    }
    if (dec(invoice.amount).lte(0)) return { result: 'skipped', reason: 'Nothing to pay', invoiceStatus: invoice.status };

    const unresolved = await db.payment.findFirst({ where: { invoiceId, status: 'PROCESSING' }, select: { id: true } });
    if (unresolved) return { result: 'skipped', reason: `Payment ${unresolved.id} is still being processed` };

    if (!paymentMethodId) return { result: 'skipped', reason: 'No saved payment method' };
    const paymentMethod = await db.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!paymentMethod || paymentMethod.customerId !== invoice.customerId) {
      this.logger.warn(`Payment method ${paymentMethodId} does not belong to invoice ${invoiceId}'s customer; not charging`);
      return { result: 'skipped', reason: 'Payment method not found for this customer' };
    }

    const providerConfig = await db.paymentProvider.findFirst({ where: { providerName: paymentMethod.provider, isActive: true } });
    if (!providerConfig) return { result: 'skipped', reason: `Provider ${paymentMethod.provider} is not active` };
    const provider = ProviderFactory.create(providerConfig.providerName, JSON.parse(this.encryption.decrypt(providerConfig.credentials)));
    if (!provider.chargePaymentMethod) {
      return { result: 'skipped', reason: `Provider ${providerConfig.providerName} does not support recurring charges` };
    }

    const payment = await db.payment.create({
      data: {
        invoiceId,
        provider: providerConfig.providerName,
        amount: amountDue(invoice),
        currency: invoice.currency,
        status: 'PROCESSING',
        metadata: { source, paymentMethodId },
      },
    });

    const result = await provider.chargePaymentMethod({
      paymentMethodId: paymentMethod.tokenId,
      amount: Number(amountDue(invoice)),
      currency: invoice.currency,
      // A new reference per attempt: providers refuse a reused one.
      reference: payment.id,
      customerId: paymentMethod.customerId,
      metadata: {
        invoiceId,
        paymentId: payment.id,
        email: invoice.customer?.email || '',
        firstName: invoice.customer?.name?.split(' ')[0] || '',
        lastName: invoice.customer?.name?.split(' ').slice(1).join(' ') || '',
      },
    });

    const tenantName = await this.tenantName(tenantId);
    const base = {
      paymentId: payment.id,
      invoiceId,
      subscriptionId: invoice.subscriptionId,
      amount: Number(amountDue(invoice)),
      currency: invoice.currency,
      provider: providerConfig.providerName,
      automatic: true,
      source,
    };

    if (result.success) {
      const { paid } = await db.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { id: payment.id, status: 'PROCESSING' },
          data: { status: 'SUCCEEDED', providerTransactionId: result.transactionId },
        });
        const applied = await applyPayment(tx, invoiceId, amountDue(invoice), new Date(), payment.id);
        return { paid: applied.paid };
      });
      if (!paid) {
        // Paid by other means while this charge ran: flag the extra payment for refund.
        await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, { tenantId, event: 'payment.duplicate', payload: base });
        return { result: 'succeeded', paymentId: payment.id };
      }
      if (invoice.subscriptionId) {
        await db.subscription.updateMany({ where: { id: invoice.subscriptionId, status: 'PAST_DUE' }, data: { status: 'ACTIVE' } });
      }
      await db.paymentRetry.updateMany({ where: { invoiceId, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'SUCCESS' } });
      if (invoice.customer?.email) {
        await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
          tenantId,
          to: invoice.customer.email,
          subject: `Payment received for ${invoice.invoiceNumber || invoiceId} — ${tenantName}`,
          template: 'payment-confirmation',
          context: {
            tenantName,
            customerName: invoice.customer.name || invoice.customer.email,
            invoiceId: invoice.invoiceNumber,
            amount: PdfService.formatAmount(invoice.amount, invoice.currency),
            currency: invoice.currency,
          },
        });
      }
      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, { tenantId, event: 'payment.succeeded', payload: base });
      this.logger.log(`${source === 'auto' ? 'Auto-charge' : 'Retry'} succeeded for invoice ${invoiceId}`);
      return { result: 'succeeded', paymentId: payment.id };
    }

    if (result.ambiguous) {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          failureReason: `Outcome unknown: ${result.error ?? 'no answer from provider'}; waiting for the provider to confirm`,
          ...(result.transactionId && { providerTransactionId: result.transactionId }),
        },
      });
      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, { tenantId, event: 'payment.pending', payload: base });
      this.logger.warn(`Charge outcome unknown for invoice ${invoiceId} (payment ${payment.id}): ${result.error}`);
      return { result: 'pending', paymentId: payment.id };
    }

    const error = result.error || 'Payment could not be processed';
    await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: error } });
    if (invoice.customer?.email) {
      await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
        tenantId,
        to: invoice.customer.email,
        subject: `Payment failed — ${tenantName}`,
        template: 'payment-failed',
        context: {
          tenantName,
          customerName: invoice.customer.name || invoice.customer.email,
          amount: PdfService.formatAmount(invoice.amount, invoice.currency),
          currency: invoice.currency,
          reason: error,
        },
      });
    }
    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, { tenantId, event: 'payment.failed', payload: { ...base, error } });
    this.logger.warn(`${source === 'auto' ? 'Auto-charge' : 'Retry'} failed for invoice ${invoiceId}: ${error}`);
    return { result: 'failed', paymentId: payment.id, error };
  }

  private async tenantName(tenantId: string): Promise<string> {
    const tenant = await this.centralPrisma.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return tenant?.name || 'Your billing provider';
  }
}
