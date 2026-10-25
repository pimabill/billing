import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { MemberRole, Tenant, User } from '../../generated/prisma-central/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { TenantDatabaseService } from '../../database/tenant-database.service';
import { EncryptionService } from '../../services/encryption.service';
import { permissionsOf } from '../../common/auth/permissions';
import { hashApiKey, lastFour } from '../../common/auth/api-keys';
import { derivedSecret, issuedBeforePasswordChange, passwordVersion } from '../../common/auth/tokens';
import { EmailService } from '../../services/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { isSandbox, sandboxLinkSecret } from '../../config/sandbox';
import { CLOUD_TIERS, cloudPlansEnabled } from '../cloud-plans/cloud-plans.catalogue';

/** What live vouches for when someone switches to the sandbox. */
interface SandboxLink {
  typ: 'sandbox-link';
  uid: string;
  email: string;
  name: string;
  tid: string;
  tname: string;
  tslug: string;
  role: MemberRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Session tokens name the organisation (`sub`, as before) and the person (`uid`). */
export interface SessionPayload {
  sub: string;
  uid?: string;
  email: string;
  typ?: 'access' | 'refresh';
  iat?: number;
}

const RESET_TTL_SECONDS = 60 * 60;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly centralPrisma: CentralPrismaService,
    private readonly tenantDb: TenantDatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly emailService: EmailService,
  ) {}

  private get db() {
    return this.centralPrisma.client;
  }

  /** A new person and their first organisation, which they own. */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) {
      throw new ConflictException('Email already registered. Sign in to create another organisation.');
    }
    const password = await argon2.hash(dto.password);
    const user = await this.db.user.create({ data: { email, name: dto.name, password } });
    try {
      const { tenant, apiKey } = await this.createOrganisation(user, dto.companyName);
      return { ...this.session(user, tenant, 'OWNER'), apiKey, ...this.generateTokens(tenant.id, user) };
    } catch (error) {
      await this.db.user.delete({ where: { id: user.id } }).catch(() => undefined);
      throw error;
    }
  }

  /** Another organisation for a signed-in person, who owns it. */
  async createAnotherOrganisation(userId: string, companyName: string) {
    const user = await this.activeUser(userId);
    const { tenant, apiKey } = await this.createOrganisation(user, companyName);
    return { ...this.session(user, tenant, 'OWNER'), apiKey, ...this.generateTokens(tenant.id, user) };
  }

  private async createOrganisation(user: User, companyName: string): Promise<{ tenant: Tenant; apiKey: string }> {
    let slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    if (!slug || (await this.db.tenant.findUnique({ where: { slug } }))) slug = `${slug || 'org'}-${Date.now().toString(36)}`;

    const apiKey = this.encryptionService.generateApiKey();
    const tenant = await this.db.tenant.create({
      data: {
        name: companyName,
        slug,
        email: user.email,
        apiKeyHash: hashApiKey(apiKey),
        apiKeyLast4: lastFour(apiKey),
        webhookSecret: this.encryptionService.generateWebhookSecret(),
        settings: { ownerName: user.name },
        // On the hosted cloud every organisation starts on Free; self-hosted ones have no plan.
        tenantBilling: { create: cloudPlansEnabled() ? { status: 'free', planId: 'cloud_free', planName: CLOUD_TIERS.free.name, limits: CLOUD_TIERS.free.limits as object } : { status: 'active' } },
        memberships: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
    try {
      await this.tenantDb.createTenantDatabase(tenant.id);
    } catch (error) {
      this.logger.error('Failed to create tenant database, cleaning up', error);
      await this.db.tenant.delete({ where: { id: tenant.id } });
      throw error;
    }
    return { tenant, apiKey };
  }

  /** Signs in to the organisation used last, or the one asked for. */
  async login(dto: LoginDto & { tenantId?: string }) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.db.user.findUnique({
      where: { email },
      include: { memberships: { include: { tenant: true }, orderBy: { updatedAt: 'desc' } } },
    });
    if (!user || !(await argon2.verify(user.password, dto.password))) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    const usable = user.memberships.filter((m) => m.tenant.isActive);
    const membership = (dto.tenantId && usable.find((m) => m.tenantId === dto.tenantId)) || usable[0];
    if (!membership) throw new UnauthorizedException('You are not a member of any active organisation');

    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.touch(membership.id);
    return { ...this.session(user, membership.tenant, membership.role), ...this.generateTokens(membership.tenantId, user) };
  }

  /** The signed-in person, their role here, and every organisation they can switch to. */
  async currentSession(tenantId: string, userId: string) {
    const user = await this.activeUser(userId);
    const membership = await this.db.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { tenant: true },
    });
    if (!membership) throw new UnauthorizedException('No longer a member of this organisation');
    return this.session(user, membership.tenant, membership.role, await this.organisations(userId));
  }

  async organisations(userId: string) {
    const memberships = await this.db.membership.findMany({
      where: { userId, tenant: { isActive: true } },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: { tenant: { name: 'asc' } },
    });
    return memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug, role: m.role }));
  }

  async switchOrganisation(userId: string, tenantId: string) {
    const user = await this.activeUser(userId);
    const membership = await this.db.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { tenant: true },
    });
    if (!membership || !membership.tenant.isActive) throw new ForbiddenException('You are not a member of that organisation');
    await this.touch(membership.id);
    return { ...this.session(user, membership.tenant, membership.role), ...this.generateTokens(tenantId, user) };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: SessionPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.typ !== undefined && payload.typ !== 'refresh') throw new UnauthorizedException('Invalid refresh token');
    // Sessions from before people had their own logins belong to the organisation's owner.
    const userId = payload.uid ?? (await this.ownerOf(payload.sub))?.id;
    if (!userId) throw new UnauthorizedException('Invalid refresh token');
    const user = await this.db.user.findUnique({ where: { id: userId } });
    const membership = await this.db.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: payload.sub } },
      include: { tenant: true },
    });
    if (!user?.isActive || !membership?.tenant.isActive) throw new UnauthorizedException('Invalid refresh token');
    if (issuedBeforePasswordChange(payload, user.passwordChangedAt)) throw new UnauthorizedException('Your session has ended. Please sign in again.');
    return this.generateTokens(payload.sub, user);
  }

  // --- Sandbox ---

  /** Live: a two-minute link that opens this person's account, in this organisation, on the sandbox. */
  async sandboxLink(tenantId: string, userId: string): Promise<{ token: string }> {
    const secret = sandboxLinkSecret();
    if (isSandbox() || !secret) throw new ForbiddenException('Switching to the sandbox is not set up on this deployment');
    const user = await this.activeUser(userId);
    const membership = await this.db.membership.findUnique({ where: { userId_tenantId: { userId, tenantId } }, include: { tenant: true } });
    if (!membership?.tenant.isActive) throw new ForbiddenException('You are not a member of that organisation');
    const link: SandboxLink = {
      typ: 'sandbox-link',
      uid: user.id,
      email: user.email,
      name: user.name,
      tid: membership.tenant.id,
      tname: membership.tenant.name,
      tslug: membership.tenant.slug,
      role: membership.role,
    };
    return { token: this.jwtService.sign(link, { secret, expiresIn: '2m', algorithm: 'HS256', audience: 'sandbox' }) };
  }

  /**
   * Sandbox: open the account a live link vouches for. The person and the
   * organisation keep their live ids, so switching back and forth lands in the
   * same place; their sandbox data is separate. The sandbox password is random:
   * people sign in on live and switch.
   */
  async acceptSandboxLink(token: string) {
    const secret = sandboxLinkSecret();
    if (!isSandbox() || !secret) throw new ForbiddenException('This deployment is not a sandbox');
    let link: SandboxLink;
    try {
      link = this.jwtService.verify<SandboxLink>(token, { secret, algorithms: ['HS256'], audience: 'sandbox' });
    } catch {
      throw new UnauthorizedException('This sandbox link is invalid or has expired; switch again');
    }
    if (link.typ !== 'sandbox-link') throw new UnauthorizedException('This sandbox link is invalid');

    const email = link.email.trim().toLowerCase();
    let user = await this.db.user.findUnique({ where: { email } });
    if (!user) {
      const password = await argon2.hash(randomBytes(32).toString('hex'));
      user = await this.db.user.create({ data: { id: link.uid, email, name: link.name, password } });
    }
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    let tenant = await this.db.tenant.findUnique({ where: { id: link.tid } });
    if (!tenant) {
      const slugTaken = await this.db.tenant.findUnique({ where: { slug: link.tslug } });
      const apiKey = this.encryptionService.generateApiKey();
      tenant = await this.db.tenant.create({
        data: {
          id: link.tid,
          name: link.tname,
          slug: slugTaken ? `${link.tslug}-${Date.now().toString(36)}` : link.tslug,
          email,
          apiKeyHash: hashApiKey(apiKey),
          apiKeyLast4: lastFour(apiKey),
          webhookSecret: this.encryptionService.generateWebhookSecret(),
          settings: { ownerName: link.name },
          tenantBilling: { create: { status: 'active' } },
        },
      });
      try {
        await this.tenantDb.createTenantDatabase(tenant.id);
      } catch (error) {
        this.logger.error('Failed to create the sandbox tenant database, cleaning up', error);
        await this.db.tenant.delete({ where: { id: tenant.id } });
        throw error;
      }
    }
    if (!tenant.isActive) throw new UnauthorizedException('This organisation is deactivated in the sandbox');

    const membership = await this.db.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      create: { userId: user.id, tenantId: tenant.id, role: link.role },
      // The role follows live, so a change there applies on the next switch.
      update: { role: link.role },
    });
    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { ...this.session(user, tenant, membership.role), ...this.generateTokens(tenant.id, user) };
  }

  // --- Invitations ---

  /** Join with an invitation: an existing person proves who they are with their password; a new one sets theirs. */
  async acceptInvitation(token: string, password: string, name?: string) {
    const invitation = await this.db.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { tenant: true } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date() || !invitation.tenant.isActive) {
      throw new BadRequestException('This invitation is invalid or has expired');
    }
    let user = await this.db.user.findUnique({ where: { email: invitation.email } });
    if (user) {
      if (!(await argon2.verify(user.password, password))) throw new UnauthorizedException('Wrong password for this email');
    } else {
      if (!name?.trim()) throw new BadRequestException('Your name is required');
      if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
      user = await this.db.user.create({ data: { email: invitation.email, name: name.trim(), password: await argon2.hash(password) } });
    }
    const claimed = await this.db.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) throw new BadRequestException('This invitation has already been used');
    const membership = await this.db.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: invitation.tenantId } },
      create: { userId: user.id, tenantId: invitation.tenantId, role: invitation.role },
      update: {},
    });
    return { ...this.session(user, invitation.tenant, membership.role), ...this.generateTokens(invitation.tenantId, user) };
  }

  async describeInvitation(token: string) {
    const invitation = await this.db.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { tenant: true } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) throw new NotFoundException('This invitation is invalid or has expired');
    const existingUser = Boolean(await this.db.user.findUnique({ where: { email: invitation.email }, select: { id: true } }));
    return { organisation: invitation.tenant.name, email: invitation.email, role: invitation.role, existingUser };
  }

  // --- Passwords ---

  /**
   * Emails a one-hour reset link. The token is signed with its own key and
   * names the current password version, so it stops working once used.
   * Never logged.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Don't reveal whether the email exists
    if (!user || !user.isActive) return;
    const resetToken = this.jwtService.sign(
      { sub: user.id, typ: 'password-reset', ver: passwordVersion(user.passwordChangedAt) },
      { secret: this.resetSecret(), expiresIn: RESET_TTL_SECONDS, algorithm: 'HS256' },
    );
    const dashboardUrl = (process.env.DASHBOARD_URL || 'http://localhost:4002').replace(/\/$/, '');
    const link = `${dashboardUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const sent = await this.emailService
      .sendHtml(
        user.email,
        'Reset your password',
        `<p>Someone asked to reset the password for this account.</p><p><a href="${link}">Choose a new password</a> (valid for one hour).</p><p>If this wasn't you, you can ignore this email.</p>`,
      )
      .catch((error: Error) => {
        this.logger.warn(`Password reset email for user ${user.id} not sent: ${error.message}`);
        return false;
      });
    if (!sent) this.logger.warn(`Password reset requested for user ${user.id}, but no email could be sent (check SMTP settings)`);
  }

  /** Sets the new password and ends every existing session for the person. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    let payload: { sub: string; typ?: string; ver?: number };
    try {
      payload = this.jwtService.verify(token, { secret: this.resetSecret(), algorithms: ['HS256'] });
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (payload.typ !== 'password-reset' || typeof payload.ver !== 'number') throw new BadRequestException('Invalid reset token');
    const user = await this.db.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || passwordVersion(user.passwordChangedAt) !== payload.ver) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    // Compare-and-set on the password version, so the same link cannot be used twice, even concurrently.
    const updated = await this.db.user.updateMany({
      where: { id: user.id, passwordChangedAt: user.passwordChangedAt },
      data: { password: await argon2.hash(newPassword), passwordChangedAt: new Date() },
    });
    if (updated.count === 0) throw new BadRequestException('Invalid or expired reset token');
  }

  private resetSecret(): string {
    return derivedSecret(this.configService.get<string>('JWT_SECRET')!, 'password-reset');
  }

  // --- Helpers ---

  private session(user: User, tenant: Tenant, role: MemberRole, organisations?: Awaited<ReturnType<AuthService['organisations']>>) {
    // Access and operator state are for the platform; the dashboard reads them from /admin/me.
    // Credentials never go into a session: any member could read them. The API
    // key is shown once at creation; the webhook secret is in developer settings.
    const {
      password: _password,
      apiKey: _apiKey,
      apiKeyHash: _apiKeyHash,
      apiKeyLast4: _apiKeyLast4,
      webhookSecret: _webhookSecret,
      isPlatformOperator: _operator,
      accessMode: _mode,
      accessReason: _reason,
      accessUrl: _url,
      ...org
    } = tenant;
    return {
      // Kept for older dashboards, which read the organisation from here.
      tenant: org,
      user: { id: user.id, name: user.name, email: user.email },
      role,
      permissions: permissionsOf(role),
      ...(organisations && { organisations }),
    };
  }

  private async activeUser(userId: string): Promise<User> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) throw new UnauthorizedException('Account is deactivated');
    return user;
  }

  private ownerOf(tenantId: string) {
    return this.db.user.findFirst({ where: { memberships: { some: { tenantId, role: 'OWNER' } } }, orderBy: { createdAt: 'asc' } });
  }

  /** Remember the organisation used last, so sign-in returns to it. */
  private async touch(membershipId: string) {
    await this.db.membership.update({ where: { id: membershipId }, data: { updatedAt: new Date() } });
  }

  private generateTokens(tenantId: string, user: Pick<User, 'id' | 'email'>): TokenPair {
    const payload: SessionPayload = { sub: tenantId, uid: user.id, email: user.email };
    const accessToken = this.jwtService.sign({ ...payload, typ: 'access' }, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '1h') as never,
      algorithm: 'HS256',
    });
    const refreshToken = this.jwtService.sign({ ...payload, typ: 'refresh' }, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d') as never,
      algorithm: 'HS256',
    });
    return { accessToken, refreshToken };
  }
}
