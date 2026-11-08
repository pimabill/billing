import { escapeHtml } from '../../common/utils/escape-html';
import { BadRequestException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { EmailService } from '../../services/email.service';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { EncryptionService } from '../../services/encryption.service';
import { GatewayAccount, GatewayCredentials, gatewayConfig, GatewayClient } from './adapters/gateway.adapter';
import { notificationUrls } from './notification-urls';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { isSandbox } from '../../config/sandbox';

/** Lowest priority, so a tenant's own provider accounts are always preferred when it has them. */
const GATEWAY_PRIORITY = 1000;

/** What the gateway connection stores beside the account id. */
export interface StoredGateway extends GatewayCredentials {
  status?: GatewayAccount['status'];
  statusChangedAt?: string;
  reason?: string;
}


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
        title: `The payment gateway is on for ${org}`,
        body: [
          'Your application is approved. Invoice checkouts, renewals, portal payments and payment links can now be paid through the payment gateway, by card or mobile money.',
          ...(fee ? [`Our fee is ${fee} per payment, on top of the payment provider's own fee, taken before each payout.`] : []),
          'Payouts go to the destination you gave us; you can change it any time from Settings → Payment providers.',
        ],
      };
    case 'rejected':
      return {
        title: `The payment gateway for ${org} was not approved`,
        body: [reason ? `The reason given: ${reason}` : 'We could not approve the application.', 'Reply to this email if you think this is a mistake, or connect your own payment provider in Settings → Payment providers.'],
      };
    case 'suspended':
      return {
        title: `The payment gateway for ${org} is paused`,
        body: [
          reason ? `The reason given: ${reason}` : 'The payment gateway is paused on your account.',
          'Payments through the payment gateway are paused until this is resolved; payments through your own providers are not affected. Reply to this email to resolve it.',
        ],
      };
    default:
      return null;
  }
}

/**
 * Tenant side of the payment gateway: sending the tenant to the gateway's
 * own account page and keeping its stored connection in step with the account's status.
 * The connection is active only while the account is.
 */
@Injectable()
export class GatewayAccountsService {
  private readonly logger = new Logger(GatewayAccountsService.name);

  constructor(
    private readonly encryption: EncryptionService,
    private readonly central: CentralPrismaService,
    @Optional() private readonly email?: EmailService,
  ) {}

  /** The gateway decides who may apply. An organisation it cannot answer for is not offered it. */
  async allowedFor(tenantId: string): Promise<boolean> {
    if (!gatewayConfig()) return false;
    const r = await this.client().eligibility(tenantId).catch(() => null);
    return r?.data?.eligible === true;
  }

  private client(): GatewayClient {
    const config = gatewayConfig();
    if (!config) throw new ServiceUnavailableException('The payment gateway is not available on this deployment');
    return new GatewayClient(config);
  }

  async status(db: PrismaClient, tenantId: string): Promise<{ available: boolean; account: GatewayAccount | null }> {
    if (!gatewayConfig()) return { available: false, account: null };
    const id = await this.accountId(db);
    if (!id) {
      // The sandbox follows live: a merchant approved for the payment gateway there needs no second application.
      if (isSandbox()) {
        const mirrored = await this.client()
          .mirrorAccount(tenantId, notificationUrls('gateway', tenantId).notificationUrl)
          .catch(() => null);
        if (mirrored?.data) {
          await this.sync(db, mirrored.data, tenantId);
          this.logger.log(`Sandbox gateway account ${mirrored.data.id} set up from tenant ${tenantId}'s live one (${mirrored.data.status})`);
          return { available: true, account: mirrored.data };
        }
      }
      return { available: await this.allowedFor(tenantId), account: null };
    }
    const r = await this.client().getAccount(id);
    if (!r.data) throw new BadRequestException(r.error ?? 'Could not load the gateway account');
    await this.sync(db, r.data, tenantId);
    const stored = await this.stored(db);
    return { available: true, account: { ...r.data, ...(stored?.statusChangedAt && { statusChangedAt: stored.statusChangedAt }) } };
  }

