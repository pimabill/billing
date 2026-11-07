import { createHmac } from 'crypto';
import { GatewayAdapter, GatewayClient, gatewayConfig } from '../../../src/modules/money/adapters/gateway.adapter';
import { WebhooksController } from '../../../src/modules/webhooks/webhooks.controller';
import { GatewayAccountsService } from '../../../src/modules/money/gateway.service';

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const config = { baseUrl: 'https://gateway.example.com', apiKey: 'inst_key', webhookSecret: 'whsec' };

describe('GatewayAdapter', () => {
  it('creates a checkout on the tenant account, keyed by our reference', async () => {
    const fetch = jest.fn(() => json({ reference: 'col_1', status: 'pending', amount: '50000', currency: 'UGX', checkoutUrl: 'https://checkout.flutterwave.com/x' }));
    const out = await new GatewayAdapter({ accountId: 'acc_9' }, config, fetch as never).collect({
      reference: 'col_1',
      amount: '50000',
      currency: 'UGX',
      payer: { type: 'hosted', email: 'payer@example.com', name: 'Jane' },
      description: 'Order 1',
      callbackUrl: 'https://shop.example.com/done',
      notificationUrl: 'https://api.example.com/webhooks/gateway/t1/callback',
    });
    const [url, init] = (fetch.mock.calls[0] as unknown) as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://gateway.example.com/v1/collections');
    expect(headers.Authorization).toBe('Bearer inst_key');
    expect(headers['Idempotency-Key']).toBe('col_1');
    expect(JSON.parse(String(init.body))).toMatchObject({ account: 'acc_9', reference: 'col_1', amount: '50000', currency: 'UGX', customer: { email: 'payer@example.com' } });
    expect(out).toEqual({ state: 'pending', paymentUrl: 'https://checkout.flutterwave.com/x', providerStatus: 'CHECKOUT_CREATED' });
  });

  it('sends mobile money as a phone prompt, with no checkout page', async () => {
    const fetch = jest.fn(() => json({ reference: 'col_2', status: 'pending', method: 'mobile_money', amount: '50000', currency: 'UGX' }));
    const out = await new GatewayAdapter({ accountId: 'acc_9' }, config, fetch as never).collect({
      reference: 'col_2',
      amount: '50000',
      currency: 'UGX',
      payer: { type: 'mobile_money', msisdn: '256772123456', name: 'Jane' },
      description: 'Order 2',
    });
    const body = JSON.parse(String(((fetch.mock.calls[0] as unknown) as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ method: 'mobile_money', customer: { phone: '+256772123456', name: 'Jane' } });
    expect(body.customer.email).toBeUndefined();
    expect(out).toEqual({ state: 'pending', providerStatus: 'PROMPT_SENT' });
  });

  it('sends PayPal payers to PayPal', async () => {
    const fetch = jest.fn(() => json({ reference: 'col_3', status: 'pending', amount: '25.00', currency: 'USD', checkoutUrl: 'https://paypal.example/approve' }));
    const out = await new GatewayAdapter({ accountId: 'acc_9' }, config, fetch as never).collect({
      reference: 'col_3',
      amount: '25.00',
      currency: 'USD',
      payer: { type: 'paypal', email: 'p@example.com' },
      description: 'Order 3',
      callbackUrl: 'https://shop.example.com/done',
    });
    expect(JSON.parse(String(((fetch.mock.calls[0] as unknown) as [string, RequestInit])[1].body))).toMatchObject({ method: 'paypal', customer: { email: 'p@example.com' } });
    expect(out).toMatchObject({ state: 'pending', paymentUrl: 'https://paypal.example/approve' });
  });

  it('reports refusals and outages as clean failures', async () => {
    const refused = jest.fn(() => json({ message: 'Account is pending review' }, 409));
    const payer = { type: 'hosted' as const, email: 'p@example.com' };
    expect(await new GatewayAdapter({ accountId: 'a' }, config, refused as never).collect({ reference: 'c', amount: '1', currency: 'UGX', payer, description: 'x' })).toEqual({
      state: 'failed',
      failureReason: 'Account is pending review',
    });
    const down = jest.fn(() => Promise.reject(new TypeError('fetch failed')));
    expect(await new GatewayAdapter({ accountId: 'a' }, config, down as never).collect({ reference: 'c', amount: '1', currency: 'UGX', payer, description: 'x' })).toMatchObject({
      state: 'failed',
      failureReason: expect.stringMatching(/Could not reach the payment gateway/),
    });
  });

  it('takes the status, fees and processor reference from the service, holding amount mismatches', async () => {
    const check = (body: unknown, status = 200) => new GatewayAdapter({ accountId: 'acc_9' }, config, jest.fn(() => json(body, status)) as never).getCollection('col_1', null, '50000');
    expect(await check({ status: 'succeeded', amount: '50000', currency: 'UGX', providerReference: 'FLW-1', fees: '1750' })).toEqual({
      state: 'succeeded',
      providerStatus: 'SUCCEEDED',
      providerTxnId: 'FLW-1',
      fee: 1750,
    });
    expect(await check({ status: 'succeeded', amount: '40000', currency: 'UGX' })).toMatchObject({ state: 'pending', indeterminate: true });
    expect(await check({ status: 'failed', amount: '50000', currency: 'UGX', failureReason: 'Declined' })).toMatchObject({ state: 'failed', failureReason: 'Declined' });
    expect(await check({ message: 'Not found' }, 404)).toMatchObject({ state: 'failed', providerStatus: 'NOT_FOUND' });
    expect(await check({ message: 'busy' }, 503)).toMatchObject({ state: 'pending', providerStatus: 'HTTP_503' });
  });
});

describe('GatewayClient account page', () => {
  it('asks the gateway who may apply, and for a link to its own page', async () => {
    const fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ eligible: true, url: 'https://gateway.example.com/connect/t' }) }));
    const client = new GatewayClient(config, fetch as never);
    await client.eligibility('org 1');
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(`${config.baseUrl}/v1/eligibility?externalId=org%201`);
    await client.accountLink({ externalId: 'org_1', notificationUrl: 'https://api.example.com/n', returnUrl: 'https://app.example.com/providers' });
    expect((fetch.mock.calls[1] as unknown[])[0]).toBe(`${config.baseUrl}/v1/account-links`);
  });
});

