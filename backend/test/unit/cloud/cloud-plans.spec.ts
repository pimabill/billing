import { CLOUD_CATALOGUE, CLOUD_TIERS, cloudPlansEnabled, PAID_CODES, tierOf } from '../../../src/modules/cloud-plans/cloud-plans.catalogue';

describe('cloud plans', () => {
  it('has a free tier and a paid Growth tier, monthly and yearly', () => {
    expect(tierOf('cloud_free')).toBe('free');
    expect(tierOf('cloud_growth_monthly')).toBe('growth');
    expect(tierOf('cloud_growth_yearly')).toBe('growth');
    expect(tierOf('cloud_partner')).toBe('partner');
    expect(tierOf('something_else')).toBeNull();
    expect(PAID_CODES).toEqual(['cloud_growth_monthly', 'cloud_growth_yearly']);
  });

  it('limits Free and leaves Growth and Partner unlimited', () => {
    for (const key of ['customers', 'activeSubscriptions', 'invoicesPerMonth', 'teamMembers'] as const) {
      expect(CLOUD_TIERS.free.limits[key]).toBeGreaterThan(0);
      expect(CLOUD_TIERS.growth.limits[key]).toBeUndefined();
      expect(CLOUD_TIERS.partner.limits[key]).toBeUndefined();
    }
    expect(CLOUD_TIERS.free.limits.customers).toBeGreaterThanOrEqual(1000);
  });

  it('prices every plan in every currency Flutterwave takes, the year at ten months', () => {
    const monthly = CLOUD_CATALOGUE.find((p) => p.code === 'cloud_growth_monthly')!;
    const yearly = CLOUD_CATALOGUE.find((p) => p.code === 'cloud_growth_yearly')!;
    for (const currency of ['UGX', 'KES', 'TZS', 'RWF', 'NGN', 'GHS', 'ZAR', 'XAF', 'XOF', 'ZMW', 'MWK', 'EGP', 'USD', 'EUR', 'GBP']) {
      const m = monthly.prices.find((p) => p.currency === currency)!.amount;
      expect(yearly.prices.find((p) => p.currency === currency)!.amount).toBe(m * 10);
    }
  });

  it('is on for the hosted cloud only', () => {
    const saved = { ...process.env };
    try {
      delete process.env.CLOUD_PLANS;
      delete process.env.MANAGED_PAYMENTS_URL;
      delete process.env.SANDBOX_MODE;
      expect(cloudPlansEnabled()).toBe(false);
      process.env.MANAGED_PAYMENTS_URL = 'http://managed';
      process.env.MANAGED_PAYMENTS_API_KEY = 'k';
      expect(cloudPlansEnabled()).toBe(true);
      process.env.SANDBOX_MODE = 'true';
      expect(cloudPlansEnabled()).toBe(false);
      process.env.CLOUD_PLANS = 'true';
      expect(cloudPlansEnabled()).toBe(true);
      delete process.env.SANDBOX_MODE;
      process.env.CLOUD_PLANS = 'false';
      expect(cloudPlansEnabled()).toBe(false);
    } finally {
      process.env = saved;
    }
  });
});

describe('CloudPlansService.refreshLimits', () => {
  it('moves organisations on earlier limits to the current ones and keeps hand-set limits', async () => {
    const { CloudPlansService } = await import('../../../src/modules/cloud-plans/cloud-plans.service');
    const update = jest.fn().mockResolvedValue({});
    const central = {
      client: {
        tenantBilling: {
          findMany: jest.fn().mockResolvedValue([
            { tenantId: 'old', planId: 'cloud_free', limits: { customers: 100, activeSubscriptions: 100, invoicesPerMonth: 300, teamMembers: 2 } },
            { tenantId: 'custom', planId: 'cloud_free', limits: { customers: 50 } },
            { tenantId: 'partner', planId: 'cloud_partner', limits: null },
          ]),
          update,
        },
      },
    };
    const service = new CloudPlansService(central as never, {} as never, {} as never, {} as never, {} as never);
    expect(await service.refreshLimits()).toBe(1);
    expect(update).toHaveBeenCalledWith({ where: { tenantId: 'old' }, data: { limits: CLOUD_TIERS.free.limits } });
  });
});
