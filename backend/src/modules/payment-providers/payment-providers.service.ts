import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { EncryptionService } from '../../services/encryption.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProviderFactory } from '../../providers/provider.factory';
import { environmentOf, PROVIDER_CATALOGUE, providerDescription, providerName, webhookUrlFor } from './provider-catalogue';
import { PesapalProvider } from '../../providers/pesapal.provider';

@Injectable()
export class PaymentProvidersService {
  private readonly logger = new Logger(PaymentProvidersService.name);

  constructor(private readonly encryptionService: EncryptionService) {}

  private get pesapalIpnUrl(): string {
    return `${process.env.API_BASE_URL || 'http://localhost:4000'}/webhooks/pesapal`;
  }

  /**
   * Every supported provider, with whether it is configured and active here,
   * which environment its credentials are for, and where it should send
   * notifications. Credentials are never returned. `configured` lists only
   * the ones set up.
   */
  async findAll(db: PrismaClient, tenantId?: string, options: { configured?: boolean } = {}) {
    const rows = await db.paymentProvider.findMany({ orderBy: { priority: 'asc' } });
    const configured = rows.map((p) => this.present(p, tenantId));
    if (options.configured) return configured;
    const missing = PROVIDER_CATALOGUE.filter((c) => !rows.some((r) => r.providerName === c.code)).map((c) => ({
      id: null,
      providerName: c.code,
      name: c.name,
      description: c.description,
      isConfigured: false,
      isActive: false,
      priority: null,
      environment: null,
      webhookUrl: tenantId ? webhookUrlFor(c.code, tenantId) : null,
      createdAt: null,
      updatedAt: null,
    }));
    return [...configured, ...missing];
  }

