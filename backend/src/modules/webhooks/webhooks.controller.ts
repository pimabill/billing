import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Req,
  RawBodyRequest,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiExcludeEndpoint } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PdfService } from '../../services/pdf.service';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { TenantDatabaseService } from '../../database/tenant-database.service';
import { EncryptionService } from '../../services/encryption.service';
import { ProviderFactory } from '../../providers/provider.factory';
import { WebhookData } from '../../providers/base-payment.provider';
import { MoneyService } from '../money/money.service';
import { ManagedAccountStatus, managedConfig, ManagedPaymentsClient } from '../money/adapters/managed.adapter';
import { ManagedAccountsService } from '../money/managed.service';
import { Prisma, PrismaClient } from '../../generated/prisma-tenant/client';
import { toScaled } from '../ledger/ledger.money';
import {
  WEBHOOK_QUEUE,
  EMAIL_QUEUE,
  WebhookJobType,
  EmailJobType,
} from '../../queues/billing.queue';

const SUPPORTED_WEBHOOK_PROVIDERS = new Set(['stripe', 'paystack', 'flutterwave', 'dpo', 'payu', 'pesapal', 'paypal']);

/** Invoices a payment may still settle. */
const PAYABLE_INVOICE: Prisma.EnumInvoiceStatusFilter['in'] = ['PENDING', 'FAILED', 'DRAFT'];
/** Payments a notification may still settle. */
const OPEN_PAYMENT: Prisma.EnumPaymentStatusFilter['in'] = ['PENDING', 'PROCESSING', 'FAILED'];

/** How long the list of tenants using a provider is reused for the shared webhook URLs. */
const SHARED_ROUTE_CACHE_MS = 5 * 60 * 1000;

type Decision = 'process' | 'duplicate' | 'out_of_order' | 'held';

