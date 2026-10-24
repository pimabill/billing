/**
 * People, roles and organisations against a real central database.
 *
 * Skipped unless CENTRAL_TEST_DATABASE_URL points at a migrated central database:
 *   CENTRAL_DATABASE_URL=$URL npx prisma migrate deploy --config prisma.config.ts
 *   CENTRAL_TEST_DATABASE_URL=$URL npx jest test/integration/team --runInBand
 */
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { sign } from 'jsonwebtoken';
import { AuthService } from '../../src/modules/auth/auth.service';
import { TeamService } from '../../src/modules/team/team.service';
import { TenantGuard } from '../../src/common/guards/tenant.guard';
import { PERMISSION_KEY } from '../../src/common/auth/permissions';
import { CentralPrismaService } from '../../src/database/central-prisma.service';
import { expectResponseShape } from '../helpers/openapi-schema';

const url = process.env.CENTRAL_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const SECRET = 'test-access-secret';
const config = {
  get: (key: string, fallback?: string) =>
    ({ CENTRAL_DATABASE_URL: url, JWT_SECRET: SECRET, JWT_REFRESH_SECRET: 'test-refresh-secret' })[key] ?? fallback,
};

/** Stand-in routes: a read, a plain write, and writes needing particular permissions. */
class Routes {
  list() {}
  create() {}
  providers() {}
  apiKeys() {}
}
Reflect.defineMetadata(PERMISSION_KEY, 'settings.providers', Routes.prototype.providers);
Reflect.defineMetadata(PERMISSION_KEY, 'settings.developer', Routes.prototype.apiKeys);

