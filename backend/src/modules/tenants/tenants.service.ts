import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-central/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { TenantDatabaseService } from '../../database/tenant-database.service';
import { EncryptionService } from '../../services/encryption.service';
import { EmailService, SMTP_PASSWORD_MASK, SMTP_PORTS, SmtpSettings } from '../../services/email.service';
import { resolvePublicHost } from '../../common/net/safe-url';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { getBrand } from '../../config/brand';
import { SCOPE_PATTERN, hashApiKey, lastFour, maskedKey } from '../../common/auth/api-keys';
import { assertSafeWebhookUrl } from '../../common/net/safe-url';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly centralPrisma: CentralPrismaService,
    private readonly tenantDb: TenantDatabaseService,
    private readonly encryptionService: EncryptionService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * The organisation's profile. The API key is only ever shown masked (it is
   * stored hashed); the webhook secret only to people who manage developer
   * settings, and to API keys that can write.
   */
  async getTenant(tenantId: string, opts: { includeSecrets?: boolean } = {}) {
    const tenant = await this.centralPrisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        apiKeyLast4: true,
        webhookUrl: true,
        webhookSecret: true,
        isActive: true,
        settings: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const { apiKeyLast4, webhookSecret, ...rest } = tenant;
    const settings = (rest.settings ?? null) as Record<string, unknown> | null;
    const smtp = settings?.smtp as SmtpSettings | undefined;
    return {
      ...rest,
      // The SMTP password is never sent back, only whether one is set.
      settings: smtp?.password ? { ...settings, smtp: { ...smtp, password: SMTP_PASSWORD_MASK } } : settings,
      apiKey: maskedKey(apiKeyLast4),
      webhookSecret: opts.includeSecrets ? webhookSecret : null,
    };
  }

  /** Replace the organisation's own API key; the old one stops working at once. Shown once. */
  async rotateApiKey(tenantId: string) {
    const key = this.encryptionService.generateApiKey();
    await this.centralPrisma.client.tenant.update({
      where: { id: tenantId },
      data: { apiKey: null, apiKeyHash: hashApiKey(key), apiKeyLast4: lastFour(key) },
    });
    this.logger.log(`API key rotated for tenant ${tenantId}`);
    return { key };
  }

  /** Replace the secret that signs outbound webhooks. */
  async rotateWebhookSecret(tenantId: string) {
    const webhookSecret = this.encryptionService.generateWebhookSecret();
    await this.centralPrisma.client.tenant.update({ where: { id: tenantId }, data: { webhookSecret } });
    this.logger.log(`Webhook secret rotated for tenant ${tenantId}`);
    return { webhookSecret };
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.webhookUrl !== undefined) {
      // Refuse internal addresses up front; delivery checks again, since DNS can change.
      if (dto.webhookUrl) await assertSafeWebhookUrl(dto.webhookUrl);
      data.webhookUrl = dto.webhookUrl || null;
    }

    // Merge settings instead of overwriting to preserve sibling keys (smtp, webhookEvents, etc.)
    if (dto.settings !== undefined) {
      const existing = await this.centralPrisma.client.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });
      const currentSettings = (existing?.settings || {}) as Record<string, unknown>;
      // Money-movement settings change only through /money/settings and the
      // platform console (payouts need operator approval), never here.
      // Requiring two-step sign-in goes through /auth/mfa/organisation, which checks the caller uses it.
      const { money: _ignored, requireMfa: _mfa, ...incoming } = (dto.settings ?? {}) as Record<string, unknown>;
      if (incoming.smtp !== undefined && incoming.smtp !== null) {
        incoming.smtp = await this.prepareSmtp(incoming.smtp as SmtpSettings, currentSettings.smtp as SmtpSettings | undefined);
      }
      data.settings = { ...currentSettings, ...incoming } as any;
      this.emailService.forgetTenant(tenantId);
    }

    const tenant = await this.centralPrisma.client.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        webhookUrl: true,
        isActive: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return tenant;
  }

  /**
   * Checks a tenant's SMTP server is a public host on a mail port, and stores
   * the password encrypted. The masked placeholder keeps the saved password.
   */
  private async prepareSmtp(smtp: SmtpSettings, existing?: SmtpSettings): Promise<SmtpSettings> {
    if (typeof smtp !== 'object') throw new BadRequestException('smtp must be an object');
    if (smtp.host) {
      const port = Number(smtp.port || 587);
      if (!SMTP_PORTS.includes(port)) {
        throw new BadRequestException(`SMTP port must be one of ${SMTP_PORTS.join(', ')}`);
      }
      await resolvePublicHost(String(smtp.host));
      smtp = { ...smtp, port };
    }
    if (smtp.password === SMTP_PASSWORD_MASK || smtp.password === undefined) {
      return { ...smtp, password: existing?.password };
    }
    return { ...smtp, password: smtp.password ? this.emailService.encryptSmtpPassword(String(smtp.password)) : undefined };
  }

  async getUsage(tenantId: string) {
    const tenantClient = await this.tenantDb.getTenantClient(tenantId);

    const [customerCount, subscriptionCount, invoiceCount, revenueResult] = await Promise.all([
      tenantClient.customer.count(),
      tenantClient.subscription.count({
        where: { status: 'ACTIVE' },
      }),
      tenantClient.invoice.count(),
      tenantClient.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    return {
      customers: customerCount,
      activeSubscriptions: subscriptionCount,
      totalInvoices: invoiceCount,
      totalRevenue: revenueResult._sum.amount?.toString() || '0',
    };
  }

  async createApiKey(tenantId: string, name: string, scopes: string[], expiresAt?: Date) {
    const unique = [...new Set(scopes)];
    if (unique.length === 0 || unique.some((s) => !SCOPE_PATTERN.test(s))) {
      throw new BadRequestException('Scopes must be "read", "write", or "<resource>:read" / "<resource>:write" (e.g. "customers:read")');
    }
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
      throw new BadRequestException('expiresAt must be a date in the future');
    }
    const key = this.encryptionService.generateApiKey();

    const apiKey = await this.centralPrisma.client.apiKey.create({
      data: {
        tenantId,
        keyHash: hashApiKey(key),
        last4: lastFour(key),
        name,
        scopes: unique,
        expiresAt,
      },
    });

    return {
      id: apiKey.id,
      key, // Only shown once
      name: apiKey.name,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  }

  async listApiKeys(tenantId: string) {
    const keys = await this.centralPrisma.client.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((key: any) => ({
      id: key.id,
      key: maskedKey(key.last4),
      name: key.name,
      scopes: key.scopes,
      lastUsed: key.lastUsed,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
    }));
  }

  async deleteApiKey(tenantId: string, keyId: string) {
    const apiKey = await this.centralPrisma.client.apiKey.findFirst({
      where: { id: keyId, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    await this.centralPrisma.client.apiKey.delete({
      where: { id: keyId },
    });

    return { message: 'API key deleted successfully' };
  }

  async getWebhookLogs(
    tenantId: string,
    params: { direction?: 'inbound' | 'outbound'; limit?: number; page?: number },
  ) {
    const limit = params.limit || 50;
    const page = params.page || 1;

    const where: Prisma.WebhookLogWhereInput = { tenantId };

    if (params.direction === 'inbound') {
      // Inbound logs use url starting with "inbound:"
      where.url = { startsWith: 'inbound:' };
    } else if (params.direction === 'outbound') {
      // Outbound logs have real HTTP URLs
      where.url = { startsWith: 'http' };
    }

    const [logs, total] = await Promise.all([
      this.centralPrisma.client.webhookLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.centralPrisma.client.webhookLog.count({ where }),
    ]);

    return {
      data: logs.map((log: any) => ({
        id: log.id,
        event: log.event,
        url: log.url,
        payload: log.payload,
        response: log.response,
        statusCode: log.statusCode,
        success: log.success,
        attemptCount: log.attemptCount,
        direction: String(log.url).startsWith('inbound:') ? 'inbound' : 'outbound',
        provider: String(log.url).startsWith('inbound:') ? log.url.replace('inbound:', '') : null,
        createdAt: log.createdAt,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async testSmtp(tenantId: string, to: string) {
    try {
      await this.emailService.sendMail(
        to,
        `${getBrand().name} SMTP Test`,
        'smtp-test',
        {
          heading: 'SMTP Configuration Test',
          message: 'If you received this email, your SMTP settings are configured correctly.',
          footer: `Sent from ${getBrand().name}`,
        },
        tenantId,
      );

      return { message: `Test email sent successfully to ${to}` };
    } catch (error: any) {
      this.logger.error(`SMTP test failed for tenant ${tenantId}:`, error);
      throw new BadRequestException(`SMTP test failed: ${error.message || 'Unknown error'}`);
    }
  }
}
