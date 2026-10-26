import { Prisma } from '../../generated/prisma-tenant/client';

type DecimalValue = Prisma.Decimal | number | string;

const PAYABLE = ['DRAFT', 'PENDING', 'FAILED'] as const;

export interface AppliedPayment {
  /** The invoice was open and took the payment. */
  applied: boolean;
  /** The payment completed it: the invoice is now PAID. */
  paid: boolean;
  amountPaid: Prisma.Decimal;
  amount: Prisma.Decimal;
}

/**
 * Apply a successful payment to an invoice, inside the caller's transaction:
 * what was paid goes up by the payment, and the invoice becomes PAID once the
 * payments add up to its amount. A deposit or an instalment leaves it open.
 * Only an open invoice takes a payment, so a redelivered or late payment is
 * not counted twice. Such a payment, given by `paymentId`, is marked
 * `unapplied`, so refunding it later leaves the invoice alone.
 */
export async function applyPayment(tx: Prisma.TransactionClient, invoiceId: string, amount: DecimalValue, paidAt = new Date(), paymentId?: string): Promise<AppliedPayment> {
  const moved = await tx.invoice.updateMany({
    where: { id: invoiceId, status: { in: [...PAYABLE] } },
    data: { amountPaid: { increment: amount } },
  });
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { amount: true, amountPaid: true } });
  if (moved.count === 0) {
    if (paymentId) await markUnapplied(tx, paymentId);
    return { applied: false, paid: false, amountPaid: invoice.amountPaid, amount: invoice.amount };
  }
  if (invoice.amountPaid.lt(invoice.amount)) return { applied: true, paid: false, amountPaid: invoice.amountPaid, amount: invoice.amount };
  const done = await tx.invoice.updateMany({ where: { id: invoiceId, status: { in: [...PAYABLE] } }, data: { status: 'PAID', paidAt } });
  return { applied: true, paid: done.count > 0, amountPaid: invoice.amountPaid, amount: invoice.amount };
}

async function markUnapplied(tx: Prisma.TransactionClient, paymentId: string) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { metadata: true } });
  const metadata = (payment?.metadata ?? {}) as Prisma.JsonObject;
  await tx.payment.update({ where: { id: paymentId }, data: { metadata: { ...metadata, unapplied: true } } });
}

/** A payment that never counted toward its invoice (it arrived after the invoice was paid or voided). */
export const isUnapplied = (payment: { metadata?: unknown }) => (payment.metadata as { unapplied?: boolean } | null)?.unapplied === true;

/**
 * Take a refund back off what was paid on an invoice, inside the caller's
 * transaction. A paid invoice stays paid (the refund is recorded on the
 * payment); an open one is due that much more again.
 */
export async function unapplyRefund(tx: Prisma.TransactionClient, invoiceId: string, amount: DecimalValue) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { amountPaid: true } });
  const amountPaid = Prisma.Decimal.max(0, invoice.amountPaid.sub(amount));
  await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid } });
  return amountPaid;
}

/** What is left to pay on an invoice. */
export const amountDue = (invoice: { amount: DecimalValue; amountPaid?: DecimalValue | null; status?: string }) =>
  invoice.status === 'PAID' ? new Prisma.Decimal(0) : Prisma.Decimal.max(0, new Prisma.Decimal(invoice.amount).sub(invoice.amountPaid ?? 0));
