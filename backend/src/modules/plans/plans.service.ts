import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { assertKnownCurrency } from '../../common/utils/currency.utils';
import { CreatePlanPriceDto } from './dto/create-plan-price.dto';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  async findAll(db: PrismaClient, isActive?: boolean) {
    const where: Record<string, unknown> = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    return db.plan.findMany({
      where,
      include: { prices: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(db: PrismaClient, id: string) {
    const plan = await db.plan.findUnique({
      where: { id },
      include: {
        prices: true,
        _count: { select: { subscriptions: true } },
      },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return plan;
  }

  async create(db: PrismaClient, dto: CreatePlanDto) {
    const existing = await db.plan.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException('Plan with this code already exists');
    }
    for (const p of dto.prices ?? []) await assertKnownCurrency(db, p.currency);

    return db.plan.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        billingInterval: dto.billingInterval,
        features: dto.features ?? [],
        ...(dto.billingTiming !== undefined && { billingTiming: dto.billingTiming }),
        ...(dto.netPaymentTerms !== undefined && { netPaymentTerms: dto.netPaymentTerms }),
        ...(dto.invoiceGracePeriodDays !== undefined && { invoiceGracePeriodDays: dto.invoiceGracePeriodDays }),
        ...(dto.progressiveBillingThreshold !== undefined && { progressiveBillingThreshold: dto.progressiveBillingThreshold }),
        prices: dto.prices
          ? {
              create: dto.prices.map((p) => ({
                currency: p.currency.toUpperCase(),
                amount: p.amount,
              })),
            }
          : undefined,
      },
      include: { prices: true },
    });
  }

  async update(db: PrismaClient, id: string, dto: UpdatePlanDto) {
    const plan = await db.plan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return db.plan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.billingInterval !== undefined && { billingInterval: dto.billingInterval }),
        ...(dto.billingTiming !== undefined && { billingTiming: dto.billingTiming }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.netPaymentTerms !== undefined && { netPaymentTerms: dto.netPaymentTerms }),
        ...(dto.invoiceGracePeriodDays !== undefined && { invoiceGracePeriodDays: dto.invoiceGracePeriodDays }),
        ...(dto.progressiveBillingThreshold !== undefined && { progressiveBillingThreshold: dto.progressiveBillingThreshold }),
      },
      include: { prices: true },
    });
  }

  async delete(db: PrismaClient, id: string) {
    const plan = await db.plan.findUnique({
      where: { id },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan._count.subscriptions > 0) {
      throw new BadRequestException(
        'Cannot delete plan with existing subscriptions',
      );
    }

    await db.plan.delete({ where: { id } });
    return { message: 'Plan deleted successfully' };
  }

  async addPrice(db: PrismaClient, planId: string, dto: CreatePlanPriceDto) {
    const plan = await db.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return db.planPrice.create({
      data: {
        planId,
        currency: await assertKnownCurrency(db, dto.currency),
        amount: dto.amount,
      },
    });
  }

  async updatePrice(db: PrismaClient, planId: string, priceId: string, amount: number) {
    const price = await db.planPrice.findFirst({
      where: { id: priceId, planId },
    });

    if (!price) {
      throw new NotFoundException('Price not found');
    }

    return db.planPrice.update({
      where: { id: priceId },
      data: { amount },
    });
  }

  async deletePrice(db: PrismaClient, planId: string, priceId: string) {
    const price = await db.planPrice.findFirst({
      where: { id: priceId, planId },
    });

    if (!price) {
      throw new NotFoundException('Price not found');
    }

    await db.planPrice.delete({ where: { id: priceId } });
    return { message: 'Price deleted successfully' };
  }
}