  /** A link to the gateway's own page, where the organisation applies and manages its account. */
  async link(tenantId: string): Promise<{ url: string; expiresAt: string }> {
    const dashboard = (process.env.DASHBOARD_URL || 'http://localhost:4002').replace(/\/$/, '');
    const r = await this.client().accountLink({ externalId: tenantId, notificationUrl: notificationUrls('gateway', tenantId).notificationUrl, returnUrl: `${dashboard}/providers` });
    if (!r.data) throw new BadRequestException(r.error ?? 'The payment gateway could not open its account page');
    return r.data;
  }

  /**
   * Store the account id and switch the connection on or off with the
   * account's status. When the status changes, the organisation's owners and
   * admins are told by email, and the change shows in the dashboard.
   */
  async sync(db: PrismaClient, account: Pick<GatewayAccount, 'id' | 'status'> & Partial<Pick<GatewayAccount, 'reason' | 'fee'>>, tenantId?: string): Promise<void> {
    const previous = await this.stored(db);
    const changed = previous?.status !== account.status;
    const stored: StoredGateway = {
      accountId: account.id,
      status: account.status,
      statusChangedAt: changed || !previous?.statusChangedAt ? new Date().toISOString() : previous.statusChangedAt,
      ...((account.reason ?? previous?.reason) && { reason: account.reason ?? previous?.reason }),
    };
    const credentials = this.encryption.encrypt(JSON.stringify(stored));
    const isActive = account.status === 'active';
    await db.paymentProvider.upsert({
      where: { providerName: 'gateway' },
      create: { providerName: 'gateway', credentials, isActive, priority: GATEWAY_PRIORITY },
      update: { credentials, isActive },
    });
    // The first sync records the application; only later changes are news.
    if (changed && previous && tenantId) await this.announce(tenantId, account).catch((e) => this.logger.warn(`Could not tell tenant ${tenantId} about its gateway account: ${e instanceof Error ? e.message : e}`));
  }

  /** When the gateway account's status last changed, and why, as stored. */
  async stored(db: PrismaClient): Promise<StoredGateway | null> {
    const row = await db.paymentProvider.findUnique({ where: { providerName: 'gateway' } });
    if (!row) return null;
    try {
      return JSON.parse(this.encryption.decrypt(row.credentials)) as StoredGateway;
    } catch {
      return null;
    }
  }

  /** Email the owners and admins about a new status. */
  private async announce(tenantId: string, account: Pick<GatewayAccount, 'status'> & Partial<Pick<GatewayAccount, 'reason' | 'fee'>>) {
    if (!this.email || account.status === 'pending_review') return;
    const people = await this.central.client.membership.findMany({
      where: { tenantId, role: { in: ['OWNER', 'ADMIN'] }, user: { isActive: true } },
      select: { user: { select: { email: true, name: true } }, tenant: { select: { name: true } } },
    });
    if (!people.length) return;
    const org = people[0].tenant.name;
    const link = `${(process.env.DASHBOARD_URL || 'http://localhost:4002').replace(/\/$/, '')}/providers`;
    const fee = account.fee?.type === 'percentage' ? `${account.fee.value}%` : null;
    const message = statusMessage(account.status, { org, reason: account.reason, fee });
    if (!message) return;
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#10141b">
<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(message.title)}</h2>
${message.body.map((p) => `<p style="line-height:1.55;margin:0 0 12px">${escapeHtml(p)}</p>`).join('')}
<p style="margin:20px 0"><a href="${link}" style="background:#0e6e6b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open the payment gateway</a></p>
</div>`;
    for (const p of people) await this.email.sendHtml(p.user.email, message.title, html);
    this.logger.log(`Told ${people.length} person(s) at tenant ${tenantId} that the payment gateway is ${account.status}`);
  }

  /** The balances the gateway holds for this organisation, or null without an account. Reads only. */
  async balances(db: PrismaClient): Promise<GatewayAccount['balances'] | null> {
    if (!gatewayConfig()) return null;
    const id = await this.accountId(db);
    if (!id) return null;
    const r = await this.client().getAccount(id);
    if (!r.data) throw new Error(r.error ?? 'Could not load the gateway account');
    return r.data.balances ?? {};
  }

  async accountId(db: PrismaClient): Promise<string | null> {
    return (await this.stored(db))?.accountId ?? null;
  }
}
