import { Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  BasePaymentProvider,
  ChargeParams,
  PaymentResult,
  RefundParams,
  RefundResult,
  PaymentStatusResult,
  WebhookData,
  ChargePaymentMethodParams,
} from './base-payment.provider';
import { toSmallestUnit, fromSmallestUnit } from '../common/utils/currency.utils';

interface PaystackCredentials {
  publicKey: string;
  secretKey: string;
}

export class PaystackProvider extends BasePaymentProvider {
  readonly name = 'paystack';
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly credentials: PaystackCredentials;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(credentials: PaystackCredentials) {
    super();
    this.credentials = credentials;
  }

  async charge(params: ChargeParams): Promise<PaymentResult> {
    try {
      const payload: Record<string, unknown> = {
        reference: params.reference,
        amount: toSmallestUnit(params.amount, params.currency), // Paystack uses smallest currency unit
        currency: params.currency,
        email: params.email,
        callback_url: params.callbackUrl,
        metadata: {
          ...params.metadata,
          ...(params.customerName && { customer_name: params.customerName }),
        },
      };

      // Restrict to card channel when tokenization is needed (for recurring billing)
      // Paystack channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer']
      if (params.paymentOptions === 'card') {
        payload.channels = ['card'];
      }

      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.status) {
        return {
          success: true,
          paymentUrl: data.data?.authorization_url,
          transactionId: data.data?.reference,
        };
      }

      return { success: false, error: data.message || 'Payment initiation failed' };
    } catch (error) {
      this.logger.error('Paystack charge failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      const response = await fetch(`${this.baseUrl}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: params.transactionId,
          amount: params.amount ? toSmallestUnit(params.amount, params.currency || 'NGN') : undefined,
        }),
      });

      const data = await response.json();

      if (data.status) {
        return { success: true, refundId: data.data?.id?.toString() };
      }

      return { success: false, error: data.message };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    const response = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(transactionId)}`, {
      headers: {
        Authorization: `Bearer ${this.credentials.secretKey}`,
      },
    });

    const data = await response.json();
    const txData = data.data;

    let status: 'succeeded' | 'pending' | 'failed' = 'pending';
    if (txData?.status === 'success') status = 'succeeded';
    else if (txData?.status === 'failed') status = 'failed';

    return {
      status,
      transactionId: txData?.reference || transactionId,
      amount: fromSmallestUnit(txData?.amount || 0, txData?.currency || 'USD'),
      currency: txData?.currency || '',
    };
  }

  async handleWebhook(payload: Record<string, unknown>, signature: string, rawBody?: string): Promise<WebhookData> {
    // Paystack signs the exact bytes it sent: verify against the raw body.
    if (!signature || !rawBody) {
      throw new Error('Unsigned Paystack webhook');
    }
    const expected = Buffer.from(createHmac('sha512', this.credentials.secretKey).update(rawBody).digest('hex'));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new Error('Invalid webhook signature');
    }

    const data = (payload.data as Record<string, unknown>) || {};
    const authorization = data.authorization as Record<string, unknown> | undefined;

    const result: WebhookData = {
      status: data.status === 'success' ? 'succeeded' : 'failed',
      transactionId: String(data.reference || ''),
      amount: fromSmallestUnit(Number(data.amount || 0), String(data.currency || 'USD')),
      currency: String(data.currency || ''),
      invoiceId: String(data.reference || ''),
      referenceVerified: true,
    };

    // Extract card authorization from successful payment (for recurring billing)
    // Paystack returns authorization data on every successful card charge
    if (data.status === 'success' && authorization?.reusable === true) {
      result.paymentMethodToken = {
        token: String(authorization.authorization_code || ''),
        last4: String(authorization.last4 || ''),
        brand: String(authorization.card_type || authorization.brand || ''),
        expMonth: Number(authorization.exp_month) || undefined,
        expYear: Number(authorization.exp_year) || undefined,
        email: String(data.customer && (data.customer as Record<string, unknown>).email || ''),
      };
    }

    return result;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/bank`, {
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
        },
      });
      const data = await response.json();
      return data.status === true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Tokenization Methods (Authorization Codes)
  // ============================================================
  // Cards are saved automatically on first charge — the authorization code
  // comes back in handleWebhook().paymentMethodToken. No separate
  // createPaymentMethod step is needed.

  async chargePaymentMethod(params: ChargePaymentMethodParams): Promise<PaymentResult> {
    try {
      // Charge using saved authorization code
      const response = await fetch(`${this.baseUrl}/transaction/charge_authorization`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authorization_code: params.paymentMethodId, // This is the authorization code
          email: String(params.metadata?.email || ''),
          amount: toSmallestUnit(params.amount, params.currency), // Convert to smallest currency unit
          currency: params.currency,
          reference: params.reference,
          metadata: params.metadata,
        }),
      });

      if (response.status >= 500) {
        return { success: false, ambiguous: true, error: `Paystack returned ${response.status}` };
      }
      const data = await response.json();

      if (data.status && data.data?.status === 'success') {
        return {
          success: true,
          transactionId: data.data?.reference,
        };
      }
      if (data.status && ['pending', 'ongoing', 'processing', 'queued'].includes(String(data.data?.status))) {
        return { success: false, ambiguous: true, transactionId: data.data?.reference, error: `Charge ${data.data?.status}` };
      }

      return {
        success: false,
        error: data.message || 'Charge failed',
      };
    } catch (error) {
      this.logger.error('Paystack chargePaymentMethod failed', error);
      return {
        success: false,
        ambiguous: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deletePaymentMethod(paymentMethodId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Deactivate authorization code
      const response = await fetch(`${this.baseUrl}/customer/deactivate_authorization`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authorization_code: paymentMethodId,
        }),
      });

      const data = await response.json();

      if (data.status) {
        return { success: true };
      }

      return {
        success: false,
        error: data.message || 'Failed to deactivate authorization',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