  /** A configured provider as the API shows it: no credentials, only which environment they are for. */
  private present(p: { id: string; providerName: string; isActive: boolean; priority: number; credentials: string; createdAt: Date; updatedAt: Date }, tenantId?: string) {
    let environment: 'live' | 'sandbox' | null = null;
    try {
      environment = environmentOf(JSON.parse(this.encryptionService.decrypt(p.credentials)));
    } catch {
      environment = null;
    }
    return {
      id: p.id,
      providerName: p.providerName,
      name: providerName(p.providerName),
      description: providerDescription(p.providerName),
      isConfigured: true,
      isActive: p.isActive,
      priority: p.priority,
      environment,
      webhookUrl: tenantId ? webhookUrlFor(p.providerName, tenantId) : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async findOne(db: PrismaClient, id: string, tenantId?: string) {
    const provider = await db.paymentProvider.findUnique({ where: { id } });

    if (!provider) {
      throw new NotFoundException('Payment provider not found');
    }

    return this.present(provider, tenantId);
  }


  /** Credentials without which a provider's payment notifications can never be verified. */
  private assertVerifiable(providerName: string, credentials: Record<string, unknown>) {
    const required: Record<string, [string, string]> = {
      stripe: ['webhookSecret', "Stripe's webhook signing secret (whsec_...)"],
      flutterwave: ['secretHash', 'the webhook secret hash set in your Flutterwave dashboard'],
      paypal: ['webhookId', 'the PayPal webhook id'],
    };
    const need = required[providerName.toLowerCase()];
    if (need && !String(credentials[need[0]] ?? '').trim()) {
      throw new BadRequestException(`${need[0]} is required: ${need[1]}. Without it, payment notifications cannot be verified.`);
    }
  }

  async create(db: PrismaClient, dto: CreateProviderDto) {
    this.assertVerifiable(dto.providerName, dto.credentials as Record<string, unknown>);
    const existing = await db.paymentProvider.findUnique({
      where: { providerName: dto.providerName },
    });

    if (existing) {
      throw new ConflictException('Provider already configured');
    }

    // For Pesapal: auto-register an IPN URL so every checkout order gets a
    // valid notification_id without requiring manual credential configuration.
    if (dto.providerName.toLowerCase() === 'pesapal') {
      const creds = dto.credentials as {
        consumerKey: string;
        consumerSecret: string;
        environment: 'sandbox' | 'live';
        ipnId?: string;
      };

      if (!creds.ipnId) {
        try {
          const pesapalProvider = new PesapalProvider(creds);
          const ipnId = await pesapalProvider.registerIpn(this.pesapalIpnUrl);
          dto.credentials = { ...creds, ipnId };
          this.logger.log(`Pesapal IPN URL registered — ipn_id: ${ipnId}`);
        } catch (error) {
          throw new BadRequestException(
            `Failed to register Pesapal IPN URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    }

    const encryptedCredentials = this.encryptionService.encrypt(JSON.stringify(dto.credentials));

    const provider = await db.paymentProvider.create({
      data: {
        providerName: dto.providerName,
        credentials: encryptedCredentials,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 1,
      },
    });

    return {
      id: provider.id,
      providerName: provider.providerName,
      isActive: provider.isActive,
      priority: provider.priority,
      createdAt: provider.createdAt,
    };
  }

  async update(db: PrismaClient, id: string, dto: UpdateProviderDto) {
    const provider = await db.paymentProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Payment provider not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.credentials) {
      let newCredentials = { ...dto.credentials };

      // For Pesapal: preserve an existing ipnId or re-register if new
      // credentials don't include one.
      if (provider.providerName.toLowerCase() === 'pesapal') {
        const newCreds = newCredentials as {
          consumerKey?: string;
          consumerSecret?: string;
          environment?: 'sandbox' | 'live';
          ipnId?: string;
        };

        if (!newCreds.ipnId) {
          // Check if existing credentials already have an ipnId
          const existingCreds = JSON.parse(
            this.encryptionService.decrypt(provider.credentials),
          ) as { ipnId?: string };

          if (existingCreds.ipnId) {
            // Carry forward the existing ipnId
            newCredentials = { ...newCreds, ipnId: existingCreds.ipnId };
          } else {
            // New credentials with no ipnId — re-register using merged fields
            const merged = { ...existingCreds, ...newCreds };
            if (!merged.consumerKey || !merged.consumerSecret || !merged.environment) {
              throw new BadRequestException(
                'Pesapal credentials must include consumerKey, consumerSecret, and environment',
              );
            }
            try {
              const pesapalProvider = new PesapalProvider(
                merged as { consumerKey: string; consumerSecret: string; environment: 'sandbox' | 'live' },
              );
              const ipnId = await pesapalProvider.registerIpn(this.pesapalIpnUrl);
              newCredentials = { ...newCreds, ipnId };
              this.logger.log(`Pesapal IPN URL re-registered — ipn_id: ${ipnId}`);
            } catch (error) {
              throw new BadRequestException(
                `Failed to register Pesapal IPN URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          }
        }
      }

      this.assertVerifiable(provider.providerName, newCredentials as Record<string, unknown>);
      data.credentials = this.encryptionService.encrypt(JSON.stringify(newCredentials));
    }

    const updated = await db.paymentProvider.update({
      where: { id },
      data,
    });

    return {
      id: updated.id,
      providerName: updated.providerName,
      isActive: updated.isActive,
      priority: updated.priority,
      updatedAt: updated.updatedAt,
    };
  }

  async delete(db: PrismaClient, id: string) {
    const provider = await db.paymentProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Payment provider not found');
    }

    await db.paymentProvider.delete({ where: { id } });
    return { message: 'Payment provider deleted successfully' };
  }

  async testConnection(db: PrismaClient, id: string) {
    const provider = await db.paymentProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Payment provider not found');
    }

    try {
      const credentials = JSON.parse(this.encryptionService.decrypt(provider.credentials));
      const instance = ProviderFactory.create(provider.providerName, credentials);
      const success = await instance.testConnection();

      return { success, message: success ? 'Connection successful' : 'Connection failed' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }
}