/** Thrown once a notification is known to belong to a tenant, so the provider retries it. */
class WebhookProcessingError extends Error {}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private readonly tenantsByProvider = new Map<string, { at: number; tenants: { id: string; name: string }[] }>();

  constructor(
    private readonly centralPrisma: CentralPrismaService,
    private readonly tenantDbService: TenantDatabaseService,
    private readonly encryptionService: EncryptionService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
    private readonly money: MoneyService,
    private readonly managed: ManagedAccountsService,
    private readonly pdfService?: PdfService,
  ) {}

  /**
   * Managed payments notifications, signed with this deployment's webhook
   * secret. An account notice switches the tenant's managed connection on or
   * off. A payment notice is never trusted for its content: the payment is
   * looked up with the service, then settled like any provider's. It may be a
   * one-time collection, or an invoice checkout (the reference is our payment id).
   */
  @Public()
  @ApiExcludeEndpoint()
  @Post('managed/:tenantId/callback')
  @HttpCode(200)
  async managedPayments(
    @Param('tenantId') tenantId: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: { event?: string; id?: string; collection?: { reference?: string }; account?: { id?: string; status?: ManagedAccountStatus } },
    @Headers('x-managed-signature') signature?: string,
  ) {
    const config = managedConfig();
    if (!config) throw new NotFoundException();
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
    if (!new ManagedPaymentsClient(config).verifySignature(raw, signature)) throw new UnauthorizedException('Invalid managed payments signature');
    const db = await this.tenantDbService.getTenantClient(tenantId).catch(() => null);
    if (!db) return { status: 'ignored' };

    if (body.account?.id && body.account.status) {
      if ((await this.managed.accountId(db)) !== body.account.id) return { status: 'ignored' };
      await this.managed.sync(db, { id: body.account.id, status: body.account.status });
      return { status: 'ok' };
    }
    const reference = body.collection?.reference;
    if (!reference) return { status: 'ignored' };

    const intent = await this.money.findByProviderRef(db, 'managed', { reference });
    if (intent) {
      await this.recordManagedEvent(db, body, reference, intent.id);
      await this.money.refresh(db, tenantId, intent.id).catch((error) =>
        this.logger.warn(`Managed collection check failed for ${intent.id}: ${error instanceof Error ? error.message : error}`),
      );
      return { status: 'ok' };
    }

    if (await this.settleManagedPayment(db, tenantId, reference)) return { status: 'ok' };
    await this.recordManagedEvent(db, body, reference);
    return { status: 'ignored' };
  }

  /** Ask managed payments how an invoice checkout ended, and settle the payment if it has. */
  async settleManagedPayment(db: PrismaClient, tenantId: string, paymentId: string): Promise<boolean> {
    const payment = await db.payment.findFirst({ where: { id: paymentId, provider: 'managed' } });
    if (!payment) return false;
    const row = await db.paymentProvider.findUnique({ where: { providerName: 'managed' } });
    if (!row) return false;
    const provider = ProviderFactory.create('managed', JSON.parse(this.encryptionService.decrypt(row.credentials)));
    const status = await provider.getPaymentStatus(paymentId);
    if (status.status === 'pending') return true;
    const tenant = await this.centralPrisma.client.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!tenant) return false;
    return this.settle(db, tenant, 'managed', 'tenant', { reference: paymentId, status: status.status } as Record<string, unknown>, {
      status: status.status,
      transactionId: paymentId,
      amount: status.amount,
      currency: status.currency,
      invoiceId: paymentId,
      referenceVerified: true,
    });
  }

  private async recordManagedEvent(db: PrismaClient, body: { event?: string; id?: string }, reference: string, intentId?: string) {
    try {
      await db.providerEvent.create({
        data: {
          provider: 'managed',
          eventKey: `event:${body.id ?? `${reference}:${body.event}`}`,
          eventType: body.event ?? 'collection',
          status: intentId ? 'PROCESSED' : 'IGNORED',
          route: 'tenant',
          intentId,
          payload: body as never,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }

  @Public()
  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paystack webhook endpoint',
    description:
      'Receives payment event notifications from Paystack. ' +
      "The signature is verified using HMAC-SHA512 of the raw body with the provider's secret key.",
  })
  @ApiHeader({ name: 'x-paystack-signature', description: 'Paystack HMAC-SHA512 signature', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async paystack(@Req() req: RawBodyRequest<Request>, @Body() payload: Record<string, unknown>) {
    return this.shared('paystack', req, payload, { status: 'success' });
  }

  @Public()
  @Post('flutterwave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Flutterwave webhook endpoint',
    description:
      'Receives payment event notifications from Flutterwave. The verif-hash header must match the secret hash ' +
      'saved with your Flutterwave credentials; the outcome is then confirmed with Flutterwave.',
  })
  @ApiHeader({ name: 'verif-hash', description: 'Flutterwave verification hash', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async flutterwave(@Req() req: RawBodyRequest<Request>, @Body() payload: Record<string, unknown>) {
    return this.shared('flutterwave', req, payload, { status: 'success' });
  }

  @Public()
  @Post('dpo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'DPO Group webhook endpoint',
    description: 'Receives payment callbacks from DPO Group. The transaction is verified with DPO before anything changes.',
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async dpo(@Req() req: RawBodyRequest<Request>, @Body() payload: Record<string, unknown>) {
    return this.shared('dpo', req, payload, { status: 'success' });
  }

  @Public()
  @Post('payu')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'PayU webhook endpoint',
    description: 'Receives IPNs from PayU South Africa. The transaction is looked up with PayU before anything changes.',
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async payu(@Req() req: RawBodyRequest<Request>, @Body() payload: Record<string, unknown>) {
    return this.shared('payu', req, payload, { status: 'success' });
  }

  @Public()
  @Post('pesapal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pesapal webhook endpoint',
    description: 'Receives IPN callbacks from Pesapal. The transaction status is fetched from Pesapal before anything changes.',
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async pesapal(@Req() req: RawBodyRequest<Request>, @Body() payload: Record<string, unknown>) {
    return this.shared('pesapal', req, payload, { status: 'success' });
  }

  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stripe webhook endpoint',
    description:
      'Receives event notifications from Stripe (e.g. checkout.session.completed, payment_intent.succeeded). ' +
      'Every notification must carry a valid stripe-signature for the configured webhook secret.',
  })
  @ApiHeader({ name: 'stripe-signature', description: 'Stripe webhook signature', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async stripe(@Req() req: RawBodyRequest<Request>, @Body() payload: Record<string, unknown>) {
    return this.shared('stripe', req, payload, { received: true });
  }

  @Public()
  @Post('paypal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'PayPal webhook endpoint',
    description:
      'Receives PayPal notifications. Each one is verified with PayPal (verify-webhook-signature) using the ' +
      'webhook id saved with your PayPal credentials; approved orders are captured before the payment is marked paid.',
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async paypal(@Req() req: RawBodyRequest<Request>, @Body() payload: Record<string, unknown>) {
    return this.shared('paypal', req, payload, { status: 'success' });
  }

  /**
   * Per-tenant webhook URL: /webhooks/{provider}/{tenantId}. Only that tenant's
   * credentials are tried, instead of every tenant's as on the shared URL.
   * The shared URLs above keep working for existing provider configurations.
   */
  @Public()
  @Post(':provider/:tenantId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Per-tenant provider webhook endpoint',
    description:
      'Same processing as the shared /webhooks/{provider} URL, scoped to one tenant. Point new provider ' +
      'webhook configurations here; the dashboard shows the exact URL for each provider.',
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async tenantScoped(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: Record<string, unknown>,
    @Param('provider') provider: string,
    @Param('tenantId') tenantId: string,
  ) {
    const providerName = provider.toLowerCase();
    if (!SUPPORTED_WEBHOOK_PROVIDERS.has(providerName)) {
      throw new NotFoundException(`Unknown provider "${provider}"`);
    }
    this.logger.log(`${providerName} webhook received for tenant ${tenantId}`);
    await this.processProviderWebhook(
      providerName,
      payload,
      this.signatureFor(providerName, req.headers),
      req.rawBody?.toString('utf8'),
      tenantId,
    );
    return { status: 'success' };
  }

  private async shared<T>(provider: string, req: RawBodyRequest<Request>, payload: Record<string, unknown>, reply: T): Promise<T> {
    this.logger.log(`${provider} webhook received`);
    await this.processProviderWebhook(provider, payload, this.signatureFor(provider, req.headers), req.rawBody?.toString('utf8'));
    return reply;
  }

  /** Pull the signature material each provider sends from the request headers. */
  private signatureFor(provider: string, headers: Request['headers']): string {
    const h = (name: string) => {
      const v = headers[name];
      return (Array.isArray(v) ? v[0] : v) ?? '';
    };
    switch (provider) {
      case 'paystack':
        return h('x-paystack-signature');
      case 'flutterwave':
        return h('verif-hash');
      case 'stripe':
        return h('stripe-signature');
      case 'paypal':
        return JSON.stringify({
          authAlgo: h('paypal-auth-algo'),
          certUrl: h('paypal-cert-url'),
          transmissionId: h('paypal-transmission-id'),
          transmissionSig: h('paypal-transmission-sig'),
          transmissionTime: h('paypal-transmission-time'),
        });
      default:
        return '';
    }
  }

  /**
   * Tenants with this provider configured. The shared URL has to try each of
   * them; the list is cached so an unauthenticated request cannot make us open
   * every tenant database each time.
   */
  private async candidates(providerName: string, onlyTenantId?: string): Promise<{ id: string; name: string }[]> {
    if (onlyTenantId) {
      return this.centralPrisma.client.tenant.findMany({ where: { isActive: true, id: onlyTenantId }, select: { id: true, name: true } });
    }
    const cached = this.tenantsByProvider.get(providerName);
    if (cached && Date.now() - cached.at < SHARED_ROUTE_CACHE_MS) return cached.tenants;

    const tenants = await this.centralPrisma.client.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const using: { id: string; name: string }[] = [];
    for (const tenant of tenants) {
      try {
        const db = await this.tenantDbService.getTenantClient(tenant.id);
        if (await db.paymentProvider.findFirst({ where: { providerName, isActive: true }, select: { id: true } })) using.push(tenant);
      } catch {
        // Unreachable tenant database: skip it until the next refresh.
      }
    }
    this.tenantsByProvider.set(providerName, { at: Date.now(), tenants: using });
    return using;
  }

  /**
   * Core webhook processing:
   * 1. Find the tenant whose credentials verify this notification.
   * 2. Match it to a payment, by the provider's transaction id or a verified reference.
   * 3. Settle the payment and invoice together (compare-and-set), or hold it for
   *    review when the amount or currency does not match.
   * 4. Notify the customer and the tenant.
   *
   * Once a notification is known to be a tenant's, a failure answers 500 so
   * the provider redelivers it instead of the payment being lost.
   */
  private async processProviderWebhook(
    providerName: string,
    payload: Record<string, unknown>,
    signature: string,
    rawBody?: string,
    onlyTenantId?: string,
  ): Promise<void> {
    const route = onlyTenantId ? 'tenant' : 'shared';
    if (await this.tryTenants(await this.candidates(providerName, onlyTenantId), providerName, route, payload, signature, rawBody)) return;

    // A tenant may have configured this provider since the list was cached: refresh once and retry.
    const cached = this.tenantsByProvider.get(providerName);
    if (!onlyTenantId && cached && Date.now() - cached.at > 30_000) {
      this.tenantsByProvider.delete(providerName);
      if (await this.tryTenants(await this.candidates(providerName), providerName, route, payload, signature, rawBody)) return;
    }

    this.logger.warn(`No matching tenant/payment found for ${providerName} webhook`);
  }

  /** True once a tenant's credentials verified the notification and it was handled. */
  private async tryTenants(
    tenants: { id: string; name: string }[],
    providerName: string,
    route: string,
    payload: Record<string, unknown>,
    signature: string,
    rawBody?: string,
  ): Promise<boolean> {
    for (const tenant of tenants) {
      let db: PrismaClient;
      let webhookData: WebhookData;
      try {
        db = await this.tenantDbService.getTenantClient(tenant.id);
        const providerConfig = await db.paymentProvider.findFirst({ where: { providerName, isActive: true } });
        if (!providerConfig) continue;

        const credentials = JSON.parse(this.encryptionService.decrypt(providerConfig.credentials));
        const provider = ProviderFactory.create(providerName, credentials);
        webhookData = await provider.handleWebhook(payload, signature, rawBody);
      } catch (error) {
        // Not this tenant's notification (or it failed verification): try the next one.
        this.logger.warn(
          `Webhook verification failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
        continue;
      }

      try {
        await this.centralPrisma.client.webhookLog.create({
          data: {
            tenantId: tenant.id,
            event: `inbound.${providerName}.${String(payload.event || payload.type || payload.event_type || 'webhook')}`,
            url: `inbound:${providerName}`,
            payload: payload as any,
            success: true,
            statusCode: 200,
            attemptCount: 1,
          },
        });
        // A tenant sharing the provider account with others may not own this payment: keep looking.
        if (await this.settle(db, tenant, providerName, route, payload, webhookData)) return true;
        continue;
      } catch (error) {
        this.logger.error(
          `Error processing ${providerName} webhook for tenant ${tenant.id}`,
          error instanceof Error ? error.stack : error,
        );
        throw new WebhookProcessingError(`Could not process ${providerName} webhook`);
      }
    }
    return false;
  }

  private async settle(
    db: PrismaClient,
    tenant: { id: string; name: string },
    providerName: string,
    route: string,
    payload: Record<string, unknown>,
    webhookData: WebhookData,
  ): Promise<boolean> {
    const payment = await this.findPayment(db, providerName, webhookData);

    if (!payment) {
      // Not an invoice payment: it may be a one-time collection started
      // through this provider's hosted checkout. If not, it is not this
      // tenant's: another tenant may share the same provider account.
      return this.money.handleCheckoutNotification(db, tenant.id, providerName, route, payload, webhookData);
    }

    const decision = await this.recordEvent(db, providerName, route, payload, webhookData, payment);
    if (decision === 'duplicate' || decision === 'out_of_order') {
      this.logger.log(`Skipped ${providerName} webhook for tenant ${tenant.id}: payment ${payment.id} (${decision})`);
      return true;
    }

    if (decision === 'held') {
      const mismatch = this.describeMismatch(webhookData, payment) ?? 'amount not reported';
      await db.payment.updateMany({
        where: { id: payment.id, status: { in: OPEN_PAYMENT } },
        data: {
          status: 'PROCESSING',
          failureReason: `Held for review: provider reported ${mismatch}`,
          ...(webhookData.transactionId && { providerTransactionId: webhookData.transactionId }),
        },
      });
      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
        tenantId: tenant.id,
        event: 'payment.held_for_review',
        payload: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          expectedAmount: Number(payment.amount),
          expectedCurrency: payment.currency,
          reportedAmount: webhookData.amount,
          reportedCurrency: webhookData.currency,
          provider: providerName,
          transactionId: webhookData.transactionId,
        },
      });
      this.logger.warn(`Held ${providerName} payment ${payment.id} for review: ${mismatch}`);
      return true;
    }

    // 'pending': the provider acknowledged the payment but has not confirmed it.
    if (webhookData.status === 'pending') {
      if (webhookData.transactionId) {
        await db.payment.updateMany({
          where: { id: payment.id, status: { in: OPEN_PAYMENT } },
          data: { status: 'PROCESSING', providerTransactionId: webhookData.transactionId },
        });
      }
      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
        tenantId: tenant.id,
        event: 'payment.pending',
        payload: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          amount: Number(payment.amount),
          currency: payment.currency,
          provider: providerName,
          transactionId: webhookData.transactionId,
        },
      });
      return true;
    }

    const succeeded = webhookData.status === 'succeeded';
    const newStatus = succeeded ? 'SUCCEEDED' : 'FAILED';

    // Payment and invoice change together, and only from an open state, so a
    // concurrent redelivery cannot apply the outcome twice.
    const { won, invoicePaid } = await db.$transaction(async (tx) => {
      const moved = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: OPEN_PAYMENT } },
        data: {
          status: newStatus,
          ...(webhookData.transactionId && { providerTransactionId: webhookData.transactionId }),
          failureReason: succeeded ? null : 'Payment failed via webhook',
        },
      });
      if (moved.count === 0) return { won: false, invoicePaid: false };
      if (!succeeded) return { won: true, invoicePaid: false };
      const paid = await tx.invoice.updateMany({
        where: { id: payment.invoiceId, status: { in: PAYABLE_INVOICE } },
        data: { status: 'PAID', paidAt: new Date() },
      });
      return { won: true, invoicePaid: paid.count > 0 };
    });

    if (!won) {
      this.logger.log(`Payment ${payment.id} was already settled; ${providerName} webhook not applied again`);
      return true;
    }

    const invoice = payment.invoice;
    const customer = invoice?.customer;
    const tenantName = tenant.name || 'Your billing provider';
    const invoiceNumber = invoice?.invoiceNumber || payment.invoiceId;
    const formattedAmount = PdfService.formatAmount(payment.amount, payment.currency);

    if (succeeded && !invoicePaid) {
      // Money arrived for an invoice that is already paid or voided: the tenant must refund or apply it.
      this.logger.warn(`Payment ${payment.id} succeeded but invoice ${payment.invoiceId} is ${invoice?.status}; flagged for refund`);
      await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
        tenantId: tenant.id,
        event: 'payment.duplicate',
        payload: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          invoiceStatus: invoice?.status,
          amount: Number(payment.amount),
          currency: payment.currency,
          provider: providerName,
          transactionId: webhookData.transactionId,
        },
      });
      return true;
    }

    if (succeeded && invoice) {
      // Save the card for recurring billing, if the provider returned a reusable token.
      if (webhookData.paymentMethodToken && customer) {
        const token = webhookData.paymentMethodToken;
        const existing = await db.paymentMethod.findFirst({ where: { provider: providerName, tokenId: token.token } });
        if (!existing) {
          const existingCount = await db.paymentMethod.count({ where: { customerId: customer.id } });
          await db.paymentMethod.create({
            data: {
              customerId: customer.id,
              provider: providerName,
              type: 'CARD',
              tokenId: token.token,
              isDefault: existingCount === 0,
              last4: token.last4,
              brand: token.brand,
              expMonth: token.expMonth,
              expYear: token.expYear,
            },
          });
          this.logger.log(`Auto-saved payment method for customer ${customer.id} (${providerName})`);
        }
      }

      if (customer?.email) {
        const pdf = await this.pdfService?.readInvoicePdf(invoice.id);
        await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
          tenantId: tenant.id,
          to: customer.email,
          subject: `Payment received for ${invoiceNumber} — ${tenantName}`,
          template: 'payment-confirmation',
          context: {
            tenantName,
            customerName: customer.name || customer.email,
            invoiceId: invoiceNumber,
            amount: formattedAmount,
            currency: payment.currency,
          },
          attachments: pdf
            ? [{ filename: `${invoiceNumber}.pdf`, content: pdf.toString('base64'), contentType: 'application/pdf' }]
            : undefined,
        });
      }
    }

    if (!succeeded && customer?.email) {
      await this.emailQueue.add(EmailJobType.SEND_EMAIL, {
        tenantId: tenant.id,
        to: customer.email,
        subject: `Payment failed for ${invoiceNumber} — ${tenantName}`,
        template: 'payment-failed',
        context: {
          tenantName,
          customerName: customer.name || customer.email,
          invoiceId: invoiceNumber,
          amount: formattedAmount,
          currency: payment.currency,
          reason: 'Payment was declined by the payment provider',
        },
      });
    }

    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId: tenant.id,
      event: `payment.${webhookData.status}`,
      payload: {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amount: Number(payment.amount),
        currency: payment.currency,
        provider: providerName,
        transactionId: webhookData.transactionId,
      },
    });

    this.logger.log(`Processed ${providerName} webhook for tenant ${tenant.id}: payment ${payment.id} → ${newStatus}`);
    return true;
  }

  /**
   * Match a provider notification to a payment. The provider's transaction id
   * wins. Otherwise our reference is used, but only when it is verified
   * (signed, or reported by the provider's API): the payment id, or, for
   * payments started before references were per payment, the invoice id.
   */
  private async findPayment(db: PrismaClient, providerName: string, webhookData: WebhookData) {
    const include = { invoice: { include: { customer: true } } } as const;
    if (webhookData.transactionId) {
      const byTransaction = await db.payment.findFirst({
        where: { provider: providerName, providerTransactionId: webhookData.transactionId },
        include,
      });
      if (byTransaction) return byTransaction;
    }
    const reference = webhookData.referenceVerified ? webhookData.invoiceId : undefined;
    if (reference) {
      const byId = await db.payment.findFirst({ where: { id: reference, provider: providerName }, include });
      if (byId) return byId;
      return db.payment.findFirst({
        where: { provider: providerName, invoiceId: reference },
        orderBy: { createdAt: 'desc' },
        include,
      });
    }
    return null;
  }

  /**
   * Record the notification in the tenant's inbox and decide whether to act
   * on it. Redeliveries, and notifications that would move a settled payment
   * backwards (a late "failed" after "succeeded"), are recorded but not
   * processed. A success whose amount or currency differs from the payment,
   * or that reports no amount, is held for review instead of settling it.
   */
  private async recordEvent(
    db: PrismaClient,
    providerName: string,
    route: string,
    payload: Record<string, unknown>,
    webhookData: WebhookData,
    payment: { id: string; status: string; amount: { toString(): string }; currency: string },
  ): Promise<Decision> {
    const settled = payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED';
    const incoming = webhookData.status;
    const mismatch = this.describeMismatch(webhookData, payment);
    let decision: Decision = 'process';
    if (settled && incoming === 'succeeded') decision = 'duplicate';
    else if (settled) decision = 'out_of_order';
    else if (payment.status === 'FAILED' && incoming === 'failed') decision = 'duplicate';
    else if (incoming === 'succeeded' && (mismatch || !(webhookData.amount > 0))) decision = 'held';

    if (mismatch) {
      this.logger.warn(`${providerName} reported ${mismatch} for payment ${payment.id}`);
    }

    // Status is part of the key: some providers reuse one id for every
    // notification about a transaction (pending, then succeeded).
    const eventKey = `${this.providerEventId(payload) ?? webhookData.transactionId ?? payment.id}:${incoming}`;
    try {
      await db.providerEvent.create({
        data: {
          provider: providerName,
          eventKey,
          eventType: String(payload.event_type ?? payload.event ?? payload.type ?? incoming),
          status: { process: 'PROCESSED', duplicate: 'DUPLICATE', out_of_order: 'IGNORED', held: 'HELD' }[decision] as never,
          route,
          paymentId: payment.id,
          amount: webhookData.amount ? String(webhookData.amount) : null,
          currency: webhookData.currency || null,
          mismatch: mismatch ?? (decision === 'held' ? 'amount not reported' : null),
          error: decision === 'out_of_order' ? `Payment already ${payment.status}; ignored "${incoming}"` : null,
          payload: payload as never,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Seen before. The payment's state decides: if the first attempt
        // crashed before updating it, this redelivery still gets processed.
        return decision;
      }
      // Tenant databases that have not been migrated have no inbox table yet;
      // fall back to the state checks alone.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021')) {
        this.logger.warn(`Could not record provider event: ${error instanceof Error ? error.message : error}`);
      }
    }
    return decision;
  }

  private describeMismatch(
    webhookData: WebhookData,
    payment: { amount: { toString(): string }; currency: string },
  ): string | null {
    const problems: string[] = [];
    if (webhookData.currency && webhookData.currency.toUpperCase() !== payment.currency.toUpperCase()) {
      problems.push(`currency ${webhookData.currency} (expected ${payment.currency})`);
    }
    if (webhookData.amount > 0 && toScaled(webhookData.amount) !== toScaled(payment.amount.toString())) {
      problems.push(`amount ${webhookData.amount} (expected ${payment.amount.toString()})`);
    }
    return problems.length ? problems.join(', ') : null;
  }

  /** The provider's own id for this notification, when it sends one. */
  private providerEventId(payload: Record<string, unknown>): string | null {
    const id = payload.id ?? payload.event_id;
    return typeof id === 'string' && id.length > 0 && id.length <= 200 ? `event:${id}` : null;
  }
}
