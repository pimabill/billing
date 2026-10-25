import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { WEBHOOK_QUEUE, WebhookJobType } from '../../queues/billing.queue';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  async findAll(db: PrismaClient, query: CustomerQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.country) {
      where.country = query.country;
    }

    if (query.currency) {
      where.currency = query.currency;
    }

    const [data, total] = await Promise.all([
      db.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        include: {
          // Trials and renewals awaiting payment are still live subscriptions.
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
            select: { id: true },
          },
          invoices: {
            where: { status: 'PAID' },
            select: { amount: true, currency: true },
          },
        },
      }),
      db.customer.count({ where }),
    ]);

    const enriched = data.map((c: any) => ({
      ...c,
      activeSubscriptions: c.subscriptions?.length || 0,
      totalSpent: c.invoices?.reduce((sum: number, inv: any) => sum + Number(inv.amount), 0) || 0,
      subscriptions: undefined,
      invoices: undefined,
    }));

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(db: PrismaClient, id: string) {
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        subscriptions: { include: { plan: true } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async create(db: PrismaClient, tenantId: string, dto: CreateCustomerDto) {
    const existing = await db.customer.findUnique({
      where: { externalId: dto.externalId },
    });

    if (existing) {
      throw new ConflictException('Customer with this externalId already exists');
    }

    const customer = await db.customer.create({
      data: {
        externalId: dto.externalId,
        email: dto.email,
        name: dto.name,
        country: dto.country,
        currency: dto.currency,
        metadata: (dto.metadata ?? undefined) as any,
        ...(dto.netPaymentTerms !== undefined && { netPaymentTerms: dto.netPaymentTerms }),
        ...(dto.createdAt && { createdAt: new Date(dto.createdAt) }),
      },
    });

    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'customer.created',
      payload: {
        customerId: customer.id,
        externalId: customer.externalId,
        email: customer.email,
        name: customer.name,
      },
    });

    return customer;
  }

  async update(db: PrismaClient, tenantId: string, id: string, dto: UpdateCustomerDto) {
    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const updated = await db.customer.update({
      where: { id },
      data: {
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata as any }),
        ...(dto.netPaymentTerms !== undefined && { netPaymentTerms: dto.netPaymentTerms }),
      },
    });

    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'customer.updated',
      payload: {
        customerId: id,
        externalId: updated.externalId,
        email: updated.email,
        name: updated.name,
      },
    });

    return updated;
  }

  async delete(db: PrismaClient, tenantId: string, id: string) {
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        subscriptions: { where: { status: 'ACTIVE' } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (customer.subscriptions.length > 0) {
      throw new BadRequestException(
        'Cannot delete customer with active subscriptions. Cancel subscriptions first.',
      );
    }

    await db.customer.delete({ where: { id } });

    await this.webhookQueue.add(WebhookJobType.SEND_WEBHOOK, {
      tenantId,
      event: 'customer.deleted',
      payload: {
        customerId: id,
        externalId: customer.externalId,
        email: customer.email,
      },
    });

    return { message: 'Customer deleted successfully' };
  }

  async findSubscriptions(db: PrismaClient, customerId: string) {
    return db.subscription.findMany({
      where: { customerId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findInvoices(db: PrismaClient, customerId: string) {
    return db.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPayments(db: PrismaClient, customerId: string) {
    const invoices = await db.invoice.findMany({
      where: { customerId },
      include: { payments: true },
      orderBy: { createdAt: 'desc' },
    });

    return invoices.flatMap((invoice: any) => invoice.payments);
  }

  async findPaymentMethods(db: PrismaClient, customerId: string) {
    return db.paymentMethod.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deletePaymentMethod(db: PrismaClient, customerId: string, paymentMethodId: string) {
    const method = await db.paymentMethod.findFirst({
      where: { id: paymentMethodId, customerId },
    });
    if (!method) {
      throw new NotFoundException('Payment method not found');
    }
    await db.paymentMethod.delete({ where: { id: paymentMethodId } });
    return { message: 'Payment method deleted' };
  }
}
