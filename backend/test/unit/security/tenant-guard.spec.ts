import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import { TenantGuard } from '../../../src/common/guards/tenant.guard';
import { hashApiKey } from '../../../src/common/auth/api-keys';
import { derivedSecret, signPortalToken } from '../../../src/common/auth/tokens';
import { routeOf, featureOf, countedBy } from '../../../src/common/guards/plan-limits';

const SECRET = 'x'.repeat(48);
const tenant = { id: 'tenant_1', isActive: true, accessMode: 'FULL', isPlatformOperator: false };

function setup() {
  const central = {
    client: {
      tenant: { findUnique: jest.fn() },
      apiKey: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
      membership: { findFirst: jest.fn() },
      tenantBilling: { findUnique: jest.fn().mockResolvedValue(null) },
    },
  };
  const guard = new TenantGuard(
    central as any,
    { getTenantClient: jest.fn().mockResolvedValue({}) } as any,
    { get: (k: string) => (k === 'JWT_SECRET' ? SECRET : undefined) } as any,
    new Reflector(),
  );
  const ctx = (token: string, method = 'GET', url = '/api/customers') => {
    const request: Record<string, any> = { headers: { authorization: `Bearer ${token}` }, method, originalUrl: url };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => function handler() {},
        getClass: () => class Controller {},
      } as any,
    };
  };
  return { central, guard, ctx };
}

