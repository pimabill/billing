import { createHmac } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OpenManagedAccountDto } from '../../../src/modules/money/dto/money.dto';
import { ManagedAdapter, ManagedPaymentsClient } from '../../../src/modules/money/adapters/managed.adapter';
import { ManagedAccountsService } from '../../../src/modules/money/managed.service';

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
const config = { baseUrl: 'https://managed.example.com', apiKey: 'inst_key', webhookSecret: 'whsec' };

describe('ManagedAdapter', () => {
  it('creates a checkout on the tenant account, keyed by our reference', async () => {
    const fetch = jest.fn(() => json({ reference: 'col_1', status: 'pending', amount: '50000', currency: 'UGX', checkoutUrl: 'https://checkout.flutterwave.com/x' }));
    const out = await new ManagedAdapter({ accountId: 'acc_9' }, config, fetch as never).collect({
      reference: 'col_1',
      amount: '50000',
      currency: 'UGX',
      payer: { type: 'hosted', email: 'payer@example.com', name: 'Jane' },
      description: 'Order 1',
      callbackUrl: 'https://shop.example.com/done',
      notificationUrl: 'https://api.example.com/webhooks/managed/t1/callback',
    });
    const [url, init] = (fetch.mock.calls[0] as unknown) as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://managed.example.com/v1/collections');
    expect(headers.Authorization).toBe('Bearer inst_key');
    expect(headers['Idempotency-Key']).toBe('col_1');
    expect(JSON.parse(String(init.body))).toMatchObject({ account: 'acc_9', reference: 'col_1', amount: '50000', currency: 'UGX', customer: { email: 'payer@example.com' } });
    expect(out).toEqual({ state: 'pending', paymentUrl: 'https://checkout.flutterwave.com/x', providerStatus: 'CHECKOUT_CREATED' });
  });

  it('sends mobile money as a phone prompt, with no checkout page', async () => {
    const fetch = jest.fn(() => json({ reference: 'col_2', status: 'pending', method: 'mobile_money', amount: '50000', currency: 'UGX' }));
    const out = await new ManagedAdapter({ accountId: 'acc_9' }, config, fetch as never).collect({
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
    const out = await new ManagedAdapter({ accountId: 'acc_9' }, config, fetch as never).collect({
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
    expect(await new ManagedAdapter({ accountId: 'a' }, config, refused as never).collect({ reference: 'c', amount: '1', currency: 'UGX', payer, description: 'x' })).toEqual({
      state: 'failed',
      failureReason: 'Account is pending review',
    });
    const down = jest.fn(() => Promise.reject(new TypeError('fetch failed')));
    expect(await new ManagedAdapter({ accountId: 'a' }, config, down as never).collect({ reference: 'c', amount: '1', currency: 'UGX', payer, description: 'x' })).toMatchObject({
      state: 'failed',
      failureReason: expect.stringMatching(/Could not reach managed payments/),
    });
  });

  it('takes the status, fees and processor reference from the service, holding amount mismatches', async () => {
    const check = (body: unknown, status = 200) => new ManagedAdapter({ accountId: 'acc_9' }, config, jest.fn(() => json(body, status)) as never).getCollection('col_1', null, '50000');
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

describe('ManagedPaymentsClient.updateAccount', () => {
  it('sends only the changed details to the account', async () => {
    const fetch = jest.fn(() => json({ id: 'acc_9', status: 'active', businessName: 'Rapcio', country: 'UG', currency: 'UGX', phone: '+256762746464', payoutDestination: 'Mobile money ****6464' }));
    const r = await new ManagedPaymentsClient(config, fetch as never).updateAccount('acc_9', {
      phone: '+256762746464',
      payoutDestination: { type: 'mobile_money', msisdn: '256762746464', name: 'Rapcio Ltd' },
    });
    const [url, init] = (fetch.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe('https://managed.example.com/v1/accounts/acc_9');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ phone: '+256762746464', payoutDestination: { type: 'mobile_money', msisdn: '256762746464', name: 'Rapcio Ltd' } });
    expect(r.data).toMatchObject({ payoutDestination: 'Mobile money ****6464' });
  });
});

describe('managed notification signatures', () => {
  const client = new ManagedPaymentsClient(config);
  const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', 'whsec').update(`${t}.${body}`).digest('hex')}`;

  it('accepts fresh signatures over the exact body only', () => {
    const body = '{"event":"collection.succeeded","collection":{"reference":"col_1"}}';
    expect(client.verifySignature(body, sign(body))).toBe(true);
    expect(client.verifySignature(body.replace('col_1', 'col_2'), sign(body))).toBe(false);
    expect(client.verifySignature(body, sign(body, Math.floor(Date.now() / 1000) - 3600))).toBe(false);
    expect(client.verifySignature(body, undefined)).toBe(false);
    expect(new ManagedPaymentsClient({ ...config, webhookSecret: undefined }).verifySignature(body, sign(body))).toBe(false);
  });
});

describe('ManagedAccountsService', () => {
  const encryption = { encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v.slice(4) };
  const service = new ManagedAccountsService(encryption as never);

  it('keeps the managed connection active only while the account is, at the lowest priority', async () => {
    const upsert = jest.fn();
    const db = { paymentProvider: { upsert } };
    await service.sync(db as never, { id: 'acc_9', status: 'pending_review' });
    expect(upsert).toHaveBeenCalledWith({
      where: { providerName: 'managed' },
      create: { providerName: 'managed', credentials: 'enc:{"accountId":"acc_9"}', isActive: false, priority: 1000 },
      update: { credentials: 'enc:{"accountId":"acc_9"}', isActive: false },
    });
    await service.sync(db as never, { id: 'acc_9', status: 'active' });
    expect(upsert.mock.calls[1][0].update.isActive).toBe(true);
  });

  it('reports managed payments as unavailable without a subscription', async () => {
    delete process.env.MANAGED_PAYMENTS_URL;
    expect(await service.status({} as never)).toEqual({ available: false, account: null });
  });
});

describe('OpenManagedAccountDto', () => {
  const base = { businessName: 'Rapcio Ltd', email: 'finance@rapcio.com', phone: '+256700000001', country: 'UG', currency: 'UGX' };
  const errors = (body: Record<string, unknown>) => validateSync(plainToInstance(OpenManagedAccountDto, { ...base, ...body })).map((e) => e.property);

  it('takes bank details, a payout destination, or both', () => {
    expect(errors({ bank: { code: '031', accountNumber: '9030012345678' } })).toEqual([]);
    expect(errors({ payoutDestination: { type: 'mobile_money', msisdn: '256771234567' } })).toEqual([]);
    expect(errors({ payoutDestination: { type: 'paypal', email: 'pay@rapcio.com' } })).toEqual([]);
    expect(errors({})).toEqual(['bank']);
  });

  it('requires the fields each destination type pays out to', () => {
    expect(errors({ payoutDestination: { type: 'mobile_money' } })).toEqual(['payoutDestination']);
    expect(errors({ payoutDestination: { type: 'paypal', email: 'not-an-email' } })).toEqual(['payoutDestination']);
    expect(errors({ payoutDestination: { type: 'bank', bankCode: '031', accountNumber: '9030012345678' } })).toEqual(['payoutDestination']);
    expect(errors({ payoutDestination: { type: 'cheque' } })).toEqual(['payoutDestination']);
  });
});
