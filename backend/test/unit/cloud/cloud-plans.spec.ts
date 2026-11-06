import { CLOUD_CATALOGUE, CLOUD_TIERS, cloudPlansEnabled, PAID_CODES, tierOf } from '../../../src/modules/cloud-plans/cloud-plans.catalogue';

describe('cloud plans', () => {
  it('has a free tier and a paid Growth tier, monthly and yearly', () => {
    expect(tierOf('cloud_free')).toBe('free');
    expect(tierOf('cloud_growth_monthly')).toBe('growth');
    expect(tierOf('cloud_growth_yearly')).toBe('growth');
    expect(tierOf('cloud_partner')).toBe('partner');
    expect(tierOf('cloud_enterprise')).toBe('enterprise');
    expect(tierOf('something_else')).toBeNull();
    expect(PAID_CODES).toEqual(['cloud_growth_monthly', 'cloud_growth_yearly']);
  });

  it('limits Free and leaves Growth, Enterprise and Partner unlimited', () => {
    for (const key of ['customers', 'activeSubscriptions', 'invoicesPerMonth', 'teamMembers'] as const) {
      expect(CLOUD_TIERS.free.limits[key]).toBeGreaterThan(0);
      expect(CLOUD_TIERS.growth.limits[key]).toBeUndefined();
      expect(CLOUD_TIERS.partner.limits[key]).toBeUndefined();
      expect(CLOUD_TIERS.enterprise.limits[key]).toBeUndefined();
    }
    expect(CLOUD_TIERS.free.limits.customers).toBe(500);
    expect(CLOUD_TIERS.free.limits.activeSubscriptions).toBe(500);
  });

  it('prices every plan in dollars only, the year at ten months', () => {
    const prices = (code: string) => CLOUD_CATALOGUE.find((p) => p.code === code)!.prices;
    expect(prices('cloud_free')).toEqual([{ currency: 'USD', amount: 0 }]);
    expect(prices('cloud_growth_monthly')).toEqual([{ currency: 'USD', amount: 15 }]);
    expect(prices('cloud_growth_yearly')).toEqual([{ currency: 'USD', amount: 150 }]);
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

describe('CloudPlansService.ensureCatalogue', () => {
  const local = { UGX: 55000, KES: 1900, TZS: 38000, RWF: 20000, NGN: 22000, GHS: 180, ZAR: 270, XAF: 9000, XOF: 9000, ZMW: 380, MWK: 26000, EGP: 720, USD: 15, EUR: 14, GBP: 12 };

  async function run(prices: Record<string, number>) {
    const { CloudPlansService } = await import('../../../src/modules/cloud-plans/cloud-plans.service');
    const db = {
      plan: {
        findUnique: jest.fn(async ({ where }: { where: { code: string } }) => ({
          id: `id_${where.code}`,
          prices: Object.entries(where.code === 'cloud_growth_monthly' ? prices : {}).map(([currency, amount]) => ({ currency, amount })),
        })),
        update: jest.fn(),
      },
      planPrice: { updateMany: jest.fn(), upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new CloudPlansService({} as never, { getTenantClient: async () => db } as never, {} as never, {} as never, {} as never);
    (service as unknown as { operatorId: string }).operatorId = 'operator';
    await service.ensureCatalogue();
    return db;
  }

  it('stops offering the local prices, keeping them for subscriptions already on one', async () => {
    const db = await run(local);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.planPrice.updateMany).toHaveBeenCalledWith({ where: { planId: 'id_cloud_growth_monthly', currency: { notIn: ['USD'] } }, data: { isActive: false } });
    expect(db.plan.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'id_cloud_growth_monthly' } }));
  });

  it('keeps prices the operator set', async () => {
    const db = await run({ ...local, UGX: 60000 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("keeps Free's features in step with its limits", async () => {
    const db = await run({ USD: 15 });
    expect(db.plan.update).toHaveBeenCalledWith({ where: { id: 'id_cloud_free' }, data: { features: expect.arrayContaining(['500 customers', '500 active subscriptions']) } });
    expect(db.plan.update).toHaveBeenCalledTimes(1);
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
            { tenantId: 'recent', planId: 'cloud_free', limits: { customers: 500, activeSubscriptions: 1000, invoicesPerMonth: 2500, teamMembers: 5 } },
            { tenantId: 'custom', planId: 'cloud_free', limits: { customers: 50 } },
            { tenantId: 'partner', planId: 'cloud_partner', limits: null },
          ]),
          update,
        },
      },
    };
    const service = new CloudPlansService(central as never, {} as never, {} as never, {} as never, {} as never);
    expect(await service.refreshLimits()).toBe(2);
    expect(update).toHaveBeenCalledWith({ where: { tenantId: 'recent' }, data: { limits: CLOUD_TIERS.free.limits } });
    expect(update).toHaveBeenCalledWith({ where: { tenantId: 'old' }, data: { limits: CLOUD_TIERS.free.limits } });
  });
});
