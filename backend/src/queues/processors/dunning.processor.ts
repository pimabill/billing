import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Job } from 'bullmq';
import { TenantDatabaseService } from '../../database/tenant-database.service';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { EMAIL_QUEUE, WEBHOOK_QUEUE, EmailJobType, WebhookJobType } from '../billing.queue';
import { PdfService } from '../../services/pdf.service';
import { RecurringChargeService } from '../../modules/billing/recurring-charge.service';
import { CurrenciesService } from '../../modules/currencies/currencies.service';
import { CronLockService } from '../../common/scheduling/cron-lock.service';

/** Days to wait after each failed attempt. */
const RETRY_DELAYS_DAYS = [1, 3, 7];

/**
 * Retries failed automatic charges. Each due retry is claimed with a
 * compare-and-set before charging, so overlapping runs cannot charge twice;
 * the charge itself goes through RecurringChargeService, which only charges
 * an unpaid invoice with no unresolved attempt.
 */
@Processor('dunning')
export class DunningProcessor extends WorkerHost {
  private readonly logger = new Logger(DunningProcessor.name);

  constructor(
    private readonly tenantDb: TenantDatabaseService,
    private readonly centralPrisma: CentralPrismaService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    private readonly recurring: RecurringChargeService,
    @Optional() private readonly cronLock?: CronLockService,
    @Optional() private readonly currencies?: CurrenciesService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { tenantId, retryId } = job.data;
    const prisma = await this.tenantDb.getTenantClient(tenantId);
    const retry = await prisma.paymentRetry.findUnique({ where: { id: retryId } });
    if (!retry) return;
    const run = () => this.processRetry(prisma, tenantId, retry);
    await (this.currencies ? this.currencies.runFor(prisma, tenantId, run) : run());
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkDueRetries() {
    const run = async () => {
      const tenants = await this.centralPrisma.client.tenant.findMany({ where: { isActive: true }, select: { id: true } });
      for (const tenant of tenants) await this.processTenantRetries(tenant.id);
    };
    if (this.cronLock) await this.cronLock.runExclusive('dunning', 55 * 60_000, run);
    else await run();
  }

  private async processTenantRetries(tenantId: string) {
    try {
      const prisma = await this.tenantDb.getTenantClient(tenantId);
      const due = await prisma.paymentRetry.findMany({ where: { status: 'PENDING', nextRetryAt: { lte: new Date() } } });
      for (const retry of due) {
        try {
          await this.processRetry(prisma, tenantId, retry);
        } catch (error) {
          this.logger.error(`Error processing retry ${retry.id}`, error);
          await prisma.paymentRetry
            .updateMany({ where: { id: retry.id, status: 'PROCESSING' }, data: { status: 'PENDING', lastError: error instanceof Error ? error.message : 'Unknown error' } })
            .catch(() => undefined);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing tenant retries for ${tenantId}`, error);
    }
  }

  private async processRetry(
    prisma: PrismaClient,
    tenantId: string,
    retry: { id: string; invoiceId: string; subscriptionId: string | null; attemptNumber: number; maxAttempts: number; nextRetryAt: Date; status: string },
  ) {
    if (retry.status !== 'PENDING') return;
    // Claim it: only one run may attempt this retry.
    const claimed = await prisma.paymentRetry.updateMany({
      where: { id: retry.id, status: 'PENDING', nextRetryAt: retry.nextRetryAt },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) return;

    const invoice = await prisma.invoice.findUnique({
      where: { id: retry.invoiceId },
      include: { customer: true, subscription: true },
    });
    this.logger.log(`Processing retry ${retry.attemptNumber}/${retry.maxAttempts} for invoice ${retry.invoiceId}`);

    const outcome = await this.recurring.chargeInvoice(prisma, tenantId, retry.invoiceId, invoice?.subscription?.paymentMethodId, 'dunning');

    if (outcome.result === 'skipped') {
      // Paid or voided meanwhile: the retry is done. Otherwise (no usable card, attempt in flight) try again later.
      const settled = outcome.invoiceStatus === 'PAID' || outcome.invoiceStatus === 'CANCELED' || !invoice;
      await prisma.paymentRetry.update({
        where: { id: retry.id },
        data: settled
          ? { status: outcome.invoiceStatus === 'PAID' ? 'SUCCESS' : 'CANCELED', lastError: outcome.reason }
          : { status: 'PENDING', nextRetryAt: new Date(Date.now() + 24 * 3600_000), lastError: outcome.reason },
      });
      this.logger.log(`Retry ${retry.id} for invoice ${retry.invoiceId} skipped: ${outcome.reason}`);
      return;
    }

    if (outcome.result === 'pending') {
      // The provider has not answered: check back later, the webhook will usually settle it first.
      await prisma.paymentRetry.update({
        where: { id: retry.id },
        data: { status: 'PENDING', nextRetryAt: new Date(Date.now() + 24 * 3600_000), lastError: 'Awaiting provider confirmation' },
      });
      return;
    }

    if (outcome.result === 'succeeded') {
      await prisma.paymentRetry.update({ where: { id: retry.id }, data: { status: 'SUCCESS' } });
      if (invoice?.customer?.email) {
        await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
          to: invoice.customer.email,
          subject: 'Payment Successful',
          template: 'payment-retry-success',
          context: {
            customerName: invoice.customer.name,
            amount: PdfService.formatAmount(invoice.amount, invoice.currency),
            currency: invoice.currency,
            invoiceNumber: invoice.invoiceNumber,
          },
          tenantId,
        });
      }
      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
        tenantId,
        event: 'payment.retry.succeeded',
        payload: { invoiceId: retry.invoiceId, amount: Number(invoice?.amount ?? 0), attemptNumber: retry.attemptNumber },
      });
      return;
    }

    // Failed: schedule the next attempt, or give up and cancel the subscription.
    if (retry.attemptNumber >= retry.maxAttempts) {
      await prisma.paymentRetry.update({ where: { id: retry.id }, data: { status: 'EXHAUSTED', lastError: outcome.error } });
      if (retry.subscriptionId) {
        await prisma.subscription.updateMany({
          where: { id: retry.subscriptionId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });
      }
      if (invoice?.customer?.email) {
        await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
          to: invoice.customer.email,
          subject: 'Subscription Canceled - Payment Failed',
          template: 'payment-retry-exhausted',
          context: {
            customerName: invoice.customer.name,
            amount: PdfService.formatAmount(invoice.amount, invoice.currency),
            currency: invoice.currency,
            invoiceNumber: invoice.invoiceNumber,
          },
          tenantId,
        });
      }
      this.logger.warn(`Payment retry exhausted for invoice ${retry.invoiceId}`);
      return;
    }

    const nextRetryAt = new Date(Date.now() + (RETRY_DELAYS_DAYS[retry.attemptNumber] ?? 7) * 24 * 3600_000);
    await prisma.paymentRetry.update({
      where: { id: retry.id },
      data: { status: 'PENDING', attemptNumber: retry.attemptNumber + 1, nextRetryAt, lastError: outcome.error },
    });
    if (invoice?.customer?.email) {
      await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
        to: invoice.customer.email,
        subject: 'Payment Failed - Retry Scheduled',
        template: 'payment-retry-failed',
        context: {
          customerName: invoice.customer.name,
          amount: PdfService.formatAmount(invoice.amount, invoice.currency),
          currency: invoice.currency,
          invoiceNumber: invoice.invoiceNumber,
          attemptNumber: retry.attemptNumber,
          nextRetryDate: nextRetryAt.toISOString().split('T')[0],
        },
        tenantId,
      });
    }
    this.logger.log(`Payment retry failed. Next attempt ${retry.attemptNumber + 1} scheduled for ${nextRetryAt.toISOString()}`);
  }
}
