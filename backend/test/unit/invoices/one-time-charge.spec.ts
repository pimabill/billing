import { InvoicesController } from '../../../src/modules/invoices/invoices.controller';

describe('one-time charge', () => {
  const invoice = { id: 'inv_1', amount: '50000', currency: 'UGX', status: 'DRAFT' };
  const link = { checkoutUrl: 'https://pay.example/x', paymentId: 'pay_1', provider: 'flutterwave', expiresAt: '2026-11-01' };
  const service = { create: jest.fn(async () => invoice), createCheckout: jest.fn(async () => link) };
  const controller = new InvoicesController(service as never);
  const body = { customerId: 'cus_1', items: [{ description: 'Installation', quantity: 1, unitAmount: 50000 }], dueDate: '2026-11-01' };

  beforeEach(() => jest.clearAllMocks());

  it('creates the invoice and its payment link in one call', async () => {
    const out = await controller.create({} as never, { id: 'ten_1' }, { ...body, checkout: { callbackUrl: 'https://shop.example/paid' } } as never);
    expect(service.create).toHaveBeenCalledWith({}, 'ten_1', body);
    expect(service.createCheckout).toHaveBeenCalledWith({}, 'inv_1', 'https://shop.example/paid', undefined, 'ten_1');
    expect(out).toEqual({ ...invoice, checkout: link });
  });

  it('leaves a plain invoice alone', async () => {
    expect(await controller.create({} as never, { id: 'ten_1' }, body as never)).toEqual(invoice);
    expect(service.createCheckout).not.toHaveBeenCalled();
  });
});
