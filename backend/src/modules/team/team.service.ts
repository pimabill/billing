import { escapeHtml } from '../../common/utils/escape-html';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MemberRole } from '../../generated/prisma-central/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { EmailService } from '../../services/email.service';
import { hashToken } from '../auth/auth.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Actor {
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
}

/**
 * Members of an organisation. Owners and admins manage the team; only an
 * owner can make or unmake owners, and an organisation always keeps at
 * least one owner.
 */
@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly centralPrisma: CentralPrismaService,
    private readonly email: EmailService,
  ) {}

  private get db() {
    return this.centralPrisma.client;
  }

  async members(tenantId: string) {
    const rows = await this.db.membership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true, isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      active: m.user.isActive,
      lastLoginAt: m.user.lastLoginAt,
      joinedAt: m.createdAt,
    }));
  }

  async invitations(tenantId: string) {
    const rows = await this.db.invitation.findMany({
      where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((i) => ({ id: i.id, email: i.email, role: i.role, invitedBy: i.invitedBy, expiresAt: i.expiresAt, createdAt: i.createdAt }));
  }

  /**
   * The link carries a one-time token stored only as a hash. It is emailed
   * when the organisation (or platform) has SMTP set up, and returned so the
   * inviter can share it either way.
   */
  async invite(tenant: { id: string; name: string }, actor: Actor, emailAddress: string, role: MemberRole, dashboardUrl: string) {
    this.assertCanAssign(actor, role);
    const email = emailAddress.trim().toLowerCase();
    const existing = await this.db.membership.findFirst({ where: { tenantId: tenant.id, user: { email } } });
    if (existing) throw new ConflictException(`${email} is already a member`);

    const token = randomBytes(32).toString('base64url');
    // A new invitation replaces any open one for the same address.
    await this.db.invitation.deleteMany({ where: { tenantId: tenant.id, email, acceptedAt: null } });
    const invitation = await this.db.invitation.create({
      data: { tenantId: tenant.id, email, role, tokenHash: hashToken(token), invitedBy: actor.email, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    const acceptUrl = `${dashboardUrl.replace(/\/$/, '')}/invite/${token}`;
    const emailed = await this.email
      .sendHtml(
        email,
        `${actor.name} invited you to ${tenant.name}`,
        `<p>${escapeHtml(actor.name)} invited you to join <b>${escapeHtml(tenant.name)}</b> as ${role.toLowerCase()}.</p><p><a href="${acceptUrl}">Accept the invitation</a> (valid for 7 days).</p>`,
        tenant.id,
      )
      .catch((error: Error) => {
        this.logger.warn(`Invitation email to ${email} not sent: ${error.message}`);
        return false;
      });
    return { id: invitation.id, email, role, expiresAt: invitation.expiresAt, acceptUrl, emailed };
  }

  async revokeInvitation(tenantId: string, id: string) {
    const removed = await this.db.invitation.deleteMany({ where: { id, tenantId, acceptedAt: null } });
    if (removed.count === 0) throw new NotFoundException('Invitation not found');
  }

  async changeRole(tenantId: string, actor: Actor, userId: string, role: MemberRole) {
    const target = await this.membership(tenantId, userId);
    if (target.role === role) return;
    this.assertCanAssign(actor, role);
    this.assertCanManage(actor, target.role);
    if (target.role === 'OWNER') await this.assertAnotherOwner(tenantId, userId);
    await this.db.membership.update({ where: { id: target.id }, data: { role } });
  }

  /** Remove a member, or leave (userId = yourself). */
  async remove(tenantId: string, actor: Actor, userId: string) {
    const target = await this.membership(tenantId, userId);
    if (userId !== actor.userId) this.assertCanManage(actor, target.role);
    if (target.role === 'OWNER') await this.assertAnotherOwner(tenantId, userId);
    await this.db.membership.delete({ where: { id: target.id } });
  }

  private async membership(tenantId: string, userId: string) {
    const m = await this.db.membership.findUnique({ where: { userId_tenantId: { userId, tenantId } } });
    if (!m) throw new NotFoundException('Member not found');
    return m;
  }

  private assertCanAssign(actor: Actor, role: MemberRole) {
    if (role === 'OWNER' && actor.role !== 'OWNER') throw new ForbiddenException('Only an owner can make someone an owner');
  }

  private assertCanManage(actor: Actor, targetRole: MemberRole) {
    if (targetRole === 'OWNER' && actor.role !== 'OWNER') throw new ForbiddenException('Only an owner can change or remove an owner');
  }

  private async assertAnotherOwner(tenantId: string, userId: string) {
    const others = await this.db.membership.count({ where: { tenantId, role: 'OWNER', userId: { not: userId } } });
    if (others === 0) throw new BadRequestException('An organisation needs at least one owner. Make someone else an owner first.');
  }
}
