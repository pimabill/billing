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
  SavedPaymentMethodParams,
  SavedPaymentMethodResult,
  ChargePaymentMethodParams,
} from './base-payment.provider';
import { toSmallestUnit, fromSmallestUnit } from '../common/utils/currency.utils';
import { getBrand } from '../config/brand';

interface StripeCredentials {
  secretKey: string;
  webhookSecret: string;
}

export class StripeProvider extends BasePaymentProvider {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripeProvider.name);
  private readonly credentials: StripeCredentials;
  private readonly baseUrl = 'https://api.stripe.com/v1';

  constructor(credentials: StripeCredentials) {
    super();
    this.credentials = credentials;
  }

  private get authHeaders() {
    return {
      Authorization: `Bearer ${this.credentials.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  private encodeParams(params: Record<string, string | number | undefined>): string {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  }

  async charge(params: ChargeParams): Promise<PaymentResult> {
    try {
      if (!params.callbackUrl) {
        return { success: false, error: 'callbackUrl is required for Stripe checkout' };
      }

      // Create a Checkout Session for redirect-based payment
      const sessionParams: Record<string, string | number | undefined> = {
        'line_items[0][price_data][currency]': params.currency.toLowerCase(),
        'line_items[0][price_data][product_data][name]': `Invoice ${params.reference}`,
        'line_items[0][price_data][unit_amount]': toSmallestUnit(params.amount, params.currency),
        'line_items[0][quantity]': 1,
        mode: 'payment',
        'metadata[reference]': params.reference,
        'metadata[email]': params.email,
        success_url: `${params.callbackUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: params.callbackUrl,
        customer_email: params.email,
      };

      // Restrict to card if specified (enables tokenization)
      if (params.paymentOptions === 'card') {
        sessionParams['payment_method_types[0]'] = 'card';
      }

      const body = this.encodeParams(sessionParams);

      const response = await fetch(`${this.baseUrl}/checkout/sessions`, {
        method: 'POST',
        headers: this.authHeaders,
        body,
      });

      const data = await response.json();

      if (data.id) {
        return {
          success: true,
          paymentUrl: data.url,
          transactionId: data.id,
        };
      }

      return {
        success: false,
        error: data.error?.message || 'Stripe session creation failed',
      };
    } catch (error) {
      this.logger.error('Stripe charge failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    try {
      // First retrieve the checkout session to get the payment intent
      const sessionRes = await fetch(`${this.baseUrl}/checkout/sessions/${params.transactionId}`, {
        headers: this.authHeaders,
      });
      const session = await sessionRes.json();
      const paymentIntent = session.payment_intent;

      if (!paymentIntent) {
        return { success: false, error: 'No payment intent found for this session' };
      }

      const body = this.encodeParams({
        payment_intent: paymentIntent,
        ...(params.amount ? { amount: toSmallestUnit(params.amount, params.currency || 'USD') } : {}),
      });

      const response = await fetch(`${this.baseUrl}/refunds`, {
        method: 'POST',
        headers: this.authHeaders,
        body,
      });

      const data = await response.json();

      if (data.id) {
        return { success: true, refundId: data.id };
      }

      return { success: false, error: data.error?.message || 'Refund failed' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    const response = await fetch(`${this.baseUrl}/checkout/sessions/${encodeURIComponent(transactionId)}`, {
      headers: this.authHeaders,
    });

    const data = await response.json();

    let status: 'succeeded' | 'pending' | 'failed' = 'pending';
    if (data.payment_status === 'paid') status = 'succeeded';
    else if (data.status === 'expired') status = 'failed';

    return {
      status,
      transactionId: data.id || transactionId,
      amount: fromSmallestUnit(data.amount_total || 0, (data.currency || 'USD').toUpperCase()),
      currency: (data.currency || '').toUpperCase(),
    };
  }

  async handleWebhook(payload: Record<string, unknown>, signature: string, rawBody?: string): Promise<WebhookData> {
    // Every notification must be signed with the configured webhook secret.
    if (!this.credentials.webhookSecret) {
      throw new Error('Stripe webhook secret is not configured; cannot verify notifications');
    }
    if (!signature || !rawBody) {
      throw new Error('Unsigned Stripe webhook');
    }
    this.verifyStripeSignature(signature, rawBody);

    const event = payload as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };

    const obj = event.data?.object || {};
    const isSuccess =
      event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded';

    const result: WebhookData = {
      status: isSuccess ? 'succeeded' : 'failed',
      transactionId: String(obj.id || ''),
      amount: fromSmallestUnit(Number(obj.amount_total || obj.amount || 0), String(obj.currency || 'USD').toUpperCase()),
      currency: String(obj.currency || '').toUpperCase(),
      invoiceId: String((obj.metadata as Record<string, string>)?.reference || ''),
      referenceVerified: true,
    };

    // Extract payment method from successful payment_intent for recurring billing
    if (isSuccess && event.type === 'payment_intent.succeeded') {
      const paymentMethod = String(obj.payment_method || '');
      const customer = String(obj.customer || '');
      if (paymentMethod && customer) {
        result.paymentMethodToken = {
          token: paymentMethod,
        };
      }
    }

    return result;
  }

  private verifyStripeSignature(signatureHeader: string, rawBody: string): void {
    // Parse stripe-signature header: "t=timestamp,v1=signature"
    const parts = signatureHeader.split(',').reduce(
      (acc, part) => {
        const [key, value] = part.split('=');
        if (key === 't') acc.timestamp = value;
        if (key === 'v1') acc.signatures.push(value);
        return acc;
      },
      { timestamp: '', signatures: [] as string[] },
    );

    if (!parts.timestamp || parts.signatures.length === 0) {
      throw new Error('Invalid Stripe signature header format');
    }

    // Reject timestamps older than 5 minutes to prevent replay attacks
    const timestampAge = Math.floor(Date.now() / 1000) - Number(parts.timestamp);
    if (!Number.isFinite(timestampAge) || Math.abs(timestampAge) > 300) {
      throw new Error('Stripe webhook timestamp too old');
    }

    // Compute expected signature: HMAC-SHA256(secret, "timestamp.rawBody")
    const expectedSig = createHmac('sha256', this.credentials.webhookSecret)
      .update(`${parts.timestamp}.${rawBody}`)
      .digest('hex');

    // Check if any of the v1 signatures match (timing-safe comparison)
    const isValid = parts.signatures.some((sig) => {
      try {
        return timingSafeEqual(
          Buffer.from(expectedSig, 'hex'),
          Buffer.from(sig, 'hex'),
        );
      } catch {
        return false;
      }
    });

    if (!isValid) {
      throw new Error('Invalid Stripe webhook signature');
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/balance`, {
        headers: this.authHeaders,
      });
      const data = await response.json();
      return Array.isArray(data.available);
    } catch {
      return false;
    }
  }

  // ============================================================
  // Tokenization Methods (Card on File / Recurring Billing)
  // ============================================================

  async createPaymentMethod(params: SavedPaymentMethodParams): Promise<SavedPaymentMethodResult> {
    try {
      // Create or retrieve Stripe customer
      let customerId = params.customerId;

      if (!customerId) {
        const customerBody = this.encodeParams({
          email: params.customerEmail,
          ...(params.metadata ? { 'metadata[source]': getBrand().slug } : {}),
        });

        const customerResponse = await fetch(`${this.baseUrl}/customers`, {
          method: 'POST',
          headers: this.authHeaders,
          body: customerBody,
        });

        const customer = await customerResponse.json();
        if (!customer.id) {
          return {
            success: false,
            error: customer.error?.message || 'Failed to create Stripe customer',
          };
        }
        customerId = customer.id;
      }

      // Create a SetupIntent for collecting payment method
      const setupBody = this.encodeParams({
        customer: customerId,
        'payment_method_types[0]': 'card',
        usage: 'off_session', // Allow charging when customer is not present
      });

      const setupResponse = await fetch(`${this.baseUrl}/setup_intents`, {
        method: 'POST',
        headers: this.authHeaders,
        body: setupBody,
      });

      const setupIntent = await setupResponse.json();

      if (!setupIntent.id) {
        return {
          success: false,
          error: setupIntent.error?.message || 'Failed to create setup intent',
        };
      }

      // Return setup intent for frontend to complete
      // Frontend will use Stripe.js to confirm the SetupIntent with card details
      return {
        success: true,
        paymentMethodId: setupIntent.id, // This is the SetupIntent ID
        // Card details will be available after frontend confirms the setup
      };
    } catch (error) {
      this.logger.error('Stripe createPaymentMethod failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async chargePaymentMethod(params: ChargePaymentMethodParams): Promise<PaymentResult> {
    try {
      // Create a PaymentIntent with saved payment method
      const body = this.encodeParams({
        amount: toSmallestUnit(params.amount, params.currency), // Convert to smallest currency unit
        currency: params.currency.toLowerCase(),
        payment_method: params.paymentMethodId,
        customer: params.customerId,
        confirm: 'true', // Automatically confirm the payment
        off_session: 'true', // Customer is not present
        'metadata[reference]': params.reference,
        ...(params.metadata
          ? Object.entries(params.metadata).reduce(
              (acc, [key, value]) => ({
                ...acc,
                [`metadata[${key}]`]: String(value),
              }),
              {},
            )
          : {}),
      });

      const response = await fetch(`${this.baseUrl}/payment_intents`, {
        method: 'POST',
        // A retried job reuses the key, so Stripe returns the first attempt instead of charging again.
        headers: { ...this.authHeaders, 'Idempotency-Key': `charge-${params.reference}` },
        body,
      });

      if (response.status >= 500) {
        return { success: false, ambiguous: true, error: `Stripe returned ${response.status}` };
      }
      const paymentIntent = await response.json();
      if (paymentIntent.status === 'processing') {
        return { success: false, ambiguous: true, transactionId: paymentIntent.id, error: 'Payment is processing' };
      }

      if (paymentIntent.status === 'succeeded') {
        return {
          success: true,
          transactionId: paymentIntent.id,
        };
      }

      if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_payment_method') {
        return {
          success: false,
          error: 'Payment requires additional authentication or failed',
        };
      }

      return {
        success: false,
        error: paymentIntent.error?.message || `Payment failed with status: ${paymentIntent.status}`,
      };
    } catch (error) {
      this.logger.error('Stripe chargePaymentMethod failed', error);
      return {
        success: false,
        // Network failure: the charge may have been made.
        ambiguous: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deletePaymentMethod(paymentMethodId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/payment_methods/${paymentMethodId}/detach`, {
        method: 'POST',
        headers: this.authHeaders,
      });

      const data = await response.json();

      if (data.id) {
        return { success: true };
      }

      return {
        success: false,
        error: data.error?.message || 'Failed to detach payment method',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
