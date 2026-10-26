import { Prisma } from '../../../src/generated/prisma-tenant/client';
import { WebhooksController } from '../../../src/modules/webhooks/webhooks.controller';
import { ProviderFactory } from '../../../src/providers/provider.factory';
import { createMockPrisma } from '../../helpers/mock-prisma';
import { createMockQueue } from '../../helpers/mock-queue';

describe('WebhooksController (payment notifications)', () => {
  let db: ReturnType<typeof createMockPrisma>;
  let handleWebhook: jest.Mock;
  let controller: WebhooksController;
  let money: { handleCheckoutNotification: jest.Mock };
  let queues: ReturnType<typeof createMockQueue>[];

  beforeEach(() => {
    db = createMockPrisma();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
    db.paymentProvider.findFirst.mockResolvedValue({ id: 'pp', providerName: 'stripe', credentials: 'enc' });
    handleWebhook = jest.fn();
    jest.spyOn(ProviderFactory, 'create').mockReturnValue({ handleWebhook } as never);
    money = { handleCheckoutNotification: jest.fn().mockResolvedValue(false) };
    queues = [createMockQueue(), createMockQueue()];
    controller = new WebhooksController(
      {
        client: {
          tenant: { findMany: jest.fn().mockResolvedValue([{ id: 't1', name: 'Acme' }]), findUnique: jest.fn().mockResolvedValue({ id: 't1', name: 'Acme' }) },
          webhookLog: { create: jest.fn().mockResolvedValue({}) },
        },
      } as never,
      { getTenantClient: jest.fn().mockResolvedValue(db) } as never,
      { decrypt: () => '{}' } as never,
      queues[0] as never,
      queues[1] as never,
      money as never,
      {} as never,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  const req = (headers: Record<string, string> = {}) => ({ headers, rawBody: Buffer.from('{}') }) as never;

  it('changes nothing when no tenant verifies the notification (a forged event)', async () => {
    handleWebhook.mockRejectedValue(new Error('Unsigned Stripe webhook'));
    await expect(controller.stripe(req(), { type: 'checkout.session.completed' })).resolves.toEqual({ received: true });
    expect(db.payment.findFirst).not.toHaveBeenCalled();
    expect(db.payment.updateMany).not.toHaveBeenCalled();
    expect(money.handleCheckoutNotification).not.toHaveBeenCalled();
  });

  it('answers with an error, so the provider redelivers, when a verified notification cannot be processed', async () => {
    handleWebhook.mockResolvedValue({ status: 'succeeded', transactionId: 'cs_1', amount: 49, currency: 'USD' });
    db.payment.findFirst.mockRejectedValue(new Error('connection reset'));
    await expect(controller.stripe(req({ 'stripe-signature': 't=1,v1=x' }), {})).rejects.toThrow('Could not process stripe webhook');
  });

  it('settles an invoice paid through managed payments once the service confirms it', async () => {
    db.payment.findFirst.mockResolvedValue({ id: 'pay_m', provider: 'managed', status: 'PROCESSING', amount: '110000', currency: 'UGX', invoiceId: 'inv_m', invoice: { id: 'inv_m', invoiceNumber: 'INV-1', customer: null } });
    db.paymentProvider.findUnique.mockResolvedValue({ providerName: 'managed', credentials: 'enc' });
    db.providerEvent.create.mockResolvedValue({});
    db.payment.updateMany.mockResolvedValue({ count: 1 });
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    db.invoice.findUniqueOrThrow.mockResolvedValue({ amount: new Prisma.Decimal(100), amountPaid: new Prisma.Decimal(100) });
    const getPaymentStatus = jest.fn().mockResolvedValue({ status: 'succeeded', transactionId: 'pay_m', amount: 110000, currency: 'UGX', reference: 'pay_m' });
    jest.spyOn(ProviderFactory, 'create').mockReturnValue({ getPaymentStatus } as never);

    expect(await controller.settleManagedPayment(db as never, 't1', 'pay_m')).toBe(true);
    expect(getPaymentStatus).toHaveBeenCalledWith('pay_m');
    expect(db.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'inv_m' }), data: expect.objectContaining({ status: 'PAID' }) }));
  });

  it('counts an instalment and keeps the invoice open until it is covered', async () => {
    db.payment.findFirst.mockResolvedValue({ id: 'pay_d', provider: 'managed', status: 'PROCESSING', amount: '100000', currency: 'UGX', invoiceId: 'inv_d', invoice: { id: 'inv_d', invoiceNumber: 'INV-2', customer: null } });
    db.paymentProvider.findUnique.mockResolvedValue({ providerName: 'managed', credentials: 'enc' });
    db.providerEvent.create.mockResolvedValue({});
    db.payment.updateMany.mockResolvedValue({ count: 1 });
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    db.invoice.findUniqueOrThrow.mockResolvedValue({ amount: new Prisma.Decimal(300000), amountPaid: new Prisma.Decimal(100000) });
    jest.spyOn(ProviderFactory, 'create').mockReturnValue({ getPaymentStatus: jest.fn().mockResolvedValue({ status: 'succeeded', transactionId: 'pay_d', amount: 100000, currency: 'UGX', reference: 'pay_d' }) } as never);

    expect(await controller.settleManagedPayment(db as never, 't1', 'pay_d')).toBe(true);
    expect(db.invoice.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }));
    const events = queues.flatMap((q) => q.add.mock.calls.map((c: unknown[]) => (c[1] as { event?: string }).event));
    expect(events).toContain('invoice.partially_paid');
    expect(events).not.toContain('invoice.paid');
  });

  it('leaves a managed invoice payment open while the service still reports it pending', async () => {
    db.payment.findFirst.mockResolvedValue({ id: 'pay_p', provider: 'managed', status: 'PROCESSING', amount: '29', currency: 'USD', invoiceId: 'inv_p' });
    db.paymentProvider.findUnique.mockResolvedValue({ providerName: 'managed', credentials: 'enc' });
    jest.spyOn(ProviderFactory, 'create').mockReturnValue({ getPaymentStatus: jest.fn().mockResolvedValue({ status: 'pending', transactionId: 'pay_p', amount: 0, currency: '' }) } as never);
    expect(await controller.settleManagedPayment(db as never, 't1', 'pay_p')).toBe(true);
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('keeps looking when the first tenant sharing the provider account does not own the payment', async () => {
    const dbA = createMockPrisma();
    const dbB = createMockPrisma();
    for (const d of [dbA, dbB]) {
      d.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(d));
      d.paymentProvider.findFirst.mockResolvedValue({ id: 'pp', providerName: 'flutterwave', credentials: 'enc' });
      d.providerEvent.create.mockResolvedValue({});
    }
    dbA.payment.findFirst.mockResolvedValue(null);
    dbB.payment.findFirst.mockResolvedValue({ id: 'pay_b', status: 'PROCESSING', amount: '49', currency: 'USD', invoiceId: 'inv_b', invoice: null });
    dbB.payment.updateMany.mockResolvedValue({ count: 1 });
    dbB.invoice.updateMany.mockResolvedValue({ count: 1 });
    dbB.invoice.findUniqueOrThrow.mockResolvedValue({ amount: new Prisma.Decimal(100), amountPaid: new Prisma.Decimal(100) });
    handleWebhook.mockResolvedValue({ status: 'succeeded', transactionId: 'tx_1', amount: 49, currency: 'USD' });
    const shared = new WebhooksController(
      {
        client: {
          tenant: { findMany: jest.fn().mockResolvedValue([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]) },
          webhookLog: { create: jest.fn().mockResolvedValue({}) },
        },
      } as never,
      { getTenantClient: jest.fn(async (id: string) => (id === 'a' ? dbA : dbB)) } as never,
      { decrypt: () => '{}' } as never,
      createMockQueue() as never,
      createMockQueue() as never,
      money as never,
      {} as never,
    );

    await shared.flutterwave(req({ 'verif-hash': 'h' }), { event: 'charge.completed' });

    expect(money.handleCheckoutNotification).toHaveBeenCalledTimes(1); // tenant A: not a collection either
    expect(dbB.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }));
  });

  it('passes the raw body to every provider on the shared URLs', async () => {
    handleWebhook.mockRejectedValue(new Error('nope'));
    await controller.paystack(req({ 'x-paystack-signature': 'sig' }), { event: 'charge.success' });
    expect(handleWebhook).toHaveBeenCalledWith({ event: 'charge.success' }, 'sig', '{}');
  });
});