describe('gateway notification signatures', () => {
  const client = new GatewayClient(config);
  const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', 'whsec').update(`${t}.${body}`).digest('hex')}`;

  it('accepts fresh signatures over the exact body only', () => {
    const body = '{"event":"collection.succeeded","collection":{"reference":"col_1"}}';
    expect(client.verifySignature(body, sign(body))).toBe(true);
    expect(client.verifySignature(body.replace('col_1', 'col_2'), sign(body))).toBe(false);
    expect(client.verifySignature(body, sign(body, Math.floor(Date.now() / 1000) - 3600))).toBe(false);
    expect(client.verifySignature(body, undefined)).toBe(false);
    expect(new GatewayClient({ ...config, webhookSecret: undefined }).verifySignature(body, sign(body))).toBe(false);
  });
});

describe('GatewayAccountsService', () => {
  const encryption = { encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v.slice(4) };
  const service = new GatewayAccountsService(encryption as never, {} as never);

  it('keeps the gateway connection active only while the account is, at the lowest priority', async () => {
    const upsert = jest.fn();
    const db = { paymentProvider: { upsert, findUnique: jest.fn(async () => null) } };
    await service.sync(db as never, { id: 'acc_9', status: 'pending_review' });
    const call = upsert.mock.calls[0][0];
    expect(call).toMatchObject({ where: { providerName: 'gateway' }, create: { providerName: 'gateway', isActive: false, priority: 1000 }, update: { isActive: false } });
    expect(JSON.parse(call.create.credentials.slice(4))).toMatchObject({ accountId: 'acc_9', status: 'pending_review' });
    await service.sync(db as never, { id: 'acc_9', status: 'active' });
    expect(upsert.mock.calls[1][0].update.isActive).toBe(true);
  });

  it('reports the payment gateway as unavailable without a subscription', async () => {
    delete process.env.GATEWAY_URL;
    expect(await service.status({} as never, 'free')).toEqual({ available: false, account: null });
  });

  it('lets the gateway decide who may apply, and offers nothing when it cannot answer', async () => {
    process.env.GATEWAY_URL = 'https://gateway.example.com';
    process.env.GATEWAY_API_KEY = 'inst_key';
    const answer = jest.spyOn(GatewayClient.prototype, 'eligibility');
    try {
      answer.mockResolvedValueOnce({ status: 200, data: { eligible: true } });
      expect(await service.allowedFor('org')).toBe(true);
      answer.mockResolvedValueOnce({ status: 200, data: { eligible: false } });
      expect(await service.allowedFor('org')).toBe(false);
      answer.mockRejectedValueOnce(new Error('down'));
      expect(await service.allowedFor('org')).toBe(false);
    } finally {
      answer.mockRestore();
      delete process.env.GATEWAY_URL;
      delete process.env.GATEWAY_API_KEY;
    }
  });
});

