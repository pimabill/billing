import { BalancesService, combineBalances } from '../../../src/modules/money/balances.service';

describe('combineBalances', () => {
  it('adds up each currency across providers and keeps where it is held', () => {
    const result = combineBalances([
      { provider: 'gateway', name: 'Payment gateway', balances: { UGX: { available: '200000', pending: '50000' }, usd: { available: '12.5', pending: '0' } } },
      { provider: 'yo', name: 'Yo! Payments', balances: { UGX: { available: '1000.25', pending: null } } },
    ]);
    expect(result.map((c) => c.currency)).toEqual(['UGX', 'USD']);
    expect(result[0]).toEqual({
      currency: 'UGX',
      available: '201000.2500',
      pending: '50000.0000',
      sources: [
        { provider: 'gateway', name: 'Payment gateway', available: '200000', pending: '50000' },
        { provider: 'yo', name: 'Yo! Payments', available: '1000.25', pending: null },
      ],
    });
    expect(result[1].available).toBe('12.5000');
  });

  it('puts currencies holding money before empty ones', () => {
    const result = combineBalances([
      { provider: 'gateway', name: 'Payment gateway', balances: { EUR: { available: '0', pending: '0' }, KES: { available: '0', pending: '300' }, USD: { available: '5', pending: '0' } } },
    ]);
    expect(result.map((c) => c.currency)).toEqual(['KES', 'USD', 'EUR']);
  });
});

describe('BalancesService.overview', () => {
  function setup(options: { gateway?: () => Promise<unknown>; yo?: () => Promise<unknown> } = {}) {
    const registry = {
      list: jest.fn(async () => [
        { provider: 'gateway', capabilities: { balance: false } },
        { provider: 'yo', capabilities: { balance: true } },
        { provider: 'stripe', capabilities: { balance: false } },
      ]),
    };
    const money = { balance: jest.fn(async () => ({ provider: 'yo', balances: await (options.yo ?? (async () => ({ UGX: '5000' })))() })) };
    const gateway = { balances: jest.fn(options.gateway ?? (async () => ({ UGX: { available: '100', pending: '20' } }))) };
    return { money, gateway, service: new BalancesService(money as never, registry as never, gateway as never) };
  }

  it('asks the gateway and each provider that reports a balance', async () => {
    const { service, money } = setup();
    const result = await service.overview({} as never);
    expect(money.balance).toHaveBeenCalledTimes(1);
    expect(money.balance).toHaveBeenCalledWith({}, 'yo');
    expect(result.currencies).toEqual([
      expect.objectContaining({ currency: 'UGX', available: '5100.0000', pending: '20.0000' }),
    ]);
    expect(result.unavailable).toEqual([]);
  });

  it('leaves out the gateway when the organisation has no account there', async () => {
    const { service } = setup({ gateway: async () => null });
    const result = await service.overview({} as never);
    expect(result.currencies[0].sources.map((s) => s.provider)).toEqual(['yo']);
  });

  it('still answers when a provider fails, and says which one', async () => {
    const { service } = setup({ yo: async () => { throw new Error('socket hang up'); } });
    const result = await service.overview({} as never);
    expect(result.currencies[0]).toEqual(expect.objectContaining({ currency: 'UGX', available: '100.0000' }));
    expect(result.unavailable).toEqual([{ provider: 'yo', name: 'Yo! Payments', error: 'Could not be reached just now' }]);
  });
});
