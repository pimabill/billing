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

  async function run(prices: Record<string, number>, features?: string[]) {
    const { CloudPlansService } = await import('../../../src/modules/cloud-plans/cloud-plans.service');
    const db = {
      plan: {
        findUnique: jest.fn(async ({ where }: { where: { code: string } }) => ({
          id: `id_${where.code}`,
          features,
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

  it('stops any plan offering managed payments, whatever its prices', async () => {
    const db = await run({ USD: 15 }, ['Every feature, including managed payments']);
    expect(db.plan.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'id_cloud_growth_monthly' }, data: { features: expect.not.arrayContaining(['Every feature, including managed payments']) } }));
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

describe('paying for Growth', () => {
  async function checkout(method?: 'paypal') {
    const { CloudPlansService } = await import('../../../src/modules/cloud-plans/cloud-plans.service');
    const db = {
      plan: { findUnique: async () => ({ id: 'plan_1', code: 'cloud_growth_monthly', name: 'Growth', isActive: true, prices: [{ currency: 'USD' }] }) },
      customer: { upsert: async () => ({ id: 'cus_1' }) },
      subscription: { findMany: async () => [{ id: 'sub_1', currency: 'USD', plan: { code: 'cloud_growth_monthly', name: 'Growth' }, invoices: [] }] },
      invoice: { findFirst: async () => ({ id: 'inv_1' }) },
    };
    const central = {
      client: {
        tenant: {
          findFirst: async () => ({ id: 'operator', name: 'Operator' }),
          findUnique: async () => null,
          findUniqueOrThrow: async () => ({ id: 'ten_1', name: 'Shop', email: 'shop@example.com' }),
        },
        tenantBilling: { findUnique: async () => null },
      },
    };
    const invoices = {
      createHostedCheckout: jest.fn(async () => ({ checkoutUrl: 'https://app.example/pay/token' })),
      createCheckout: jest.fn(async () => ({ checkoutUrl: 'https://paypal.example/x' })),
    };
    const service = new CloudPlansService(central as never, { getTenantClient: async () => db } as never, {} as never, invoices as never, {} as never);
    Object.defineProperty(service, 'enabled', { get: () => true });
    const result = await service.checkout('ten_1', 'cloud_growth_monthly', 'USD', 'https://app.example/settings/plan', method);
    return { result, invoices };
  }

  it('lets the organisation choose how to pay on the hosted checkout', async () => {
    const { result, invoices } = await checkout();
    expect(result.url).toBe('https://app.example/pay/token');
    expect(invoices.createHostedCheckout).toHaveBeenCalledWith(expect.anything(), 'inv_1', 'operator', { callbackUrl: 'https://app.example/settings/plan' });
    expect(invoices.createCheckout).not.toHaveBeenCalled();
  });

  it('goes straight to payment when the API caller names a method', async () => {
    const { result, invoices } = await checkout('paypal');
    expect(result.url).toBe('https://paypal.example/x');
    expect(invoices.createHostedCheckout).not.toHaveBeenCalled();
  });
});
