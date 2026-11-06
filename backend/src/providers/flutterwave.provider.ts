import { Logger } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
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

interface FlutterwaveCredentials {
  publicKey: string;
  secretKey: string;
  encryptionKey: string;
  secretHash?: string;
}

/** Flutterwave's payment_options value for mobile money in each currency. */
const MOBILE_MONEY_OPTIONS: Record<string, string> = {
  UGX: 'mobilemoneyuganda',
  KES: 'mpesa',
  GHS: 'mobilemoneyghana',
  RWF: 'mobilemoneyrwanda',
  TZS: 'mobilemoneytanzania',
  ZMW: 'mobilemoneyzambia',
  XOF: 'mobilemoneyfranco',
  XAF: 'mobilemoneyfranco',
};

export class FlutterwaveProvider extends BasePaymentProvider {
  readonly name = 'flutterwave';
  private readonly logger = new Logger(FlutterwaveProvider.name);
  private readonly credentials: FlutterwaveCredentials;
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  constructor(credentials: FlutterwaveCredentials) {
    super();
    this.credentials = credentials;
  }

  async charge(params: ChargeParams): Promise<PaymentResult> {
    try {
      const [firstName, ...rest] = (params.customerName || '').split(' ');
      const lastName = rest.join(' ') || undefined;

      const payload: Record<string, unknown> = {
        tx_ref: params.reference,
        amount: params.amount,
        currency: params.currency,
        redirect_url: params.callbackUrl,
        customer: {
          email: params.email,
          name: params.customerName,
          ...(firstName && { first_name: firstName }),
          ...(lastName && { last_name: lastName }),
        },
        customizations: {
          title: 'Invoice Payment',
          description: `Payment for ${params.reference}`,
        },
        meta: params.metadata,
      };

      // Restrict to card-only when tokenization is needed (for recurring billing),
      // or to the country's wallets when the payer chose mobile money.
      const options = params.method === 'mobile_money' ? MOBILE_MONEY_OPTIONS[params.currency] : params.paymentOptions;
      if (options) {
        payload.payment_options = options;
      }

      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.status === 'success') {
        return {
          success: true,
          paymentUrl: data.data?.link,
          transactionId: params.reference,
        };
      }

      return { success: false, error: data.message || 'Payment initiation failed' };
    } catch (error) {
      this.logger.error('Flutterwave charge failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      const response = await fetch(`${this.baseUrl}/transactions/${params.transactionId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: params.amount,
        }),
      });

      const data = await response.json();

      if (data.status === 'success') {
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

  private async verifyTransaction(id: string) {
    const response = await fetch(`${this.baseUrl}/transactions/${encodeURIComponent(id)}/verify`, {
      headers: { Authorization: `Bearer ${this.credentials.secretKey}` },
    });
    if (!response.ok) throw new Error(`Flutterwave verify returned ${response.status}`);
    const data = (await response.json()).data ?? {};
    const status: WebhookData['status'] = data.status === 'successful' ? 'succeeded' : data.status === 'failed' ? 'failed' : 'pending';
    return { status, amount: Number(data.amount || 0), currency: String(data.currency || ''), reference: data.tx_ref ? String(data.tx_ref) : undefined };
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    const response = await fetch(`${this.baseUrl}/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: {
        Authorization: `Bearer ${this.credentials.secretKey}`,
      },
    });

    const data = await response.json();
    const txData = data.data;

    let status: 'succeeded' | 'pending' | 'failed' = 'pending';
    if (txData?.status === 'successful') status = 'succeeded';
    else if (txData?.status === 'failed') status = 'failed';

    return {
      status,
      transactionId: txData?.id?.toString() || transactionId,
      amount: txData?.amount || 0,
      currency: txData?.currency || '',
    };
  }

  async handleWebhook(payload: Record<string, unknown>, signature: string): Promise<WebhookData> {
    // The verif-hash header must match the secret hash set in the Flutterwave
    // dashboard and saved with these credentials. Without one nothing is accepted.
    if (!this.credentials.secretHash) {
      throw new Error('Flutterwave secret hash is not configured; cannot verify notifications');
    }
    const expected = Buffer.from(String(this.credentials.secretHash));
    const given = Buffer.from(signature || '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new Error('Invalid Flutterwave webhook signature');
    }

    const data = payload.data as Record<string, unknown> | undefined;
    const card = data?.card as Record<string, unknown> | undefined;
    const id = String(data?.id || '');
    if (!id) throw new Error('Flutterwave webhook without a transaction id');

    // The outcome, amount and our reference come from Flutterwave's verify API, not the notification.
    const verified = await this.verifyTransaction(id);

    const result: WebhookData = {
      status: verified.status,
      transactionId: id,
      amount: verified.amount,
      currency: verified.currency,
      invoiceId: verified.reference,
      referenceVerified: Boolean(verified.reference),
    };

    // Extract card token from successful payment (for recurring billing)
    // Flutterwave returns card.token on successful card charges
    if (verified.status === 'succeeded' && card?.token) {
      const customer = data?.customer as Record<string, unknown> | undefined;
      result.paymentMethodToken = {
        token: String(card.token),
        last4: String(card.last_4digits || ''),
        brand: String(card.type || ''),
        expMonth: Number(card.expiry?.toString().split('/')[0]) || undefined,
        expYear: Number(card.expiry?.toString().split('/')[1]) || undefined,
        email: String(customer?.email || ''),
      };
    }

    return result;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/banks/NG`, {
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
        },
      });
      const data = await response.json();
      return data.status === 'success';
    } catch {
      return false;
    }
  }

  // ============================================================
  // Tokenization Methods (Card Tokens)
  // ============================================================
  // Cards are saved automatically on first charge — the card token
  // comes back in handleWebhook().paymentMethodToken. No separate
  // createPaymentMethod step is needed.

  async chargePaymentMethod(params: ChargePaymentMethodParams): Promise<PaymentResult> {
    try {
      // Charge using saved card token
      const response = await fetch(`${this.baseUrl}/tokenized-charges`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: params.paymentMethodId,
          currency: params.currency,
          country: String(params.metadata?.country || 'NG'),
          amount: params.amount,
          email: String(params.metadata?.email || ''),
          first_name: String(params.metadata?.firstName || ''),
          last_name: String(params.metadata?.lastName || ''),
          tx_ref: params.reference,
          narration: `Recurring charge for ${params.reference}`,
        }),
      });

      const data = await response.json();

      if (data.status === 'success' && data.data?.status === 'successful') {
        return {
          success: true,
          transactionId: String(data.data?.id || params.reference),
        };
      }

      return {
        success: false,
        error: data.message || 'Tokenized charge failed',
      };
    } catch (error) {
      this.logger.error('Flutterwave chargePaymentMethod failed', error);
      return {
        success: false,
        ambiguous: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deletePaymentMethod(paymentMethodId: string): Promise<{ success: boolean; error?: string }> {
    // Flutterwave doesn't have a direct API to delete tokens
    // Tokens expire after a period of inactivity
    // For now, we'll just return success (token won't be used anymore in our system)
    return { success: true };
  }
}
