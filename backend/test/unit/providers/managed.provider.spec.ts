import { ManagedCheckoutProvider } from '../../../src/providers/managed.provider';
import { ProviderFactory, CHECKOUT_PROVIDER_NAMES } from '../../../src/providers/provider.factory';

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

describe('ManagedCheckoutProvider', () => {
  beforeEach(() => {
    process.env.MANAGED_PAYMENTS_URL = 'https://managed.example.com';
    process.env.MANAGED_PAYMENTS_API_KEY = 'inst_key';
    process.env.API_BASE_URL = 'https://api.example.com';
  });
  afterEach(() => {
    delete process.env.MANAGED_PAYMENTS_URL;
    delete process.env.MANAGED_PAYMENTS_API_KEY;
  });

  it("is a checkout provider, tried after the organisation's own", () => {
    expect(CHECKOUT_PROVIDER_NAMES).toContain('managed');
    expect(ProviderFactory.create('managed', { accountId: 'acc_1' })).toBeInstanceOf(ManagedCheckoutProvider);
  });

  it('starts a hosted checkout on the merchant account, keyed by our payment id', async () => {
    const fetch = jest.fn(() => json({ reference: 'pay_1', status: 'pending', amount: '110000', currency: 'UGX', checkoutUrl: 'https://checkout.example/x' }));
    const provider = new ManagedCheckoutProvider({ accountId: 'acc_1', tenantId: 't_1' }, fetch as never);
    const result = await provider.charge({ amount: 110000, currency: 'UGX', email: 'org@example.com', customerName: 'Org', reference: 'pay_1', callbackUrl: 'https://app.example.com/back' });
    expect(result).toEqual({ success: true, transactionId: 'pay_1', paymentUrl: 'https://checkout.example/x' });
    const [url, init] = (fetch.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe('https://managed.example.com/v1/collections');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('pay_1');
    expect(JSON.parse(String(init.body))).toMatchObject({
      account: 'acc_1',
      reference: 'pay_1',
      amount: '110000',
      currency: 'UGX',
      method: 'card',
      redirectUrl: 'https://app.example.com/back',
      notificationUrl: 'https://api.example.com/webhooks/managed/t_1/callback',
    });
  });

  it('reports refusals as failures, so checkout can try the next provider', async () => {
    const provider = new ManagedCheckoutProvider({ accountId: 'acc_1' }, jest.fn(() => json({ message: 'Account is not active' }, 409)) as never);
    expect(await provider.charge({ amount: 1, currency: 'UGX', email: 'a@b.co', reference: 'pay_2' })).toMatchObject({ success: false, error: 'Account is not active' });
  });

  it('reads the outcome from the service, by our reference', async () => {
    const fetch = jest.fn(() => json({ reference: 'pay_1', status: 'succeeded', amount: '110000', currency: 'UGX' }));
    const status = await new ManagedCheckoutProvider({ accountId: 'acc_1' }, fetch as never).getPaymentStatus('pay_1');
    expect(status).toEqual({ status: 'succeeded', transactionId: 'pay_1', amount: 110000, currency: 'UGX', reference: 'pay_1' });
    expect(((fetch.mock.calls[0] as unknown) as [string])[0]).toBe('https://managed.example.com/v1/collections/pay_1?account=acc_1');
  });
});
