import { GatewayCredentials, gatewayConfig, GatewayClient } from '../modules/money/adapters/gateway.adapter';
import { notificationUrls } from '../modules/money/notification-urls';
import {
  BasePaymentProvider,
  ChargeParams,
  PaymentResult,
  PaymentStatusResult,
  RefundParams,
  RefundResult,
  WebhookData,
} from './base-payment.provider';

interface GatewayCollection {
  reference: string;
  status: 'pending' | 'succeeded' | 'failed';
  amount: string;
  currency: string;
  checkoutUrl?: string;
  providerReference?: string;
  failureReason?: string;
}

/**
 * Invoice checkout through the payment gateway: the platform's provider accounts
 * take the payment for the organisation (card, mobile money or PayPal on the
 * hosted page) and pay it out to them. Our payment id is the collection
 * reference, so notifications and status checks find the payment directly.
 * Notifications arrive at /webhooks/gateway/:tenantId/callback.
 */
export class GatewayCheckoutProvider extends BasePaymentProvider {
  readonly name = 'gateway';
  private readonly client: GatewayClient | null;

  constructor(
    private readonly credentials: GatewayCredentials & { tenantId?: string },
    fetchImpl: typeof fetch = fetch,
  ) {
    super();
    const config = gatewayConfig();
    this.client = config ? new GatewayClient(config, fetchImpl) : null;
  }

  async charge(params: ChargeParams): Promise<PaymentResult> {
    if (!this.client || !this.credentials.accountId) return { success: false, error: 'The payment gateway is not available here' };
    const r = await this.client
      .request<GatewayCollection>(
        'POST',
        '/v1/collections',
        {
          account: this.credentials.accountId,
          reference: params.reference,
          amount: String(params.amount),
          currency: params.currency,
          description: typeof params.metadata?.description === 'string' ? params.metadata.description : 'Invoice payment',
          method: params.method ?? 'card',
          customer: { email: params.email, ...(params.customerName && { name: params.customerName }) },
          redirectUrl: params.callbackUrl,
          ...(this.credentials.tenantId && { notificationUrl: notificationUrls('gateway', this.credentials.tenantId).notificationUrl }),
        },
        params.reference,
      )
      .catch((error: Error) => ({ status: 0, data: null as GatewayCollection | null, error: error.message }));
    if (!r.data) return { success: false, error: r.error ?? 'The payment gateway could not start the checkout', ambiguous: r.status === 0 };
    if (r.data.status === 'failed' || !r.data.checkoutUrl) return { success: false, error: r.data.failureReason ?? 'The payment gateway could not start the checkout' };
    return { success: true, transactionId: params.reference, paymentUrl: r.data.checkoutUrl };
  }

  /** `transactionId` is our reference (the payment id). */
  async getPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    if (!this.client) return { status: 'pending', transactionId, amount: 0, currency: '' };
    const r = await this.client.request<GatewayCollection>(
      'GET',
      `/v1/collections/${encodeURIComponent(transactionId)}?account=${encodeURIComponent(this.credentials.accountId)}`,
    );
    if (r.status === 404) return { status: 'failed', transactionId, amount: 0, currency: '', reference: transactionId };
    if (!r.data) return { status: 'pending', transactionId, amount: 0, currency: '' };
    return { status: r.data.status, transactionId, amount: Number(r.data.amount), currency: r.data.currency, reference: r.data.reference };
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    return { success: false, error: 'Refunds of gateway payments are made by the platform operator; contact support' };
  }

  async handleWebhook(): Promise<WebhookData> {
    throw new Error('Payment gateway notifications are handled at /webhooks/gateway/:tenantId/callback');
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false;
    return Boolean((await this.client.getAccount(this.credentials.accountId)).data);
  }
}
