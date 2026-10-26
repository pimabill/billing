import { Prisma } from '../../../src/generated/prisma-tenant/client';
import { amountDue, applyPayment } from '../../../src/modules/invoices/apply-payment';

/** An in-memory invoice behind the two calls applyPayment makes. */
function invoiceTx(start: { amount: string; amountPaid: string; status: string }) {
  const row = { amount: new Prisma.Decimal(start.amount), amountPaid: new Prisma.Decimal(start.amountPaid), status: start.status, paidAt: null as Date | null };
  const tx = {
    invoice: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!where.status.in.includes(row.status)) return { count: 0 };
        if (data.amountPaid) row.amountPaid = row.amountPaid.add(data.amountPaid.increment);
        if (data.status) Object.assign(row, { status: data.status, paidAt: data.paidAt });
        return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn(async () => ({ amount: row.amount, amountPaid: row.amountPaid })),
    },
  };
  return { tx: tx as never, row };
}

describe('applyPayment', () => {
  it('keeps the invoice open after a deposit', async () => {
    const { tx, row } = invoiceTx({ amount: '300000', amountPaid: '0', status: 'PENDING' });
    expect(await applyPayment(tx, 'inv_1', 100000)).toMatchObject({ applied: true, paid: false });
    expect(row.status).toBe('PENDING');
    expect(row.amountPaid.toString()).toBe('100000');
  });

  it('marks it paid once instalments cover it', async () => {
    const { tx, row } = invoiceTx({ amount: '300000', amountPaid: '0', status: 'PENDING' });
    await applyPayment(tx, 'inv_1', 100000);
    await applyPayment(tx, 'inv_1', 100000);
    expect(await applyPayment(tx, 'inv_1', 100000)).toMatchObject({ applied: true, paid: true });
    expect(row.status).toBe('PAID');
    expect(row.paidAt).toBeInstanceOf(Date);
  });

  it('pays in full in one go', async () => {
    const { tx, row } = invoiceTx({ amount: '49', amountPaid: '0', status: 'FAILED' });
    expect(await applyPayment(tx, 'inv_1', '49')).toMatchObject({ paid: true });
    expect(row.status).toBe('PAID');
  });

  it('does not count a payment on a paid or voided invoice', async () => {
    for (const status of ['PAID', 'CANCELED']) {
      const { tx, row } = invoiceTx({ amount: '49', amountPaid: '49', status });
      expect(await applyPayment(tx, 'inv_1', 49)).toMatchObject({ applied: false, paid: false });
      expect(row.amountPaid.toString()).toBe('49');
    }
  });
});

describe('amountDue', () => {
  it('is what is left, and nothing once paid', () => {
    expect(amountDue({ amount: '300000', amountPaid: '100000', status: 'PENDING' }).toString()).toBe('200000');
    expect(amountDue({ amount: '49', status: 'PENDING' }).toString()).toBe('49');
    expect(amountDue({ amount: '49', amountPaid: '0', status: 'PAID' }).toString()).toBe('0');
  });
});
