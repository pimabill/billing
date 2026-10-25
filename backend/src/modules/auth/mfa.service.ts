import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { User } from '../../generated/prisma-central/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { EncryptionService } from '../../services/encryption.service';
import { derivedSecret } from '../../common/auth/tokens';
import { generateRecoveryCodes, generateTotpSecret, normaliseRecoveryCode, otpauthUrl, verifyTotp } from '../../common/auth/totp';
import { getBrand } from '../../config/brand';
import { requiresMfa } from '../../common/auth/mfa-policy';

/** What a password sign-in leaves to finish with a code: who, and which organisation. */
interface MfaChallenge {
  typ: 'mfa';
  uid: string;
  tid: string;
}

const CHALLENGE_TTL = '5m';
const hashToken = (code: string) => createHash('sha256').update(code).digest('hex');


/**
 * Two-step sign-in with an authenticator app. Turning it on takes a code
 * from the app (so the secret is known to be saved there) and returns ten
 * one-time recovery codes. Sign-in with a password then needs a code or a
 * recovery code.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly central: CentralPrismaService,
    private readonly encryption: EncryptionService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get db() {
    return this.central.client;
  }

  private get challengeSecret() {
    return derivedSecret(this.config.get<string>('JWT_SECRET')!, 'mfa');
  }

  async status(userId: string) {
    const user = await this.user(userId);
    return { enabled: Boolean(user.mfaEnabledAt), enabledAt: user.mfaEnabledAt, recoveryCodesLeft: user.mfaRecoveryCodes.length };
  }

  /** A new secret to add to the app; nothing changes until it is confirmed with a code. */
  async setup(userId: string) {
    const user = await this.user(userId);
    if (user.mfaEnabledAt) throw new BadRequestException('Two-step sign-in is already on; turn it off first to use a new device');
    const secret = generateTotpSecret();
    await this.db.user.update({ where: { id: user.id }, data: { mfaPendingSecret: this.encryption.encrypt(secret) } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email, getBrand().name) };
  }

  /** Confirm the app works; returns the recovery codes, shown this once. */
  async enable(userId: string, code: string) {
    const user = await this.user(userId);
    if (user.mfaEnabledAt) throw new BadRequestException('Two-step sign-in is already on');
    if (!user.mfaPendingSecret) throw new BadRequestException('Start setting up two-step sign-in first');
    const secret = this.encryption.decrypt(user.mfaPendingSecret);
    const step = verifyTotp(secret, code);
    if (step === null) throw new BadRequestException('That code is not right. Check the time on your phone and try the newest code.');
    const recoveryCodes = generateRecoveryCodes();
    await this.db.user.update({
      where: { id: user.id },
      data: {
        mfaSecret: user.mfaPendingSecret,
        mfaPendingSecret: null,
        mfaEnabledAt: new Date(),
        mfaLastStep: step,
        mfaRecoveryCodes: recoveryCodes.map(hashToken),
      },
    });
    return { recoveryCodes };
  }

  /** Turning it off takes the password and a code, and is refused while an organisation requires it. */
  async disable(userId: string, password: string, code: string) {
    const user = await this.user(userId);
    if (!user.mfaEnabledAt) return;
    // 400, not 401: a wrong password here must not read as an expired session.
    if (!(await argon2.verify(user.password, password))) throw new BadRequestException('Wrong password');
    const requiring = await this.db.membership.findMany({ where: { userId }, include: { tenant: { select: { name: true, settings: true } } } });
    const names = requiring.filter((m) => requiresMfa(m.tenant.settings)).map((m) => m.tenant.name);
    if (names.length) throw new ForbiddenException(`${names.join(', ')} require${names.length === 1 ? 's' : ''} two-step sign-in, so it cannot be turned off`);
    await this.confirm(user, code);
    await this.db.user.update({ where: { id: user.id }, data: { mfaSecret: null, mfaPendingSecret: null, mfaEnabledAt: null, mfaLastStep: null, mfaRecoveryCodes: [] } });
  }

  async regenerateRecoveryCodes(userId: string, code: string) {
    const user = await this.user(userId);
    if (!user.mfaEnabledAt) throw new BadRequestException('Two-step sign-in is off');
    await this.confirm(user, code);
    const recoveryCodes = generateRecoveryCodes();
    await this.db.user.update({ where: { id: user.id }, data: { mfaRecoveryCodes: recoveryCodes.map(hashToken) } });
    return { recoveryCodes };
  }

  /**
   * A code from the app, or a recovery code (each works once). Codes are
   * spent atomically, so two requests with the same code cannot both pass.
   */
  async check(user: User, code: string | undefined): Promise<void> {
    const given = (code ?? '').trim();
    if (!given || !user.mfaSecret) throw new UnauthorizedException({ message: 'Enter the code from your authenticator app', code: 'MFA_REQUIRED' });
    if (/^\d[\d\s]*$/.test(given)) {
      const step = verifyTotp(this.encryption.decrypt(user.mfaSecret), given, user.mfaLastStep);
      if (step !== null) {
        const spent = await this.db.user.updateMany({
          where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
          data: { mfaLastStep: step },
        });
        if (spent.count === 1) return;
      }
    } else {
      const hash = hashToken(normaliseRecoveryCode(given));
      if (user.mfaRecoveryCodes.includes(hash)) {
        const spent = await this.db.user.updateMany({
          where: { id: user.id, mfaRecoveryCodes: { has: hash } },
          data: { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((h) => h !== hash) },
        });
        if (spent.count === 1) return;
      }
    }
    throw new UnauthorizedException({ message: 'That code is not right', code: 'MFA_INVALID' });
  }

  /** A code from someone already signed in: a wrong one is a 400, so it does not end their session. */
  private async confirm(user: User, code: string) {
    try {
      await this.check(user, code);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw new BadRequestException('That code is not right');
      throw error;
    }
  }

  /** After the password: a five-minute token to finish signing in with a code. */
  challenge(userId: string, tenantId: string): string {
    const payload: MfaChallenge = { typ: 'mfa', uid: userId, tid: tenantId };
    return this.jwt.sign(payload, { secret: this.challengeSecret, expiresIn: CHALLENGE_TTL, algorithm: 'HS256' });
  }

  readChallenge(token: string): MfaChallenge {
    try {
      const payload = this.jwt.verify<MfaChallenge>(token, { secret: this.challengeSecret, algorithms: ['HS256'] });
      if (payload.typ !== 'mfa' || !payload.uid || !payload.tid) throw new Error('wrong token');
      return payload;
    } catch {
      throw new UnauthorizedException('Your sign-in took too long; enter your password again');
    }
  }

  /** Require two-step sign-in for everyone in the organisation; whoever turns it on must use it already. */
  async setOrganisationRequirement(tenantId: string, userId: string, required: boolean) {
    const user = await this.user(userId);
    if (required && !user.mfaEnabledAt) throw new BadRequestException('Turn on two-step sign-in for yourself first');
    const tenant = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
    const settings = { ...((tenant.settings ?? {}) as Record<string, unknown>), requireMfa: required };
    await this.db.tenant.update({ where: { id: tenantId }, data: { settings: settings as never } });
    const members = await this.db.membership.findMany({ where: { tenantId }, include: { user: { select: { mfaEnabledAt: true } } } });
    return { required, membersWithout: members.filter((m) => !m.user.mfaEnabledAt).length };
  }

  private async user(userId: string): Promise<User> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) throw new UnauthorizedException('Account is deactivated');
    return user;
  }
}