describe('GatewayAccountsService status changes', () => {
  const setup = () => {
    let stored: string | null = null;
    const db = {
      paymentProvider: {
        findUnique: jest.fn(async () => (stored ? { credentials: stored } : null)),
        upsert: jest.fn(async (args: any) => {
          stored = args.create.credentials;
          return {};
        }),
      },
    };
    const encryption = { encrypt: (v: string) => v, decrypt: (v: string) => v };
    const central = {
      client: {
        membership: {
          findMany: jest.fn(async () => [
            { user: { email: 'owner@example.com', name: 'Owner' }, tenant: { name: 'Acme' } },
            { user: { email: 'admin@example.com', name: 'Admin' }, tenant: { name: 'Acme' } },
          ]),
        },
      },
    };
    const email = { sendHtml: jest.fn(async () => true) };
    const service = new GatewayAccountsService(encryption as never, central as never, email as never);
    return { db, email, service, stored: () => (stored ? JSON.parse(stored) : null) };
  };

  it('records the application quietly, then emails owners and admins when it is approved or paused', async () => {
    const { db, email, service, stored } = setup();
    await service.sync(db as never, { id: 'acc_1', status: 'pending_review' }, 't1');
    expect(email.sendHtml).not.toHaveBeenCalled();

    await service.sync(db as never, { id: 'acc_1', status: 'active', fee: { type: 'percentage', value: 1 } }, 't1');
    expect(email.sendHtml).toHaveBeenCalledTimes(2);
    expect((email.sendHtml.mock.calls[0] as unknown[])[1]).toBe('The payment gateway is on for Acme');
    expect((email.sendHtml.mock.calls[0] as unknown[])[2]).toContain('1% per payment');
    expect(stored()).toMatchObject({ accountId: 'acc_1', status: 'active', statusChangedAt: expect.any(String) });

    // The same status again is not news.
    await service.sync(db as never, { id: 'acc_1', status: 'active' }, 't1');
    expect(email.sendHtml).toHaveBeenCalledTimes(2);

    await service.sync(db as never, { id: 'acc_1', status: 'suspended', reason: 'Chargebacks <b>high</b>' }, 't1');
    expect((email.sendHtml.mock.calls[2] as unknown[])[1]).toBe('The payment gateway for Acme is paused');
    expect((email.sendHtml.mock.calls[2] as unknown[])[2]).toContain('Chargebacks &lt;b&gt;high&lt;/b&gt;');
    expect(stored().reason).toBe('Chargebacks <b>high</b>');
  });
});

