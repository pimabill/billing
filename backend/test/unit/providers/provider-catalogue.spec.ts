import { PaymentProvidersService } from '../../../src/modules/payment-providers/payment-providers.service';
import { environmentOf, PROVIDER_CATALOGUE, webhookUrlFor } from '../../../src/modules/payment-providers/provider-catalogue';

describe('payment provider catalogue', () => {
  const encryption = { decrypt: (v: string) => v, encrypt: (v: string) => v };
  const rows = [
    { id: 'pp_1', providerName: 'flutterwave', isActive: true, priority: 1, credentials: JSON.stringify({ secretKey: 'FLWSECK_TEST-abc123', webhookHash: 'whsec_super_secret' }), createdAt: new Date(), updatedAt: new Date() },
    { id: 'pp_2', providerName: 'managed', isActive: true, priority: 1000, credentials: JSON.stringify({ accountId: 'acc_9' }), createdAt: new Date(), updatedAt: new Date() },
  ];
  const db = { paymentProvider: { findMany: jest.fn(async () => rows), findUnique: jest.fn(async () => rows[0]) } };
  const service = new PaymentProvidersService(encryption as never);

  it('lists every supported provider, configured ones first, without credentials', async () => {
    const list = (await service.findAll(db as never, 'ten_1')) as Array<Record<string, unknown>>;
    expect(list[0]).toMatchObject({ id: 'pp_1', providerName: 'flutterwave', name: 'Flutterwave', isConfigured: true, environment: 'sandbox', webhookUrl: expect.stringMatching(/\/webhooks\/flutterwave\/ten_1$/) });
    expect(list[1]).toMatchObject({ providerName: 'managed', name: 'Managed payments', isConfigured: true });
    expect(list.filter((p) => !p.isConfigured).map((p) => p.providerName)).toContain('stripe');
    expect(list).toHaveLength(PROVIDER_CATALOGUE.length + 1);
    const text = JSON.stringify(list);
    for (const secret of ['FLWSECK_TEST-abc123', 'whsec_super_secret', 'acc_9', 'credentials']) expect(text).not.toContain(secret);
  });

  it('lists only the configured ones when asked', async () => {
    const list = await service.findAll(db as never, 'ten_1', { configured: true });
    expect(list.map((p) => p.providerName)).toEqual(['flutterwave', 'managed']);
  });

  it('tells the environment from settings or the key, and where notifications go', () => {
    expect(environmentOf({ environment: 'production' })).toBe('live');
    expect(environmentOf({ environment: 'Sandbox' })).toBe('sandbox');
    expect(environmentOf({ secretKey: 'sk_live_x' })).toBe('live');
    expect(environmentOf({ consumerKey: 'x' })).toBeNull();
    expect(webhookUrlFor('btc', 't')).toBeNull();
    expect(webhookUrlFor('yo', 't')).toMatch(/\/webhooks\/yo\/t\/ipn$/);
    expect(webhookUrlFor('mtn_momo', 't')).toMatch(/\/webhooks\/mtn_momo\/t\/callback$/);
  });
});
