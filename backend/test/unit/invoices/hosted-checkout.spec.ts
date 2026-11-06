import { signCheckoutToken, signPortalToken, verifyCheckoutToken, verifyPortalToken } from '../../../src/common/auth/tokens';
import { providerTakes } from '../../../src/providers/base-payment.provider';
import { InvoicesService } from '../../../src/modules/invoices/invoices.service';
import { HostedCheckoutService } from '../../../src/modules/portal/hosted-checkout.service';
import { PortalService } from '../../../src/modules/portal/portal.service';

const SECRET = 'z'.repeat(48);

describe('checkout tokens', () => {
  it('carries the invoice, and works for nothing else', () => {
    const token = signCheckoutToken(SECRET, 'ten_1', 'inv_1', 60, { ret: 'https://shop.example/done' });
    expect(verifyCheckoutToken(token, SECRET)).toMatchObject({ sub: 'ten_1', inv: 'inv_1', ret: 'https://shop.example/done' });
    expect(verifyPortalToken(token, SECRET)).toBeNull();
    expect(verifyCheckoutToken(signPortalToken(SECRET, 'ten_1', 'cus_1', 60), SECRET)).toBeNull();
  });

  it('refuses an expired link', () => {
    expect(verifyCheckoutToken(signCheckoutToken(SECRET, 'ten_1', 'inv_1', -1), SECRET)).toBeNull();
  });
});

describe('what a provider takes', () => {
  it('matches the method and the currency', () => {
    expect(providerTakes('flutterwave', 'mobile_money', 'UGX')).toBe(true);
    expect(providerTakes('flutterwave', 'mobile_money', 'USD')).toBe(false);
    expect(providerTakes('paystack', 'mobile_money', 'UGX')).toBe(false);
    expect(providerTakes('paystack', 'mobile_money', 'GHS')).toBe(true);
    expect(providerTakes('stripe', 'mobile_money', 'UGX')).toBe(false);
    expect(providerTakes('stripe', 'card', 'UGX')).toBe(true);
    expect(providerTakes('paypal', 'paypal', 'USD')).toBe(true);
    expect(providerTakes('paypal', 'paypal', 'UGX')).toBe(false);
  });
});

describe('PortalService.checkoutMethods', () => {
  const encryption = { decrypt: (value: string) => value };
  const methods = (providers: { providerName: string; credentials?: string }[], account: unknown, currency: string) => {
    const managed = { status: jest.fn(async () => ({ account })) };
    const service = new PortalService({} as never, managed as never, encryption as never);
    const db = { paymentProvider: { findMany: async () => providers.map((p) => ({ credentials: '{}', ...p })) } };
    return service.checkoutMethods(db as never, 'ten_1', currency);
  };

  it('offers what the managed account takes, in that currency', async () => {
    const account = { status: 'active', methods: ['card', 'mobile_money', 'paypal'] };
    expect(await methods([{ providerName: 'managed' }], account, 'UGX')).toEqual(['card', 'mobile_money']);
    expect(await methods([{ providerName: 'managed' }], account, 'USD')).toEqual(['card', 'paypal']);
  });

  it('offers nothing through a managed account that is not active', async () => {
    expect(await methods([{ providerName: 'managed' }], { status: 'suspended', methods: ['card'] }, 'UGX')).toEqual([]);
  });

  it("adds the organisation's own providers and skips test credentials", async () => {
    expect(await methods([{ providerName: 'flutterwave' }, { providerName: 'paypal' }], null, 'USD')).toEqual(['card', 'paypal']);
    expect(await methods([{ providerName: 'stripe', credentials: '{"environment":"test"}' }], null, 'USD')).toEqual([]);
  });
});

