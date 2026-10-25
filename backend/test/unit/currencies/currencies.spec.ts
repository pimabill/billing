import { BadRequestException, ConflictException } from '@nestjs/common';
import { Converter } from '../../../src/modules/currencies/converter';
import { CurrenciesService } from '../../../src/modules/currencies/currencies.service';
import { FxRatesService } from '../../../src/modules/currencies/fx-rates.service';
import { assertKnownCurrency, currencyForCountry, getCurrencyDecimals, isIsoCurrency } from '../../../src/common/utils/currency.utils';
import { currencyContext } from '../../../src/common/utils/currency-context';

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe('Converter', () => {
  const rows = [
    { date: day('2026-10-01'), currency: 'UGX', perUsd: 3700 },
    { date: day('2026-10-20'), currency: 'UGX', perUsd: 3600 },
    { date: day('2026-10-01'), currency: 'KES', perUsd: 129 },
  ];

  it('converts at the rate of the amount\'s own day, through the dollar', () => {
    const fx = new Converter('UGX', rows, new Map());
    expect(fx.convert(100, 'KES', day('2026-10-05'))).toBeCloseTo((100 / 129) * 3700);
    expect(fx.convert(100, 'KES', day('2026-10-21'))).toBeCloseTo((100 / 129) * 3600);
    expect(fx.convert(5, 'USD', day('2026-10-21'))).toBe(5 * 3600);
    expect(fx.convert(1000, 'UGX')).toBe(1000);
  });

  it('uses the earliest rate for amounts older than the history', () => {
    const fx = new Converter('UGX', rows, new Map());
    expect(fx.perUsd('UGX', day('2025-01-01'))).toBe(3700);
  });

  it('uses the organisation\'s own rate for its own currencies, and lists what it cannot convert', () => {
    const fx = new Converter('USD', rows, new Map([['PTS', 100]]));
    expect(fx.convert(250, 'PTS')).toBe(2.5);
    expect(fx.convert(10, 'ZZZ')).toBeNull();
    expect(fx.sum(10, 'ZZZ')).toBe(0);
    expect(fx.describe()).toEqual({ currency: 'USD', ratesAsOf: '2026-10-20', unconverted: ['ZZZ'] });
  });
});

describe('currency helpers', () => {
  it('knows ISO codes and a country\'s currency', () => {
    expect(isIsoCurrency('ugx')).toBe(true);
    expect(isIsoCurrency('PTS')).toBe(false);
    expect(currencyForCountry('ug')).toBe('UGX');
    expect(currencyForCountry('CI')).toBe('XOF');
    expect(currencyForCountry(null)).toBeNull();
  });

  it('accepts ISO codes and the organisation\'s own, and refuses typos', async () => {
    const db = { currency: { findUnique: jest.fn(async ({ where }: { where: { code: string } }) => (where.code === 'PTS' ? { code: 'PTS' } : null)) } };
    await expect(assertKnownCurrency(db, 'ugx')).resolves.toBe('UGX');
    await expect(assertKnownCurrency(db, 'pts')).resolves.toBe('PTS');
    await expect(assertKnownCurrency(db, 'UGS')).rejects.toThrow(BadRequestException);
  });

  it('rounds the organisation\'s own currencies to their own decimals inside its context', () => {
    expect(getCurrencyDecimals('PTS')).toBe(2);
    currencyContext.run(new Map([['PTS', 0]]), () => expect(getCurrencyDecimals('PTS')).toBe(0));
    expect(getCurrencyDecimals('UGX')).toBe(0);
  });
});

describe('CurrenciesService', () => {
  const setup = (settings: Record<string, unknown> = {}) => {
    const rows = new Map<string, any>();
    const db = {
      currency: {
        findUnique: jest.fn(async ({ where }: any) => rows.get(where.code) ?? null),
        create: jest.fn(async ({ data }: any) => {
          const row = { symbol: null, decimals: 2, perUsd: null, createdAt: new Date(), ...data };
          rows.set(data.code, row);
          return row;
        }),
        delete: jest.fn(async ({ where }: any) => rows.delete(where.code)),
        findMany: jest.fn(async () => [...rows.values()]),
      },
      customer: { count: jest.fn(async () => 0) },
      planPrice: { count: jest.fn(async () => 0) },
      invoice: { count: jest.fn(async () => 0) },
      subscription: { count: jest.fn(async () => 0) },
    };
    const central = { client: { tenant: { findUnique: jest.fn(async () => ({ settings })), findUniqueOrThrow: jest.fn(async () => ({ settings })), update: jest.fn() } } };
    return { db, central, service: new CurrenciesService(central as never, {} as never) };
  };

  it('reports in the chosen currency, else the country\'s, else USD', async () => {
    expect(await setup({ reportingCurrency: 'kes' }).service.reportingCurrency('t')).toBe('KES');
    expect(await setup({ country: 'UG' }).service.reportingCurrency('t')).toBe('UGX');
    expect(await setup().service.reportingCurrency('t')).toBe('USD');
  });

  it('defines a currency that is not ISO, and will not remove one in use', async () => {
    const { db, service } = setup();
    await expect(service.createCustom(db as never, { code: 'UGX', name: 'x' })).rejects.toThrow(/ISO currency/);
    await expect(service.createCustom(db as never, { code: 'P', name: 'x' })).rejects.toThrow(BadRequestException);
    expect(await service.createCustom(db as never, { code: 'pts', name: 'Points', decimals: 0, perUsd: 100 })).toMatchObject({ code: 'PTS', decimals: 0, perUsd: 100 });
    await expect(service.createCustom(db as never, { code: 'PTS', name: 'Again' })).rejects.toThrow(ConflictException);
    db.customer.count.mockResolvedValueOnce(3);
    await expect(service.deleteCustom(db as never, 't', 'PTS')).rejects.toThrow(/in use|used by/);
    await service.deleteCustom(db as never, 't', 'PTS');
    expect(db.currency.delete).toHaveBeenCalled();
  });
});

describe('FxRatesService', () => {
  it('stores a USD-based source under the day it says the rates are for', async () => {
    const createMany = jest.fn();
    const central = { client: { $transaction: jest.fn(async (ops: unknown[]) => ops), exchangeRate: { deleteMany: jest.fn(), createMany } } };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', base_code: 'USD', time_last_update_unix: Date.UTC(2026, 9, 25, 0, 2) / 1000, rates: { USD: 1, UGX: 3650.5, KES: 129.2, bad: 2, XAF: 0 } }),
    } as never);
    try {
      const result = await new FxRatesService(central as never).refresh();
      expect(result).toEqual({ date: '2026-10-25', currencies: 3 });
      const rows = createMany.mock.calls[0][0].data;
      expect(rows.map((r: { currency: string }) => r.currency).sort()).toEqual(['KES', 'UGX', 'USD']);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
