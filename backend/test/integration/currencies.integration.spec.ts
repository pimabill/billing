/**
 * Reporting currency, custom currencies and daily rates against real databases.
 *
 * Skipped unless both CENTRAL_TEST_DATABASE_URL and LEDGER_TEST_DATABASE_URL point at migrated databases.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma-tenant/client';
import { CentralPrismaService } from '../../src/database/central-prisma.service';
import { CurrenciesService } from '../../src/modules/currencies/currencies.service';
import { FxRatesService } from '../../src/modules/currencies/fx-rates.service';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { assertKnownCurrency } from '../../src/common/utils/currency.utils';

const centralUrl = process.env.CENTRAL_TEST_DATABASE_URL;
const tenantUrl = process.env.LEDGER_TEST_DATABASE_URL;
const describeDb = centralUrl && tenantUrl ? describe : describe.skip;

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describeDb('currencies (postgres)', () => {
  const config = { get: (key: string, fallback?: string) => ({ CENTRAL_DATABASE_URL: centralUrl })[key] ?? fallback };
  const central = new CentralPrismaService(config as never);
  let db: PrismaClient;
  let tenantId: string;
  const fx = new FxRatesService(central);
  const currencies = new CurrenciesService(central, fx);
  const analytics = new AnalyticsService(currencies);

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: tenantUrl! }) });
    const stamp = Date.now().toString(36);
    tenantId = (await central.client.tenant.create({ data: { name: 'FX test', slug: `fx-${stamp}`, email: `fx-${stamp}@example.com`, settings: { country: 'KE' } } })).id;
    await central.client.exchangeRate.deleteMany({ where: { currency: { in: ['KES', 'UGX'] } } });
    await central.client.exchangeRate.createMany({
      data: [
        { date: day('2026-09-01'), currency: 'KES', perUsd: 130, source: 'test' },
        { date: day('2026-09-01'), currency: 'UGX', perUsd: 3700, source: 'test' },
        { date: day('2026-10-01'), currency: 'KES', perUsd: 128, source: 'test' },
        { date: day('2026-10-01'), currency: 'UGX', perUsd: 3600, source: 'test' },
      ],
    });
    await db.$executeRawUnsafe(`TRUNCATE "Invoice", "Customer", "Currency" CASCADE`);
  });
  afterAll(async () => {
    await central.client.exchangeRate.deleteMany({ where: { source: 'test' } });
    await central.client.tenant.delete({ where: { id: tenantId } });
    await central.client.$disconnect();
    await db.$disconnect();
  });

  it('reports in the country\'s currency, converting each invoice at its own day\'s rate', async () => {
    expect(await currencies.reportingCurrency(tenantId)).toBe('KES');
    await db.customer.create({ data: { id: 'cus_fx', externalId: 'fx1', email: 'fx@example.com', currency: 'UGX' } });
    const invoice = (n: string, amount: number, currency: string, paidAt: string) =>
      db.invoice.create({ data: { invoiceNumber: n, customerId: 'cus_fx', amount, currency, status: 'PAID', dueDate: new Date(paidAt), paidAt: new Date(paidAt) } });
    await invoice('FX-1', 370_000, 'UGX', '2026-09-15'); // 100 USD = 13,000 KES
    await invoice('FX-2', 360_000, 'UGX', '2026-10-15'); // 100 USD = 12,800 KES
    await invoice('FX-3', 1_000, 'KES', '2026-10-16');

    const revenue = await analytics.getRevenueAnalytics(db, {}, tenantId);
    expect(revenue.currency).toBe('KES');
    expect(Number(revenue.totalRevenue)).toBeCloseTo(13_000 + 12_800 + 1_000, 2);
    expect(revenue.byCurrency).toEqual([
      { currency: 'KES', amount: '1000.0000' },
      { currency: 'UGX', amount: '730000.0000' },
    ]);
    expect(revenue.unconverted).toEqual([]);
  });

  it('accepts its own currency once defined, converts it at its own rate, and keeps it while in use', async () => {
    await expect(assertKnownCurrency(db, 'PTS')).rejects.toThrow(/Unknown currency/);
    await currencies.createCustom(db, { code: 'PTS', name: 'Points', decimals: 0, perUsd: 10 });
    await expect(assertKnownCurrency(db, 'pts')).resolves.toBe('PTS');

    await db.invoice.create({ data: { invoiceNumber: 'FX-4', customerId: 'cus_fx', amount: 500, currency: 'PTS', status: 'PAID', dueDate: new Date(), paidAt: new Date() } });
    const fxConv = await currencies.converter(db, tenantId, ['PTS'], new Date(), new Date());
    expect(fxConv.convert(500, 'PTS')).toBeCloseTo((500 / 10) * 128, 4);
    await expect(currencies.deleteCustom(db, tenantId, 'PTS')).rejects.toThrow(/used by/);

    await currencies.setReportingCurrency(db, tenantId, 'PTS');
    expect(await currencies.reportingCurrency(tenantId)).toBe('PTS');
  });
});
