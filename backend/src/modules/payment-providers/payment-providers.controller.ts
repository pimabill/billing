import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../common/auth/permissions';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentProvidersService } from './payment-providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { PaymentProviderResponse, ProviderTestResponse } from './dto/provider-response.dto';

@ApiTags('Payment Providers')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@RequirePermission('settings.providers')
@Controller('payment-providers')
export class PaymentProvidersController {
  constructor(private readonly paymentProvidersService: PaymentProvidersService) {}

  @Get()
  @ApiOperation({
    summary: 'List payment providers',
    description:
      'Every supported provider, configured or not: whether it is configured and active, its priority, which environment ' +
      '(live or sandbox) its credentials are for, and its webhook URL. Credentials are never returned. ' +
      'Configured providers come first, by priority; pass configured=true for only those.',
  })
  @ApiQuery({ name: 'configured', required: false, type: Boolean, description: 'Only the providers set up for this organisation' })
  @ApiResponse({ status: 200, description: 'Providers (without credentials)', type: [PaymentProviderResponse] })
  async findAll(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Query('configured') configured?: string) {
    return this.paymentProvidersService.findAll(db, req.tenant.id, { configured: configured === 'true' });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get payment provider by ID',
    description:
      'Retrieve a specific payment provider configuration. Credentials are not included.',
  })
  @ApiParam({ name: 'id', description: 'Payment provider ID' })
  @ApiResponse({ status: 200, description: 'Provider details (without credentials)', type: PaymentProviderResponse })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async findOne(@TenantDb() db: PrismaClient, @Param('id') id: string, @Req() req: RequestWithTenant) {
    return this.paymentProvidersService.findOne(db, id, req.tenant.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Configure a payment provider',
    description:
      'Set up a payment provider (stripe, paystack, flutterwave, pesapal, paypal, payu or dpo) with encrypted credentials. ' +
      'The provider with the lowest priority number is used by default for checkout.',
  })
  @ApiResponse({ status: 201, description: 'Provider configured successfully', type: PaymentProviderResponse })
  @ApiResponse({ status: 409, description: 'Provider already configured' })
  async create(@TenantDb() db: PrismaClient, @Body() dto: CreateProviderDto) {
    return this.paymentProvidersService.create(db, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a payment provider',
    description: 'Update provider settings such as active status, priority, or credentials.',
  })
  @ApiParam({ name: 'id', description: 'Payment provider ID' })
  @ApiResponse({ status: 200, description: 'Provider updated', type: PaymentProviderResponse })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async update(
    @TenantDb() db: PrismaClient,
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.paymentProvidersService.update(db, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a payment provider',
    description: 'Remove a payment provider configuration. This does not affect existing payments.',
  })
  @ApiParam({ name: 'id', description: 'Payment provider ID' })
  @ApiResponse({ status: 200, description: 'Provider deleted', type: PaymentProviderResponse })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async delete(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.paymentProvidersService.delete(db, id);
  }

  @Post(':id/test')
  @ApiOperation({
    summary: 'Test provider connection',
    description:
      'Verify that the provider credentials are valid by making a test API call to the provider.',
  })
  @ApiParam({ name: 'id', description: 'Payment provider ID' })
  @ApiResponse({
    status: 200,
    description: 'Connection test result',
    type: ProviderTestResponse,
  })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async test(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.paymentProvidersService.testConnection(db, id);
  }
}