describe('GatewayAccountsService in the sandbox', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('sets the sandbox account up from the approved live one instead of asking for an application', async () => {
    process.env.SANDBOX_MODE = 'true';
    process.env.GATEWAY_URL = 'https://gateway.example.com';
    process.env.GATEWAY_API_KEY = 'inst_sandbox';
    process.env.GATEWAY_WEBHOOK_SECRET = 'whsec';
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/v1/accounts/mirror')
        ? ({ ok: true, status: 200, json: async () => ({ id: 'acc_sbx', status: 'active', businessName: 'Acme', country: 'UG', currency: 'UGX', methods: ['card'] }) } as Response)
        : ({ ok: false, status: 404, json: async () => ({}) } as Response),
    );
    let stored: string | null = null;
    const db = {
      paymentProvider: {
        findUnique: jest.fn(async () => (stored ? { credentials: stored } : null)),
        upsert: jest.fn(async (args: any) => {
          stored = args.create.credentials;
          return {};
        }),
      },
    };
    const email = { sendHtml: jest.fn() };
    const service = new GatewayAccountsService({ encrypt: (v: string) => v, decrypt: (v: string) => v } as never, {} as never, email as never);

    const result = await service.status(db as never, 'ten_1');
    expect(result).toEqual({ available: true, account: expect.objectContaining({ id: 'acc_sbx', status: 'active' }) });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example.com/v1/accounts/mirror');
    expect(JSON.parse(String(init.body))).toMatchObject({ externalId: 'ten_1', notificationUrl: expect.stringContaining('/webhooks/gateway/ten_1/callback') });
    expect(JSON.parse(stored!)).toMatchObject({ accountId: 'acc_sbx', status: 'active' });
    expect(email.sendHtml).not.toHaveBeenCalled();
  });

  it('reads the earlier names of the settings until a deployment has moved', () => {
    delete process.env.GATEWAY_URL;
    delete process.env.GATEWAY_API_KEY;
    process.env.MANAGED_PAYMENTS_URL = 'https://gateway.example.com/';
    process.env.MANAGED_PAYMENTS_API_KEY = 'inst_key';
    try {
      expect(gatewayConfig()).toEqual({ baseUrl: 'https://gateway.example.com', apiKey: 'inst_key', webhookSecret: undefined });
      process.env.GATEWAY_URL = 'https://new.example.com';
      expect(gatewayConfig()?.baseUrl).toBe('https://new.example.com');
    } finally {
      delete process.env.GATEWAY_URL;
      delete process.env.MANAGED_PAYMENTS_URL;
      delete process.env.MANAGED_PAYMENTS_API_KEY;
    }
  });

  describe('an account opened on the gateway\'s own page', () => {
    const notify = async (known: string | null, account: Record<string, unknown>) => {
      process.env.GATEWAY_URL = 'https://gateway.example.com';
      process.env.GATEWAY_API_KEY = 'inst_key';
      process.env.GATEWAY_WEBHOOK_SECRET = 'whsec';
      const raw = JSON.stringify({ event: 'account.updated', account });
      const t = Math.floor(Date.now() / 1000);
      const signature = `t=${t},v1=${createHmac('sha256', 'whsec').update(`${t}.${raw}`).digest('hex')}`;
      const controller = Object.create(WebhooksController.prototype);
      const sync = jest.fn();
      Object.assign(controller, { gateway: { accountId: async () => known, sync }, tenantDbService: { getTenantClient: async () => ({}) } });
      try {
        const result = await controller.gatewayPayments('org_1', { rawBody: Buffer.from(raw) }, JSON.parse(raw), signature);
        return { result, sync };
      } finally {
        delete process.env.GATEWAY_URL;
        delete process.env.GATEWAY_API_KEY;
        delete process.env.GATEWAY_WEBHOOK_SECRET;
      }
    };

    it('stores the account when it names this organisation', async () => {
      const { result, sync } = await notify(null, { id: 'acc_1', status: 'pending_review', externalId: 'org_1' });
      expect(result).toEqual({ status: 'ok' });
      expect(sync).toHaveBeenCalled();
    });

    it('ignores an account for another organisation, or one that does not match the stored id', async () => {
      expect((await notify(null, { id: 'acc_1', status: 'active', externalId: 'org_2' })).sync).not.toHaveBeenCalled();
      expect((await notify('acc_9', { id: 'acc_1', status: 'active', externalId: 'org_1' })).sync).not.toHaveBeenCalled();
    });
  });

  it('keeps answering at the earlier notification address, which open payments still hold', () => {
    expect(Reflect.getMetadata('path', WebhooksController.prototype.gatewayPayments)).toEqual(['gateway/:tenantId/callback', 'managed/:tenantId/callback']);
  });
});
