import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { base32Encode, currentStep, generateRecoveryCodes, totpAt, verifyTotp } from '../../../src/common/auth/totp';
import { MfaService } from '../../../src/modules/auth/mfa.service';
import { AuthService } from '../../../src/modules/auth/auth.service';

const SECRET = 'z'.repeat(48);
// Plain-text "encryption", so the tests can read what is stored.
const encryption = { encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v.replace(/^enc:/, '') };
const config = { get: (k: string, fallback?: unknown) => (k === 'JWT_SECRET' || k === 'JWT_REFRESH_SECRET' ? SECRET : fallback) };

describe('TOTP', () => {
  it('matches the RFC 6238 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    // 59 seconds after the epoch: 94287082 in eight digits, so 287082 in six.
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
  });

  it('accepts the neighbouring step for clock drift, and refuses a step already used', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = Date.now();
    const step = currentStep(now);
    expect(verifyTotp(secret, totpAt(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step - 3), null, now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', null, now)).toBeNull();
  });

  it('makes distinct recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});

describe('two-step sign-in', () => {
  let user: any;
  let db: any;
  let mfa: MfaService;
  let auth: AuthService;

  beforeEach(() => {
    user = { id: 'u1', email: 'a@example.com', password: 'hash', isActive: true, passwordChangedAt: null, mfaSecret: null, mfaPendingSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: [], mfaLastStep: null };
    const tenant = { id: 't1', name: 'Acme', isActive: true, settings: {} };
    db = {
      user: {
        findUnique: jest.fn(async () => user),
        update: jest.fn(async (args: any) => (user = { ...user, ...args.data })),
        // Compare-and-set, as Postgres would.
        updateMany: jest.fn(async (args: any) => {
          const w = args.where;
          if (w.OR && !(user.mfaLastStep === null || user.mfaLastStep < w.OR[1].mfaLastStep.lt)) return { count: 0 };
          if (w.mfaRecoveryCodes && !user.mfaRecoveryCodes.includes(w.mfaRecoveryCodes.has)) return { count: 0 };
          user = { ...user, ...args.data };
          return { count: 1 };
        }),
      },
      membership: {
        findMany: jest.fn(async () => [{ tenant }]),
        findUnique: jest.fn(async () => ({ id: 'm1', tenantId: 't1', role: 'OWNER', tenant })),
        update: jest.fn(async () => ({})),
      },
    };
    mfa = new MfaService({ client: db } as any, encryption as any, new JwtService(), config as any);
    auth = new AuthService({ client: db } as any, {} as any, new JwtService(), config as any, encryption as any, {} as any, mfa);
  });

  const turnOn = async () => {
    const { secret } = await mfa.setup('u1');
    const { recoveryCodes } = await mfa.enable('u1', totpAt(secret, currentStep()));
    return { secret, recoveryCodes };
  };

  it('turns on only with a working code, keeps the secret encrypted and the recovery codes hashed', async () => {
    const { secret } = await mfa.setup('u1');
    await expect(mfa.enable('u1', '000000')).rejects.toThrow();
    const { recoveryCodes } = await mfa.enable('u1', totpAt(secret, currentStep()));
    expect(user.mfaEnabledAt).toBeInstanceOf(Date);
    expect(user.mfaSecret).toBe(`enc:${secret}`);
    expect(user.mfaRecoveryCodes).toHaveLength(10);
    expect(user.mfaRecoveryCodes).not.toContain(recoveryCodes[0]);
  });

  it('does not reuse a code, and spends each recovery code once', async () => {
    const { secret, recoveryCodes } = await turnOn();
    // The enabling code's step is spent; the next step works once.
    const next = totpAt(secret, currentStep() + 1);
    await expect(mfa.check(user, next)).resolves.toBeUndefined();
    await expect(mfa.check(user, next)).rejects.toThrow(UnauthorizedException);

    await expect(mfa.check(user, recoveryCodes[0].toUpperCase())).resolves.toBeUndefined();
    expect(user.mfaRecoveryCodes).toHaveLength(9);
    await expect(mfa.check(user, recoveryCodes[0])).rejects.toThrow(UnauthorizedException);
  });

  it('asks for a code after the password, and signs in once it is given', async () => {
    const { recoveryCodes } = await turnOn();
    db.user.findUnique.mockImplementation(async () => ({ ...user, memberships: [{ id: 'm1', tenantId: 't1', role: 'OWNER', tenant: { id: 't1', name: 'Acme', isActive: true, settings: {} } }] }));
    jest.spyOn(require('argon2'), 'verify').mockResolvedValue(true as never);

    const first = await auth.login({ email: 'a@example.com', password: 'pw' });
    expect(first).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(first).not.toHaveProperty('accessToken');

    await expect(auth.completeMfaSignIn((first as any).mfaToken, 'wrong-code')).rejects.toThrow(UnauthorizedException);
    const done = await auth.completeMfaSignIn((first as any).mfaToken, recoveryCodes[1]);
    expect(done).toHaveProperty('accessToken');
    expect(done).toMatchObject({ mfa: { enabled: true, required: false } });
  });

  it('will not turn off while an organisation requires it', async () => {
    const { secret } = await turnOn();
    db.membership.findMany.mockResolvedValue([{ tenant: { name: 'Acme', settings: { requireMfa: true } } }]);
    jest.spyOn(require('argon2'), 'verify').mockResolvedValue(true as never);
    await expect(mfa.disable('u1', 'pw', totpAt(secret, currentStep() + 1))).rejects.toThrow(/Acme requires/);
  });

  it('refuses a sign-in challenge signed for another purpose', () => {
    const forged = new JwtService().sign({ typ: 'mfa', uid: 'u1', tid: 't1' }, { secret: SECRET });
    expect(() => mfa.readChallenge(forged)).toThrow(UnauthorizedException);
  });
});