describe('InvoicesService.createCheckout with a chosen method', () => {
  const invoice = { id: 'inv_1', invoiceNumber: 'INV-1', amount: '50000', amountPaid: '0', currency: 'UGX', status: 'PENDING', customer: { email: 'a@b.c', name: 'A' } };

  it('offers only the providers that take it', async () => {
    const service = new InvoicesService({ decrypt: () => '{}' } as never, {} as never, {} as never, {} as never, {} as never);
    const findMany = jest.fn(async () => []);
    const db = { invoice: { findUnique: async () => invoice }, paymentProvider: { findMany } };
    await expect(service.createCheckout(db as never, 'inv_1', undefined, undefined, 'ten_1', undefined, 'mobile_money')).rejects.toThrow('No active payment provider takes mobile money in UGX');
    const names = (findMany.mock.calls[0] as unknown as [{ where: { providerName: { in: string[] } } }])[0].where.providerName.in;
    expect(names).toEqual(expect.arrayContaining(['flutterwave', 'managed']));
    expect(names).not.toContain('stripe');
  });
});

describe('HostedCheckoutService', () => {
  const saved = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.JWT_SECRET = saved;
  });

  function setup(invoice: Record<string, unknown>, tenant: Record<string, unknown> = {}) {
    const row = { id: 'inv_1', invoiceNumber: 'INV-1', amount: '50000', amountPaid: '0', currency: 'UGX', status: 'PENDING', dueDate: new Date(), metadata: { items: [{ description: 'Fibre', quantity: 1, unitAmount: 50000, secret: 'x' }] }, customer: { name: 'Amina' }, ...invoice };
    const central = { client: { tenant: { findUnique: async () => ({ id: 'ten_1', name: 'Shop', isActive: true, ...tenant }) } } };
    const db = { invoice: { findUnique: async () => row } };
    const invoices = { createCheckout: jest.fn(async () => ({ checkoutUrl: 'https://pay.example/x' })) };
    const portal = { checkoutMethods: jest.fn(async () => ['card', 'mobile_money']) };
    return { invoices, service: new HostedCheckoutService(central as never, { getTenantClient: async () => db } as never, invoices as never, portal as never) };
  }
  const link = (extra = {}) => signCheckoutToken(SECRET, 'ten_1', 'inv_1', 60, extra);

  it('shows what is due and the ways to pay, and only the fields it means to', async () => {
    const view = await setup({}).service.view(link());
    expect(view.amount).toBe(50000);
    expect(view.methods).toEqual(['card', 'mobile_money']);
    expect(view.invoice.items).toEqual([{ description: 'Fibre', quantity: 1, unitAmount: 50000 }]);
  });

  it('refuses a bad link', async () => {
    await expect(setup({}).service.view('nonsense')).rejects.toThrow('expired');
  });

  it('asks for nothing once paid', async () => {
    const view = await setup({ status: 'PAID', amountPaid: '50000' }).service.view(link());
    expect(view.amount).toBe(0);
    expect(view.methods).toEqual([]);
  });

  it('treats a used part-payment link as settled, though the invoice is still open', async () => {
    const { service } = setup({ amountPaid: '20000' });
    expect((await service.view(link({ amt: 20000, paid: 0 }))).amount).toBe(0);
    await expect(service.pay(link({ amt: 20000, paid: 0 }), 'card')).rejects.toThrow('already been paid');
  });

  it('does not tell customers why an organisation was suspended', async () => {
    const { service } = setup({}, { accessMode: 'SUSPENDED', accessReason: 'Unpaid plan' });
    await expect(service.view(link())).rejects.toThrow('no longer available');
  });

  it('starts the chosen payment and brings the customer back to this page', async () => {
    const { service, invoices } = setup({});
    const token = link();
    expect(await service.pay(token, 'mobile_money')).toEqual({ checkoutUrl: 'https://pay.example/x' });
    expect(invoices.createCheckout).toHaveBeenCalledWith(expect.anything(), 'inv_1', expect.stringContaining(`/pay/${token}?returned=1`), undefined, 'ten_1', undefined, 'mobile_money');
  });

  it('refuses a method this payment does not offer', async () => {
    await expect(setup({}).service.pay(link(), 'paypal')).rejects.toThrow('not available');
  });
});