describeDb('team access (postgres)', () => {
  const central = new CentralPrismaService(config as never);
  const tenantDb = { createTenantDatabase: jest.fn(), getTenantClient: jest.fn(async () => ({})) };
  const encryption = { generateApiKey: () => `sk_live_${Math.random().toString(36).slice(2)}`, generateWebhookSecret: () => 'whsec' };
  const auth = new AuthService(central, tenantDb as never, new JwtService(), config as never, encryption as never, { sendHtml: jest.fn().mockResolvedValue(true) } as never);
  const email = { sendHtml: jest.fn(async () => false) };
  const team = new TeamService(central, email as never);
  const guard = new TenantGuard(central, tenantDb as never, config as never, new Reflector());

  /** Run the guard for a request with this token against one of the stand-in routes. */
  const call = async (token: string, method: string, route: keyof Routes) => {
    const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` }, method };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => Routes.prototype[route],
      getClass: () => Routes,
    } as unknown as ExecutionContext;
    await guard.canActivate(context);
    return req as { member?: { role: string; userId: string }; tenant: { id: string } };
  };

  let alice: Awaited<ReturnType<AuthService['register']>>;

  beforeAll(async () => {
    await central.client.$executeRawUnsafe('TRUNCATE "Invitation", "Membership", "User", "TenantBilling", "Tenant" CASCADE');
    alice = await auth.register({ name: 'Alice', email: 'Alice@Example.com', password: 'alice-pass-1', companyName: 'Rapcio' });
  });
  afterAll(() => central.client.$disconnect());

  it('makes the registering person the owner of their new organisation', async () => {
    expect(alice).toMatchObject({ role: 'OWNER', user: { email: 'alice@example.com', name: 'Alice' }, tenant: { name: 'Rapcio' } });
    expect(alice.permissions).toEqual(expect.arrayContaining(['team.manage', 'settings.providers', 'money.approve']));
    expect(alice.tenant).not.toHaveProperty('password');
    // Credentials are never part of a session any member can read.
    expect(alice.tenant).not.toHaveProperty('apiKey');
    expect(alice.tenant).not.toHaveProperty('apiKeyHash');
    expect(alice.tenant).not.toHaveProperty('webhookSecret');
    const req = await call(alice.accessToken, 'POST', 'providers');
    expect(req.member).toMatchObject({ role: 'OWNER' });
    await expect(auth.register({ name: 'X', email: 'alice@example.com', password: 'whatever-1', companyName: 'Other' })).rejects.toThrow(/already registered/);
  });

  it('lets invited people in with the role they were given, and holds them to it', async () => {
    const owner = { userId: alice.user.id, email: alice.user.email, name: 'Alice', role: 'OWNER' as const };
    const invite = await team.invite({ id: alice.tenant.id, name: 'Rapcio' }, owner, 'bob@example.com', 'VIEWER', 'https://app.example.com');
    expect(invite).toMatchObject({ email: 'bob@example.com', role: 'VIEWER', emailed: false });
    const token = invite.acceptUrl.split('/invite/')[1];
    expect(await auth.describeInvitation(token)).toEqual({ organisation: 'Rapcio', email: 'bob@example.com', role: 'VIEWER', existingUser: false });

    const bob = await auth.acceptInvitation(token, 'bob-pass-123', 'Bob');
    expect(bob).toMatchObject({ role: 'VIEWER', tenant: { id: alice.tenant.id } });
    await expect(auth.acceptInvitation(token, 'bob-pass-123', 'Bob')).rejects.toThrow(/invalid or has expired/);

    await expect(call(bob.accessToken, 'GET', 'list')).resolves.toBeDefined();
    await expect(call(bob.accessToken, 'POST', 'create')).rejects.toBeInstanceOf(ForbiddenException);

    await team.changeRole(alice.tenant.id, owner, bob.user.id, 'FINANCE');
    // Roles are read on every request, so the change applies to the token Bob already has.
    await expect(call(bob.accessToken, 'POST', 'create')).resolves.toBeDefined();
    await expect(call(bob.accessToken, 'POST', 'providers')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(call(bob.accessToken, 'POST', 'apiKeys')).rejects.toBeInstanceOf(ForbiddenException);

    await team.changeRole(alice.tenant.id, owner, bob.user.id, 'DEVELOPER');
    await expect(call(bob.accessToken, 'POST', 'apiKeys')).resolves.toBeDefined();
    await expect(call(bob.accessToken, 'POST', 'create')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps owners in charge of owners and never leaves an organisation without one', async () => {
    const owner = { userId: alice.user.id, email: alice.user.email, name: 'Alice', role: 'OWNER' as const };
    const bob = (await team.members(alice.tenant.id)).find((m) => m.email === 'bob@example.com')!;
    await team.changeRole(alice.tenant.id, owner, bob.userId, 'ADMIN');
    const admin = { userId: bob.userId, email: bob.email, name: 'Bob', role: 'ADMIN' as const };

    await expect(team.invite({ id: alice.tenant.id, name: 'Rapcio' }, admin, 'carol@example.com', 'OWNER', 'https://x')).rejects.toThrow(/Only an owner/);
    await expect(team.changeRole(alice.tenant.id, admin, alice.user.id, 'VIEWER')).rejects.toThrow(/Only an owner/);
    await expect(team.remove(alice.tenant.id, admin, alice.user.id)).rejects.toThrow(/Only an owner/);
    await expect(team.remove(alice.tenant.id, owner, alice.user.id)).rejects.toThrow(/at least one owner/);
    await expect(team.invite({ id: alice.tenant.id, name: 'Rapcio' }, owner, 'BOB@example.com', 'VIEWER', 'https://x')).rejects.toThrow(/already a member/);
  });

  it('shuts a removed member out at once, even with a valid token', async () => {
    const owner = { userId: alice.user.id, email: alice.user.email, name: 'Alice', role: 'OWNER' as const };
    const dave = await auth.acceptInvitation(
      (await team.invite({ id: alice.tenant.id, name: 'Rapcio' }, owner, 'dave@example.com', 'FINANCE', 'https://x')).acceptUrl.split('/invite/')[1],
      'dave-pass-123',
      'Dave',
    );
    await expect(call(dave.accessToken, 'GET', 'list')).resolves.toBeDefined();
    await team.remove(alice.tenant.id, owner, dave.user.id);
    await expect(call(dave.accessToken, 'GET', 'list')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.refreshTokens(dave.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets one person own several organisations and switch between them', async () => {
    const second = await auth.createAnotherOrganisation(alice.user.id, 'Cybroid Labs');
    expect(second).toMatchObject({ role: 'OWNER', tenant: { name: 'Cybroid Labs' } });
    expect((await auth.organisations(alice.user.id)).map((o) => o.name)).toEqual(['Cybroid Labs', 'Rapcio']);

    const inSecond = await call(second.accessToken, 'GET', 'list');
    expect(inSecond.tenant.id).toBe(second.tenant.id);
    const back = await auth.switchOrganisation(alice.user.id, alice.tenant.id);
    expect((await call(back.accessToken, 'GET', 'list')).tenant.id).toBe(alice.tenant.id);

    // Bob belongs to Rapcio only.
    const bob = (await team.members(alice.tenant.id)).find((m) => m.email === 'bob@example.com')!;
    await expect(auth.switchOrganisation(bob.userId, second.tenant.id)).rejects.toBeInstanceOf(ForbiddenException);

    // Sign-in returns to the organisation used last, or the one asked for.
    expect((await auth.login({ email: 'alice@example.com', password: 'alice-pass-1' })).tenant.id).toBe(alice.tenant.id);
    expect((await auth.login({ email: 'alice@example.com', password: 'alice-pass-1', tenantId: second.tenant.id })).tenant.id).toBe(second.tenant.id);
    const session = await auth.currentSession(second.tenant.id, alice.user.id);
    expect(session.organisations).toHaveLength(2);
  });

  it('treats sessions from before personal logins as the owner, and API keys as before', async () => {
    const legacy = sign({ sub: alice.tenant.id, email: 'alice@example.com' }, SECRET);
    expect((await call(legacy, 'POST', 'providers')).member).toMatchObject({ role: 'OWNER', userId: alice.user.id });
    const viaKey = await call(alice.apiKey, 'POST', 'providers');
    expect(viaKey.member).toBeUndefined();
    expect(viaKey.tenant.id).toBe(alice.tenant.id);
  });

  it('rejects wrong passwords and existing people who cannot prove it is them', async () => {
    await expect(auth.login({ email: 'alice@example.com', password: 'nope' })).rejects.toBeInstanceOf(UnauthorizedException);
    const owner = { userId: alice.user.id, email: alice.user.email, name: 'Alice', role: 'OWNER' as const };
    const second = (await auth.organisations(alice.user.id)).find((o) => o.name === 'Cybroid Labs')!;
    const invite = await team.invite({ id: second.id, name: second.name }, owner, 'bob@example.com', 'VIEWER', 'https://x');
    const token = invite.acceptUrl.split('/invite/')[1];
    expect((await auth.describeInvitation(token)).existingUser).toBe(true);
    await expect(auth.acceptInvitation(token, 'not-bobs-password')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await auth.acceptInvitation(token, 'bob-pass-123')).toMatchObject({ role: 'VIEWER', tenant: { id: second.id } });
  });

  it('returns what the API spec describes', async () => {
    const owner = { userId: alice.user.id, email: alice.user.email, name: 'Alice', role: 'OWNER' as const };
    expectResponseShape(alice, 'RegisterResponse');
    expectResponseShape(await auth.login({ email: 'alice@example.com', password: 'alice-pass-1' }), 'LoginResponse');
    expectResponseShape(await auth.currentSession(alice.tenant.id, alice.user.id), 'SessionResponse');
    const invite = await team.invite({ id: alice.tenant.id, name: 'Rapcio' }, owner, 'dana@example.com', 'DEVELOPER', 'https://app.example.com');
    expectResponseShape(invite, 'SentInvitationResponse');
    expectResponseShape(await auth.describeInvitation(invite.acceptUrl.split('/invite/')[1]), 'InvitationInfoResponse');
    for (const i of await team.invitations(alice.tenant.id)) expectResponseShape(i, 'InvitationResponse');
    for (const m of await team.members(alice.tenant.id)) expectResponseShape(m, 'TeamMemberResponse');
  });
});
