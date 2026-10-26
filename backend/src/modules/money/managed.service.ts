import { BadRequestException, ForbiddenException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { EmailService } from '../../services/email.service';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { EncryptionService } from '../../services/encryption.service';
import { ManagedAccount, ManagedCredentials, managedConfig, ManagedPaymentsClient, OpenManagedAccount, UpdateManagedAccount } from './adapters/managed.adapter';
import { notificationUrls } from './notification-urls';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { cloudPlansEnabled } from '../cloud-plans/cloud-plans.catalogue';

/** Lowest priority, so a tenant's own provider accounts are always preferred when it has them. */
const MANAGED_PRIORITY = 1000;

/** What the managed connection stores beside the account id. */
export interface StoredManaged extends ManagedCredentials {
  status?: ManagedAccount['status'];
  statusChangedAt?: string;
  reason?: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface StatusContext {
  org: string;
  reason?: string;
  fee: string | null;
}

/** What to tell people about a status; null for one we do not know (it came from a notification). */
function statusMessage(status: string, { org, reason, fee }: StatusContext): { title: string; body: string[] } | null {
  switch (status) {
    case 'active':
      return {
        title: `Managed payments are on for ${org}`,
        body: [
          'Your application is approved. Invoice checkouts, renewals, portal payments and payment links can now be paid through managed payments, by card or mobile money.',
          ...(fee ? [`Our fee is ${fee} per payment, on top of the payment provider's own fee, taken before each payout.`] : []),
          'Payouts go to the destination you gave us; you can change it any time on the managed payments page.',
        ],
      };
    case 'rejected':
      return {
        title: `Managed payments for ${org} were not approved`,
        body: [reason ? `The reason given: ${reason}` : 'We could not approve the application.', 'Reply to this email if you think this is a mistake, or connect your own payment provider in Settings → Payment providers.'],
      };
    case 'suspended':
      return {
        title: `Managed payments for ${org} are paused`,
        body: [
          reason ? `The reason given: ${reason}` : 'Managed payments are paused on your account.',
          'Payments through managed payments are paused until this is resolved; payments through your own providers are not affected. Reply to this email to resolve it.',
        ],
      };
    default:
      return null;
  }
}

/**
 * Tenant side of managed payments: opening the tenant's managed account
 * and keeping its stored connection in step with the account's status.
 * The connection is active only while the account is.
 */
@Injectable()
export class ManagedAccountsService {
  private readonly logger = new Logger(ManagedAccountsService.name);

  constructor(
    private readonly encryption: EncryptionService,
    private readonly central: CentralPrismaService,
    @Optional() private readonly email?: EmailService,
  ) {}

  /**
   * Managed payments are a hosted-cloud service: offered to organisations on a
   * cloud plan (and to the operator). A self-hosted deployment has no managed
   * payments key, so it never gets here.
   */
  async allowedFor(tenantId: string): Promise<boolean> {
    if (!managedConfig()) return false;
    const tenant = await this.central.client.tenant.findUnique({
      where: { id: tenantId },
      select: { isPlatformOperator: true, tenantBilling: { select: { planId: true } } },
    });
    if (!tenant) return false;
    if (tenant.isPlatformOperator || !cloudPlansEnabled()) return true;
    return Boolean(tenant.tenantBilling?.planId?.startsWith('cloud_'));
  }

  private client(): ManagedPaymentsClient {
    const config = managedConfig();
    if (!config) throw new ServiceUnavailableException('Managed payments are not available on this deployment');
    return new ManagedPaymentsClient(config);
  }

  async status(db: PrismaClient, tenantId: string): Promise<{ available: boolean; account: ManagedAccount | null }> {
    if (!managedConfig()) return { available: false, account: null };
    const id = await this.accountId(db);
    if (!id) return { available: await this.allowedFor(tenantId), account: null };
    const r = await this.client().getAccount(id);
    if (!r.data) throw new BadRequestException(r.error ?? 'Could not load the managed account');
    await this.sync(db, r.data, tenantId);
    const stored = await this.stored(db);
    return { available: true, account: { ...r.data, ...(stored?.statusChangedAt && { statusChangedAt: stored.statusChangedAt }) } };
  }

  async open(db: PrismaClient, tenantId: string, input: Omit<OpenManagedAccount, 'externalId' | 'notificationUrl'>): Promise<ManagedAccount> {
    if (await this.accountId(db)) throw new BadRequestException('This account already has managed payments');
    if (!(await this.allowedFor(tenantId))) throw new ForbiddenException('Managed payments are included with the cloud plans; this organisation is not on one');
    const r = await this.client().openAccount({ ...input, externalId: tenantId, notificationUrl: notificationUrls('managed', tenantId).notificationUrl });
    if (!r.data) throw new BadRequestException(r.error ?? 'Managed payments could not open the account');
    await this.sync(db, r.data, tenantId);
    this.logger.log(`Managed account ${r.data.id} opened for tenant ${tenantId} (${r.data.status})`);
    return r.data;
  }

  /** Change the managed account's contact details or payout destination. */
  async update(db: PrismaClient, changes: UpdateManagedAccount): Promise<ManagedAccount> {
    if (!managedConfig()) throw new BadRequestException('Managed payments are not offered on this deployment');
    const id = await this.accountId(db);
    if (!id) throw new BadRequestException('This account has no managed payments yet');
    const r = await this.client().updateAccount(id, changes);
    if (!r.data) throw new BadRequestException(r.error ?? 'Managed payments could not update the account');
    return r.data;
  }

  /**
   * Store the account id and switch the connection on or off with the
   * account's status. When the status changes, the organisation's owners and
   * admins are told by email, and the change shows in the dashboard.
   */
  async sync(db: PrismaClient, account: Pick<ManagedAccount, 'id' | 'status'> & Partial<Pick<ManagedAccount, 'reason' | 'fee'>>, tenantId?: string): Promise<void> {
    const previous = await this.stored(db);
    const changed = previous?.status !== account.status;
    const stored: StoredManaged = {
      accountId: account.id,
      status: account.status,
      statusChangedAt: changed || !previous?.statusChangedAt ? new Date().toISOString() : previous.statusChangedAt,
      ...((account.reason ?? previous?.reason) && { reason: account.reason ?? previous?.reason }),
    };
    const credentials = this.encryption.encrypt(JSON.stringify(stored));
    const isActive = account.status === 'active';
    await db.paymentProvider.upsert({
      where: { providerName: 'managed' },
      create: { providerName: 'managed', credentials, isActive, priority: MANAGED_PRIORITY },
      update: { credentials, isActive },
    });
    // The first sync records the application; only later changes are news.
    if (changed && previous && tenantId) await this.announce(tenantId, account).catch((e) => this.logger.warn(`Could not tell tenant ${tenantId} about its managed account: ${e instanceof Error ? e.message : e}`));
  }

  /** When the managed account's status last changed, and why, as stored. */
  async stored(db: PrismaClient): Promise<StoredManaged | null> {
    const row = await db.paymentProvider.findUnique({ where: { providerName: 'managed' } });
    if (!row) return null;
    try {
      return JSON.parse(this.encryption.decrypt(row.credentials)) as StoredManaged;
    } catch {
      return null;
    }
  }

  /** Email the owners and admins about a new status. */
  private async announce(tenantId: string, account: Pick<ManagedAccount, 'status'> & Partial<Pick<ManagedAccount, 'reason' | 'fee'>>) {
    if (!this.email || account.status === 'pending_review') return;
    const people = await this.central.client.membership.findMany({
      where: { tenantId, role: { in: ['OWNER', 'ADMIN'] }, user: { isActive: true } },
      select: { user: { select: { email: true, name: true } }, tenant: { select: { name: true } } },
    });
    if (!people.length) return;
    const org = people[0].tenant.name;
    const link = `${(process.env.DASHBOARD_URL || 'http://localhost:4002').replace(/\/$/, '')}/money?tab=managed`;
    const fee = account.fee?.type === 'percentage' ? `${account.fee.value}%` : null;
    const message = statusMessage(account.status, { org, reason: account.reason, fee });
    if (!message) return;
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#10141b">
<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(message.title)}</h2>
${message.body.map((p) => `<p style="line-height:1.55;margin:0 0 12px">${escapeHtml(p)}</p>`).join('')}
<p style="margin:20px 0"><a href="${link}" style="background:#0e6e6b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open managed payments</a></p>
</div>`;
    for (const p of people) await this.email.sendHtml(p.user.email, message.title, html);
    this.logger.log(`Told ${people.length} person(s) at tenant ${tenantId} that managed payments are ${account.status}`);
  }

  async accountId(db: PrismaClient): Promise<string | null> {
    return (await this.stored(db))?.accountId ?? null;
  }
}
