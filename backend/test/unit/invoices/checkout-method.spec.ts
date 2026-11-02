import { checkoutMethod } from '../../../src/modules/invoices/invoices.service';

describe('checkout method', () => {
  it('accepts the methods a payer can choose, and none', () => {
    expect(checkoutMethod('paypal')).toBe('paypal');
    expect(checkoutMethod('mobile_money')).toBe('mobile_money');
    expect(checkoutMethod(undefined)).toBeUndefined();
    expect(checkoutMethod('')).toBeUndefined();
  });

  it('refuses anything else', () => {
    expect(() => checkoutMethod('bitcoin')).toThrow(/card, mobile_money, paypal/);
  });
});
