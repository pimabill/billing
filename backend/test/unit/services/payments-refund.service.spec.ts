import { Prisma } from '../../../src/generated/prisma-tenant/client';
import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from '../../../src/modules/payments/payments.service';
import { ProviderFactory } from '../../../src/providers/provider.factory';
import { createMockQueue } from '../../helpers/mock-queue';

describe('PaymentsService.refund', () => {
  const refund = jest.fn();
  const central = { client: { tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'T' }) } } };
  const service = new PaymentsService(
    central as never,
    { decrypt: () => '{"secretKey":"x"}' } as never,
    createMockQueue() as never,
    createMockQueue() as never,
  );

  const payment = (overrides: Record<string, unknown> = {}) => ({
    id: 'pay_1',
    invoiceId: 'inv_1',
    provider: 'paystack',
    providerTransactionId: 'tx_1',
    amount: { toString: () => '100' },
    currency: 'NGN',
    status: 'SUCCEEDED',
    metadata: null,
    invoice: { customer: { email: 'c@example.com', name: 'C' } },
    ...overrides,
  });

  const db = (p: ReturnType<typeof payment>, providerConfig: unknown = { providerName: 'paystack', credentials: 'enc' }, amountPaid = 100) => {
    const d: any = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({ ...p, amount: 100 }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(p),
      },
      invoice: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ amountPaid: new Prisma.Decimal(amountPaid) }),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentProvider: { findFirst: jest.fn().mockResolvedValue(providerConfig) },
    };
    d.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(d));
    return d;
  };

  beforeEach(() => {
    refund.mockReset();
    jest.spyOn(ProviderFactory, 'create').mockReturnValue({ refund } as never);
  });

  it('sends the refund to the provider before marking the payment refunded', async () => {
    refund.mockResolvedValue({ success: true, refundId: 're_1' });
    const d = db(payment());
    await service.refund(d as never, 't1', 'pay_1', { amount: 40 });

    expect(refund).toHaveBeenCalledWith({ transactionId: 'tx_1', amount: 40, currency: 'NGN' });
    expect(d.payment.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'REFUNDED',
      metadata: { refundAmount: 40, refundMode: 'provider', providerRefundId: 're_1' },
    });
  });

  it('leaves the payment untouched when the provider refuses', async () => {
    refund.mockResolvedValue({ success: false, error: 'insufficient balance' });
    const d = db(payment());
    await expect(service.refund(d as never, 't1', 'pay_1', {})).rejects.toThrow(/refused the refund: insufficient balance/);
    expect(d.payment.updateMany).not.toHaveBeenCalled();
  });

  it('only records refunds for manual payments or when asked to', async () => {
    const manual = db(payment({ provider: 'manual' }));
    await service.refund(manual as never, 't1', 'pay_1', {});
    const recorded = db(payment());
    await service.refund(recorded as never, 't1', 'pay_1', { recordOnly: true });

    expect(refund).not.toHaveBeenCalled();
    expect(manual.payment.updateMany.mock.calls[0][0].data.metadata.refundMode).toBe('recorded');
    expect(recorded.payment.updateMany.mock.calls[0][0].data.metadata.refundMode).toBe('recorded');
  });

  it('takes the refund off what was paid on the invoice', async () => {
    refund.mockResolvedValue({ success: true, refundId: 're_2' });
    const d = db(payment(), undefined, 300);
    await service.refund(d as never, 't1', 'pay_1', { amount: 40 });
    expect(d.invoice.update).toHaveBeenCalledWith({ where: { id: 'inv_1' }, data: { amountPaid: new Prisma.Decimal(260) } });
  });

  it('leaves the invoice alone when the payment never counted toward it', async () => {
    const d = db(payment({ provider: 'manual', metadata: { unapplied: true } }));
    await service.refund(d as never, 't1', 'pay_1', {});
    expect(d.invoice.update).not.toHaveBeenCalled();
  });

  it('refunds a payment only once', async () => {
    const d = db(payment({ provider: 'manual' }));
    d.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.refund(d as never, 't1', 'pay_1', {})).rejects.toThrow(/refunded meanwhile/);
    expect(d.invoice.update).not.toHaveBeenCalled();
  });

  it('explains how to proceed when the provider is no longer configured', async () => {
    const d = db(payment(), null);
    await expect(service.refund(d as never, 't1', 'pay_1', {})).rejects.toThrow(BadRequestException);
    await expect(service.refund(d as never, 't1', 'pay_1', {})).rejects.toThrow(/recordOnly: true/);
  });
});
