import { Prisma } from '../../../src/generated/prisma-tenant/client';
import { RecurringChargeService } from '../../../src/modules/billing/recurring-charge.service';
import { createMockPrisma } from '../../helpers/mock-prisma';
import { createMockQueue } from '../../helpers/mock-queue';
import { makeInvoice } from '../../helpers/fixtures';

jest.mock('../../../src/providers/provider.factory', () => ({ ProviderFactory: { create: jest.fn() } }));
import { ProviderFactory } from '../../../src/providers/provider.factory';

describe('RecurringChargeService', () => {
  let service: RecurringChargeService;
  let db: ReturnType<typeof createMockPrisma>;
  let emailQueue: ReturnType<typeof createMockQueue>;
  let webhookQueue: ReturnType<typeof createMockQueue>;
  let charge: jest.Mock;

  const invoice = {
    ...makeInvoice({ id: 'inv_1', status: 'PENDING', amount: '49.00', subscriptionId: 'sub_1', customerId: 'cust_1' }),
    customer: { id: 'cust_1', name: 'Jane Doe', email: 'jane@example.com' },
  };

  beforeEach(() => {
    db = createMockPrisma();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
    emailQueue = createMockQueue();
    webhookQueue = createMockQueue();
    service = new RecurringChargeService(
      { client: { tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }) } } } as any,
      { decrypt: jest.fn().mockReturnValue('{}') } as any,
      emailQueue as any,
      webhookQueue as any,
    );
    charge = jest.fn();
    (ProviderFactory.create as jest.Mock).mockReturnValue({ chargePaymentMethod: charge });

    db.invoice.findUnique.mockResolvedValue(invoice);
    db.payment.findFirst.mockResolvedValue(null);
    db.paymentMethod.findUnique.mockResolvedValue({ id: 'pm_1', customerId: 'cust_1', provider: 'stripe', tokenId: 'tok_1' });
    db.paymentProvider.findFirst.mockResolvedValue({ providerName: 'stripe', credentials: 'enc' });
    db.payment.create.mockResolvedValue({ id: 'pay_new' });
    db.payment.updateMany.mockResolvedValue({ count: 1 });
    db.payment.update.mockResolvedValue({});
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    db.invoice.findUniqueOrThrow.mockResolvedValue({ amount: new Prisma.Decimal('49.00'), amountPaid: new Prisma.Decimal('49.00') });
    db.subscription.updateMany.mockResolvedValue({ count: 1 });
    db.paymentRetry.updateMany.mockResolvedValue({ count: 0 });
  });

  it('charges with a fresh per-attempt reference and marks the invoice paid only from an unpaid state', async () => {
    charge.mockResolvedValue({ success: true, transactionId: 'pi_1' });

    const outcome = await service.chargeInvoice(db as any, 't1', 'inv_1', 'pm_1', 'auto');

    expect(outcome).toEqual({ result: 'succeeded', paymentId: 'pay_new' });
    expect(charge.mock.calls[0][0].reference).toBe('pay_new');
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv_1', status: { in: ['DRAFT', 'PENDING', 'FAILED'] } },
      data: expect.objectContaining({ status: 'PAID' }),
    });
    expect(db.subscription.updateMany).toHaveBeenCalledWith({ where: { id: 'sub_1', status: 'PAST_DUE' }, data: { status: 'ACTIVE' } });
    expect(webhookQueue.add).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: 'payment.succeeded' }));
  });

  it('does not charge an invoice that is already paid or voided', async () => {
    db.invoice.findUnique.mockResolvedValue({ ...invoice, status: 'PAID' });
    expect(await service.chargeInvoice(db as any, 't1', 'inv_1', 'pm_1', 'dunning')).toMatchObject({ result: 'skipped', invoiceStatus: 'PAID' });

    db.invoice.findUnique.mockResolvedValue({ ...invoice, status: 'CANCELED' });
    expect(await service.chargeInvoice(db as any, 't1', 'inv_1', 'pm_1', 'dunning')).toMatchObject({ result: 'skipped', invoiceStatus: 'CANCELED' });
    expect(charge).not.toHaveBeenCalled();
  });

  it('does not charge again while an earlier attempt is unresolved', async () => {
    db.payment.findFirst.mockResolvedValue({ id: 'pay_old' });
    expect(await service.chargeInvoice(db as any, 't1', 'inv_1', 'pm_1', 'dunning')).toMatchObject({ result: 'skipped' });
    expect(charge).not.toHaveBeenCalled();
  });

  it("refuses another customer's card", async () => {
    db.paymentMethod.findUnique.mockResolvedValue({ id: 'pm_x', customerId: 'someone_else', provider: 'stripe', tokenId: 'tok' });
    expect(await service.chargeInvoice(db as any, 't1', 'inv_1', 'pm_x', 'auto')).toMatchObject({ result: 'skipped' });
    expect(charge).not.toHaveBeenCalled();
  });

  it('leaves an ambiguous charge pending instead of failing it (no retry, no double charge)', async () => {
    charge.mockResolvedValue({ success: false, ambiguous: true, error: 'timeout' });

    const outcome = await service.chargeInvoice(db as any, 't1', 'inv_1', 'pm_1', 'auto');

    expect(outcome).toEqual({ result: 'pending', paymentId: 'pay_new' });
    expect(db.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ status: 'FAILED' }) }),
    );
    expect(webhookQueue.add).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: 'payment.pending' }));
  });

  it('records a definite decline as failed', async () => {
    charge.mockResolvedValue({ success: false, error: 'card_declined' });
    expect(await service.chargeInvoice(db as any, 't1', 'inv_1', 'pm_1', 'auto')).toEqual({ result: 'failed', paymentId: 'pay_new', error: 'card_declined' });
    expect(db.payment.update).toHaveBeenCalledWith({ where: { id: 'pay_new' }, data: { status: 'FAILED', failureReason: 'card_declined' } });
  });

  it('flags a charge that lands after the invoice was paid another way', async () => {
    charge.mockResolvedValue({ success: true, transactionId: 'pi_2' });
    db.invoice.updateMany.mockResolvedValue({ count: 0 });

    await service.chargeInvoice(db as any, 't1', 'inv_1', 'pm_1', 'auto');

    expect(webhookQueue.add).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: 'payment.duplicate' }));
    expect(db.subscription.updateMany).not.toHaveBeenCalled();
  });
});