describe('TenantGuard', () => {
  describe('API key scopes', () => {
    it('lets a read-only key read', async () => {
      const { central, guard, ctx } = setup();
      central.client.apiKey.findUnique.mockResolvedValue({ id: 'k1', scopes: ['read'], expiresAt: null, tenant });
      const { context, request } = ctx('sk_live_read', 'GET');
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.apiKeyScopes).toEqual(['read']);
      // Looked up by hash, never by the plaintext key.
      expect(central.client.apiKey.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { keyHash: hashApiKey('sk_live_read') } }));
    });

    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('refuses %s with a read-only key', async (method) => {
      const { central, guard, ctx } = setup();
      central.client.apiKey.findUnique.mockResolvedValue({ id: 'k1', scopes: ['read'], expiresAt: null, tenant });
      await expect(guard.canActivate(ctx('sk_live_read', method).context)).rejects.toThrow(ForbiddenException);
    });

    it('lets a write key write', async () => {
      const { central, guard, ctx } = setup();
      central.client.apiKey.findUnique.mockResolvedValue({ id: 'k1', scopes: ['read', 'write'], expiresAt: null, tenant });
      await expect(guard.canActivate(ctx('sk_live_rw', 'POST').context)).resolves.toBe(true);
    });

    it('treats a key with no recognised scope as unable to do anything', async () => {
      const { central, guard, ctx } = setup();
      central.client.apiKey.findUnique.mockResolvedValue({ id: 'k1', scopes: [], expiresAt: null, tenant });
      await expect(guard.canActivate(ctx('sk_live_none', 'GET').context)).rejects.toThrow(ForbiddenException);
    });

    it('limits per-resource scopes to their resource', async () => {
      const { central, guard, ctx } = setup();
      central.client.apiKey.findUnique.mockResolvedValue({ id: 'k1', scopes: ['customers:read', 'customers:write'], expiresAt: null, tenant });
      await expect(guard.canActivate(ctx('k', 'POST', '/api/customers').context)).resolves.toBe(true);
      await expect(guard.canActivate(ctx('k', 'GET', '/api/Customers/c1').context)).resolves.toBe(true);
      await expect(guard.canActivate(ctx('k', 'POST', '/api/payouts').context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx('k', 'GET', '/api/invoices').context)).rejects.toThrow(ForbiddenException);
    });

    it('keeps a per-resource read scope read-only', async () => {
      const { central, guard, ctx } = setup();
      central.client.apiKey.findUnique.mockResolvedValue({ id: 'k1', scopes: ['invoices:read'], expiresAt: null, tenant });
      await expect(guard.canActivate(ctx('k', 'GET', '/api/invoices').context)).resolves.toBe(true);
      await expect(guard.canActivate(ctx('k', 'POST', '/api/invoices/i1/mark-paid').context)).rejects.toThrow(ForbiddenException);
    });

    it("finds the organisation's own key by hash", async () => {
      const { central, guard, ctx } = setup();
      central.client.tenant.findUnique.mockImplementation(async (args: any) => (args.where.apiKeyHash === hashApiKey('sk_live_org') ? tenant : null));
      await expect(guard.canActivate(ctx('sk_live_org', 'POST').context)).resolves.toBe(true);
    });
  });

  describe('session tokens', () => {
    const member = (passwordChangedAt: Date | null = null) => ({
      userId: 'u1',
      role: 'OWNER',
      user: { id: 'u1', email: 'a@b.c', name: 'A', isActive: true, passwordChangedAt },
    });

    it('accepts a session token', async () => {
      const { central, guard, ctx } = setup();
      central.client.tenant.findUnique.mockResolvedValue(tenant);
      central.client.membership.findFirst.mockResolvedValue(member());
      const token = sign({ sub: 'tenant_1', uid: 'u1', typ: 'access' }, SECRET);
      await expect(guard.canActivate(ctx(token).context)).resolves.toBe(true);
    });

    it('refuses sessions issued before the password changed', async () => {
      const { central, guard, ctx } = setup();
      central.client.tenant.findUnique.mockResolvedValue(tenant);
      central.client.membership.findFirst.mockResolvedValue(member(new Date(Date.now() + 5000)));
      const token = sign({ sub: 'tenant_1', uid: 'u1', typ: 'access' }, SECRET);
      await expect(guard.canActivate(ctx(token).context)).rejects.toThrow(UnauthorizedException);
    });

    it('never accepts a token minted for another purpose as a session', async () => {
      const { central, guard, ctx } = setup();
      // Only a lookup by id finds the tenant; nothing matches the token as an API key.
      central.client.tenant.findUnique.mockImplementation(async (args: any) => (args.where.id === 'tenant_1' ? tenant : null));
      central.client.membership.findFirst.mockResolvedValue(member());
      // A refresh token signed with the access secret (misconfiguration), a portal link, a reset token.
      const refresh = sign({ sub: 'tenant_1', uid: 'u1', typ: 'refresh' }, SECRET);
      const portal = signPortalToken(SECRET, 'tenant_1', 'cust_ext', 600);
      const reset = sign({ sub: 'tenant_1', typ: 'password-reset' }, derivedSecret(SECRET, 'password-reset'));
      for (const token of [refresh, portal, reset]) {
        await expect(guard.canActivate(ctx(token).context)).rejects.toThrow(UnauthorizedException);
      }
    });
  
    it('in an organisation that requires two-step sign-in, lets someone without it only set it up', async () => {
      const { central, guard, ctx } = setup();
      central.client.tenant.findUnique.mockResolvedValue({ ...tenant, name: 'Acme', settings: { requireMfa: true } });
      central.client.membership.findFirst.mockResolvedValue(member());
      const token = sign({ sub: 'tenant_1', uid: 'u1', typ: 'access' }, SECRET);
      await expect(guard.canActivate(ctx(token, 'GET', '/api/customers').context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx(token, 'POST', '/api/auth/mfa/setup').context)).resolves.toBe(true);
      await expect(guard.canActivate(ctx(token, 'GET', '/api/auth/session').context)).resolves.toBe(true);

      central.client.membership.findFirst.mockResolvedValue({ ...member(), user: { ...member().user, mfaEnabledAt: new Date() } });
      await expect(guard.canActivate(ctx(token, 'GET', '/api/customers').context)).resolves.toBe(true);
    });
  });
});

describe('plan limit routes', () => {
  it('cannot be bypassed with letter case, doubled slashes or encoding', () => {
    expect(routeOf('/api/Customers')).toBe('/customers');
    expect(countedBy('POST', routeOf('/api/CUSTOMERS/'))).toBe('customers');
    expect(featureOf(routeOf('/api/MONEY/collections'))).toBe('money_movement');
    expect(featureOf(routeOf('/api//wallets'))).toBe('wallets');
    expect(featureOf(routeOf('/api/%6Cedger/entries'))).toBe('ledger');
  });
});
