import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { assertKnownCurrency } from '../../common/utils/currency.utils';
import { CreateAddOnDto, UpdateAddOnDto, ApplyAddOnDto } from './dto/create-add-on.dto';

@Injectable()
export class AddOnsService {
  private readonly logger = new Logger(AddOnsService.name);

  async findAll(db: PrismaClient, query: { page?: number; limit?: number; code?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const where = query.code ? { code: query.code } : {};

    const [data, total] = await Promise.all([
      db.addOn.findMany({
        where,
        skip,
        take: limit,
        include: { prices: true },
        orderBy: { createdAt: 'desc' },
      }),
      db.addOn.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(db: PrismaClient, id: string) {
    const addOn = await db.addOn.findUnique({
      where: { id },
      include: { prices: true },
    });
    if (!addOn) throw new NotFoundException('Add-on not found');
    return addOn;
  }

  async create(db: PrismaClient, dto: CreateAddOnDto) {
    const existing = await db.addOn.findUnique({ where: { code: dto.code.toLowerCase() } });
    if (existing) throw new BadRequestException('An add-on with this code already exists');

    if (!dto.prices || dto.prices.length === 0) {
      throw new BadRequestException('At least one price is required');
    }
    for (const p of dto.prices) await assertKnownCurrency(db, p.currency);

    return db.addOn.create({
      data: {
        name: dto.name,
        code: dto.code.toLowerCase(),
        description: dto.description,
        invoiceDisplayName: dto.invoiceDisplayName,
        ...(dto.createdAt && { createdAt: new Date(dto.createdAt) }),
        prices: {
          create: dto.prices.map((p) => ({
            currency: p.currency.toUpperCase(),
            amount: p.amount,
          })),
        },
      },
      include: { prices: true },
    });
  }

  async update(db: PrismaClient, id: string, dto: UpdateAddOnDto) {
    const addOn = await db.addOn.findUnique({ where: { id } });
    if (!addOn) throw new NotFoundException('Add-on not found');
    for (const p of dto.prices ?? []) await assertKnownCurrency(db, p.currency);

    return db.$transaction(async (tx) => {
      if (dto.prices) {
        await tx.addOnPrice.deleteMany({ where: { addOnId: id } });
        await tx.addOnPrice.createMany({
          data: dto.prices.map((p) => ({
            addOnId: id,
            currency: p.currency.toUpperCase(),
            amount: p.amount,
          })),
        });
      }

      return tx.addOn.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.invoiceDisplayName !== undefined && { invoiceDisplayName: dto.invoiceDisplayName }),
        },
        include: { prices: true },
      });
    });
  }

  async delete(db: PrismaClient, id: string) {
    const addOn = await db.addOn.findUnique({ where: { id } });
    if (!addOn) throw new NotFoundException('Add-on not found');

    await db.addOn.delete({ where: { id } }); // Cascades to prices
    return { message: 'Add-on deleted' };
  }

  async apply(db: PrismaClient, dto: ApplyAddOnDto) {
    const addOn = await db.addOn.findUnique({ where: { id: dto.addOnId } });
    if (!addOn) throw new NotFoundException('Add-on not found');

    const customer = await db.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    if (dto.subscriptionId) {
      const sub = await db.subscription.findUnique({ where: { id: dto.subscriptionId } });
      if (!sub) throw new NotFoundException('Subscription not found');
      if (sub.customerId !== dto.customerId) {
        throw new BadRequestException('Subscription does not belong to this customer');
      }
    }

    return db.appliedAddOn.create({
      data: {
        addOnId: dto.addOnId,
        customerId: dto.customerId,
        subscriptionId: dto.subscriptionId,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
      },
    });
  }

  async findApplied(db: PrismaClient, query: { customerId?: string; invoiced?: boolean; page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.invoiced === true) where.invoiceId = { not: null };
    if (query.invoiced === false) where.invoiceId = null;

    const [data, total] = await Promise.all([
      db.appliedAddOn.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.appliedAddOn.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async removeApplied(db: PrismaClient, appliedAddOnId: string) {
    const applied = await db.appliedAddOn.findUnique({ where: { id: appliedAddOnId } });
    if (!applied) throw new NotFoundException('Applied add-on not found');
    if (applied.invoiceId) {
      throw new BadRequestException('Cannot remove an add-on that has already been invoiced');
    }

    await db.appliedAddOn.delete({ where: { id: appliedAddOnId } });
    return { message: 'Applied add-on removed' };
  }
}
