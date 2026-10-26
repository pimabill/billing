import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { AddPlanPriceDto } from './dto/create-plan-price.dto';
import { PlanResponse, PlanPriceResponse } from './dto/plan-response.dto';

@ApiTags('Plans')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({
    summary: 'List all plans',
    description:
      'Retrieve all billing plans with their prices. Optionally filter by active status.',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filter by active status',
  })
  @ApiQuery({ name: 'code', required: false, type: String, description: 'Only the plan with this code; codes are the same in live and the sandbox' })
  @ApiResponse({ status: 200, description: 'List of plans with prices', type: [PlanResponse] })
  async findAll(@TenantDb() db: PrismaClient, @Query('isActive') isActive?: boolean, @Query('code') code?: string) {
    return this.plansService.findAll(db, isActive, code);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get plan by ID',
    description: 'Retrieve a plan with all its prices and features.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Plan details with prices', type: PlanResponse })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async findOne(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.plansService.findOne(db, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new plan',
    description:
      'Create a billing plan with a unique code. Optionally include prices for different currencies. ' +
      'Plans can have MONTHLY, QUARTERLY, or YEARLY billing intervals.',
  })
  @ApiResponse({ status: 201, description: 'Plan created', type: PlanResponse })
  @ApiResponse({ status: 409, description: 'Plan with this code already exists' })
  async create(@TenantDb() db: PrismaClient, @Body() dto: CreatePlanDto) {
    return this.plansService.create(db, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a plan',
    description: 'Update plan details like name, description, features, or billing interval.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Plan updated', type: PlanResponse })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async update(@TenantDb() db: PrismaClient, @Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(db, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a plan',
    description:
      'Delete a billing plan. Plans with active subscriptions should be deactivated instead.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Plan deleted', type: PlanResponse })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async delete(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.plansService.delete(db, id);
  }

  @Post(':id/prices')
  @ApiOperation({
    summary: 'Add a price to a plan',
    description:
      'Add a price in a specific currency to a plan. Each plan can have one price per currency.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 201, description: 'Price added to plan', type: PlanPriceResponse })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async addPrice(
    @TenantDb() db: PrismaClient,
    @Param('id') id: string,
    @Body() dto: AddPlanPriceDto,
  ) {
    return this.plansService.addPrice(db, id, dto);
  }

  @Patch(':id/prices/:priceId')
  @ApiOperation({
    summary: 'Update a plan price',
    description: 'Change the amount for an existing price on a plan.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiParam({ name: 'priceId', description: 'Price ID' })
  @ApiResponse({ status: 200, description: 'Price updated', type: PlanPriceResponse })
  @ApiResponse({ status: 404, description: 'Plan or price not found' })
  async updatePrice(
    @TenantDb() db: PrismaClient,
    @Param('id') id: string,
    @Param('priceId') priceId: string,
    @Body('amount') amount: number,
  ) {
    return this.plansService.updatePrice(db, id, priceId, amount);
  }

  @Delete(':id/prices/:priceId')
  @ApiOperation({
    summary: 'Delete a plan price',
    description:
      'Remove a price from a plan. Active subscriptions using this price will not be affected.',
  })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiParam({ name: 'priceId', description: 'Price ID' })
  @ApiResponse({ status: 200, description: 'Price deleted', type: PlanPriceResponse })
  @ApiResponse({ status: 404, description: 'Plan or price not found' })
  async deletePrice(
    @TenantDb() db: PrismaClient,
    @Param('id') id: string,
    @Param('priceId') priceId: string,
  ) {
    return this.plansService.deletePrice(db, id, priceId);
  }
}
