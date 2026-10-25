import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { EncryptionService } from '../../services/encryption.service';
import { ManagedAccount, ManagedCredentials, managedConfig, ManagedPaymentsClient, OpenManagedAccount, UpdateManagedAccount } from './adapters/managed.adapter';
import { notificationUrls } from './money.service';

/** Lowest priority, so a tenant's own provider accounts are always preferred when it has them. */
const MANAGED_PRIORITY = 1000;

/**
 * Tenant side of managed payments: opening the tenant's managed account
 * and keeping its stored connection in step with the account's status.
 * The connection is active only while the account is.
 */
@Injectable()
export class ManagedAccountsService {
  private readonly logger = new Logger(ManagedAccountsService.name);

  constructor(private readonly encryption: EncryptionService) {}

  private client(): ManagedPaymentsClient {
    const config = managedConfig();
    if (!config) throw new ServiceUnavailableException('Managed payments are not available on this deployment');
    return new ManagedPaymentsClient(config);
  }

  async status(db: PrismaClient): Promise<{ available: boolean; account: ManagedAccount | null }> {
    if (!managedConfig()) return { available: false, account: null };
    const id = await this.accountId(db);
    if (!id) return { available: true, account: null };
    const r = await this.client().getAccount(id);
    if (!r.data) throw new BadRequestException(r.error ?? 'Could not load the managed account');
    await this.sync(db, r.data);
    return { available: true, account: r.data };
  }

  async open(db: PrismaClient, tenantId: string, input: Omit<OpenManagedAccount, 'externalId' | 'notificationUrl'>): Promise<ManagedAccount> {
    if (await this.accountId(db)) throw new BadRequestException('This account already has managed payments');
    const r = await this.client().openAccount({ ...input, externalId: tenantId, notificationUrl: notificationUrls('managed', tenantId).notificationUrl });
    if (!r.data) throw new BadRequestException(r.error ?? 'Managed payments could not open the account');
    await this.sync(db, r.data);
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

  /** Store the account id and switch the connection on or off with the account's status. */
  async sync(db: PrismaClient, account: Pick<ManagedAccount, 'id' | 'status'>): Promise<void> {
    const credentials = this.encryption.encrypt(JSON.stringify({ accountId: account.id } satisfies ManagedCredentials));
    const isActive = account.status === 'active';
    await db.paymentProvider.upsert({
      where: { providerName: 'managed' },
      create: { providerName: 'managed', credentials, isActive, priority: MANAGED_PRIORITY },
      update: { credentials, isActive },
    });
  }

  async accountId(db: PrismaClient): Promise<string | null> {
    const row = await db.paymentProvider.findUnique({ where: { providerName: 'managed' } });
    if (!row) return null;
    return (JSON.parse(this.encryption.decrypt(row.credentials)) as ManagedCredentials).accountId ?? null;
  }
}
