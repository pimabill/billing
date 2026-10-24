/**
 * Switching between live and sandbox against a real central database.
 *
 * Skipped unless CENTRAL_TEST_DATABASE_URL points at a migrated central database:
 *   CENTRAL_DATABASE_URL=$URL npx prisma migrate deploy --config prisma.config.ts
 *   CENTRAL_TEST_DATABASE_URL=$URL npx jest test/integration/sandbox-link --runInBand
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { sign } from 'jsonwebtoken';
import { AuthService } from '../../src/modules/auth/auth.service';
import { CentralPrismaService } from '../../src/database/central-prisma.service';

const url = process.env.CENTRAL_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const LINK_SECRET = 'sandbox-link-secret-of-at-least-32-chars';
const config = {
  get: (key: string, fallback?: string) =>
    ({ CENTRAL_DATABASE_URL: url, JWT_SECRET: 'test-access-secret', JWT_REFRESH_SECRET: 'test-refresh-secret' })[key] ?? fallback,
};

describeDb('switching to the sandbox (postgres)', () => {
  const central = new CentralPrismaService(config as never);
  const tenantDb = { createTenantDatabase: jest.fn(), getTenantClient: jest.fn(async () => ({})) };
  const encryption = { generateApiKey: () => `sk_live_${Math.random().toString(36).slice(2)}`, generateWebhookSecret: () => 'whsec' };
  const auth = new AuthService(central, tenantDb as never, new JwtService(), config as never, encryption as never, { sendHtml: jest.fn() } as never);
  const env = { mode: process.env.SANDBOX_MODE, secret: process.env.SANDBOX_LINK_SECRET };
  const stamp = Date.now().toString(36);

  beforeAll(() => {
    process.env.SANDBOX_LINK_SECRET = LINK_SECRET;
  });
  afterAll(async () => {
    process.env.SANDBOX_MODE = env.mode;
    process.env.SANDBOX_LINK_SECRET = env.secret;
    if (env.mode === undefined) delete process.env.SANDBOX_MODE;
    if (env.secret === undefined) delete process.env.SANDBOX_LINK_SECRET;
    await central.client.$disconnect();
  });

  const link = (claims: Record<string, unknown>, options: { expiresIn?: number; secret?: string; audience?: string } = {}) =>
    sign({ typ: 'sandbox-link', ...claims }, options.secret ?? LINK_SECRET, {
      algorithm: 'HS256',
      audience: options.audience ?? 'sandbox',
      expiresIn: options.expiresIn ?? 120,
    });

  it('issues links on live only, for organisations the person belongs to', async () => {
    process.env.SANDBOX_MODE = 'false';
    const alice = await auth.register({ email: `alice-${stamp}@example.com`, name: 'Alice', password: 'correct horse battery', companyName: `Alice Co ${stamp}` });
    const { token } = await auth.sandboxLink(alice.tenant.id, alice.user.id);
    expect(token.split('.')).toHaveLength(3);
    await expect(auth.sandboxLink('not-hers', alice.user.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(auth.acceptSandboxLink(token)).rejects.toBeInstanceOf(ForbiddenException);

    process.env.SANDBOX_MODE = 'true';
    await expect(auth.sandboxLink(alice.tenant.id, alice.user.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('opens the same person and organisation in the sandbox, with their live ids and role', async () => {
    process.env.SANDBOX_MODE = 'true';
    const claims = { uid: `u_${stamp}`, email: `Bob-${stamp}@Example.com`, name: 'Bob', tid: `t_${stamp}`, tname: 'Bob Ltd', tslug: `bob-${stamp}`, role: 'ADMIN' };
    const first = await auth.acceptSandboxLink(link(claims));
    expect(first).toMatchObject({ user: { id: claims.uid, email: `bob-${stamp}@example.com` }, tenant: { id: claims.tid, name: 'Bob Ltd', slug: claims.tslug }, role: 'ADMIN' });
    expect(first.accessToken).toBeTruthy();
    expect(tenantDb.createTenantDatabase).toHaveBeenCalledWith(claims.tid);

    // Switching again reuses the account, and the role follows live.
    tenantDb.createTenantDatabase.mockClear();
    const again = await auth.acceptSandboxLink(link({ ...claims, role: 'VIEWER' }));
    expect(again).toMatchObject({ user: { id: claims.uid }, tenant: { id: claims.tid }, role: 'VIEWER' });
    expect(tenantDb.createTenantDatabase).not.toHaveBeenCalled();
    const users = await central.client.user.count({ where: { email: `bob-${stamp}@example.com` } });
    expect(users).toBe(1);
  });

  it('refuses forged, expired and misdirected links', async () => {
    process.env.SANDBOX_MODE = 'true';
    const claims = { uid: `x_${stamp}`, email: `x-${stamp}@example.com`, name: 'X', tid: `tx_${stamp}`, tname: 'X', tslug: `x-${stamp}`, role: 'OWNER' };
    await expect(auth.acceptSandboxLink(link(claims, { secret: 'some-other-secret-of-at-least-32-chars' }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.acceptSandboxLink(link(claims, { expiresIn: -10 }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.acceptSandboxLink(link(claims, { audience: 'live' }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.acceptSandboxLink(sign({ ...claims, typ: 'access' }, LINK_SECRET, { algorithm: 'HS256', audience: 'sandbox', expiresIn: 120 }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await central.client.user.count({ where: { email: `x-${stamp}@example.com` } })).toBe(0);
  });
});
