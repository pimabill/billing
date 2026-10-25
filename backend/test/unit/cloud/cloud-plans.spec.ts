import { CLOUD_CATALOGUE, CLOUD_TIERS, cloudPlansEnabled, PAID_CODES, tierOf } from '../../../src/modules/cloud-plans/cloud-plans.catalogue';

describe('cloud plans', () => {
  it('has a free tier and a paid Growth tier, monthly and yearly', () => {
    expect(tierOf('cloud_free')).toBe('free');
    expect(tierOf('cloud_growth_monthly')).toBe('growth');
    expect(tierOf('cloud_growth_yearly')).toBe('growth');
    expect(tierOf('something_else')).toBeNull();
    expect(PAID_CODES).toEqual(['cloud_growth_monthly', 'cloud_growth_yearly']);
  });

  it('gives Growth more of everything than Free', () => {
    for (const key of ['customers', 'activeSubscriptions', 'invoicesPerMonth', 'teamMembers'] as const) {
      expect(CLOUD_TIERS.growth.limits[key]!).toBeGreaterThan(CLOUD_TIERS.free.limits[key]!);
    }
  });

  it('prices every paid plan in shillings and dollars, the year at ten months', () => {
    const monthly = CLOUD_CATALOGUE.find((p) => p.code === 'cloud_growth_monthly')!;
    const yearly = CLOUD_CATALOGUE.find((p) => p.code === 'cloud_growth_yearly')!;
    for (const currency of ['UGX', 'USD']) {
      const m = monthly.prices.find((p) => p.currency === currency)!.amount;
      expect(yearly.prices.find((p) => p.currency === currency)!.amount).toBe(m * 10);
    }
  });

  it('is on for the hosted cloud only', () => {
    const saved = { ...process.env };
    try {
      delete process.env.CLOUD_PLANS;
      delete process.env.MANAGED_PAYMENTS_URL;
      expect(cloudPlansEnabled()).toBe(false);
      process.env.MANAGED_PAYMENTS_URL = 'http://managed';
      process.env.MANAGED_PAYMENTS_API_KEY = 'k';
      expect(cloudPlansEnabled()).toBe(true);
      process.env.CLOUD_PLANS = 'false';
      expect(cloudPlansEnabled()).toBe(false);
    } finally {
      process.env = saved;
    }
  });
});
