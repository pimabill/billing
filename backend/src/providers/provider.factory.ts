import { BasePaymentProvider } from './base-payment.provider';
import { FlutterwaveProvider } from './flutterwave.provider';
import { PaystackProvider } from './paystack.provider';
import { StripeProvider } from './stripe.provider';
import { DpoProvider } from './dpo.provider';
import { PayUProvider } from './payu.provider';
import { PesapalProvider } from './pesapal.provider';
import { PayPalProvider } from './paypal.provider';
import { ManagedCheckoutProvider } from './managed.provider';

/**
 * Providers that can run an invoice checkout through BasePaymentProvider.
 * Money-movement-only providers (e.g. Yo! Payments) are configured in the same
 * table but must never be picked as the default checkout provider.
 */
export const CHECKOUT_PROVIDER_NAMES = ['stripe', 'paystack', 'flutterwave', 'dpo', 'dpo-group', 'payu', 'pesapal', 'paypal', 'managed'];

export class ProviderFactory {
  static create(providerName: string, credentials: Record<string, unknown>): BasePaymentProvider {
    switch (providerName.toLowerCase()) {
      case 'stripe':
        return new StripeProvider(
          credentials as { secretKey: string; webhookSecret: string },
        );
      case 'paystack':
        return new PaystackProvider(credentials as { publicKey: string; secretKey: string });
      case 'flutterwave':
        return new FlutterwaveProvider(
          credentials as { publicKey: string; secretKey: string; encryptionKey: string },
        );
      case 'dpo':
      case 'dpo-group':
        return new DpoProvider(
          credentials as { companyToken: string; serviceType: string; environment: 'test' | 'live' },
        );
      case 'payu':
        return new PayUProvider(
          credentials as { apiKey: string; safeKey: string; environment: 'staging' | 'production' },
        );
      case 'pesapal':
        return new PesapalProvider(
          credentials as { consumerKey: string; consumerSecret: string; environment: 'sandbox' | 'live'; ipnId?: string },
        );
      case 'paypal':
        return new PayPalProvider(
          credentials as { clientId: string; clientSecret: string; webhookId: string; environment: 'sandbox' | 'live' },
        );
      case 'managed':
        // Managed payments: the platform's provider accounts take the payment (see ManagedCheckoutProvider).
        return new ManagedCheckoutProvider(credentials as { accountId: string; tenantId?: string });
      default:
        throw new Error(`Unsupported payment provider: ${providerName}`);
    }
  }
}
