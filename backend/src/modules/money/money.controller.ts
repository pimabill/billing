import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PARTY_MODELS } from './dto/party.dto';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { Public } from '../../common/decorators/public.decorator';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../common/auth/permissions';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import {
  CreateCollectionDto,
  CreatePayoutDto,
  CreateTransferDto,
  UpdateMoneySettingsDto,
  VerifyPayeeDto,
  RequestOtpDto,
  AssignDepositDto,
  OpenManagedAccountDto,
  UpdateManagedAccountDto,
} from './dto/money.dto';
import {
  ManagedAccountResponse,
  ManagedStatusResponse,
  MoneyCapabilitiesResponse,
  MoneyMovementResponse,
  MoneySettingsResponse,
  PaginatedCryptoDepositResponse,
  PaginatedMoneyMovementResponse,
  PayerOtpResponse,
  ProviderBalanceResponse,
  VerifyPayeeResponse,
} from './dto/money-response.dto';
import { MoneyService } from './money.service';
import { ManagedAccountsService } from './managed.service';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Retry safely: a repeated key with the same body returns the first response',
};

const listQuery = (q: Record<string, string | undefined>) => ({
  status: q.status,
  page: q.page ? Number(q.page) : undefined,
  limit: q.limit ? Number(q.limit) : undefined,
  walletId: q.walletId,
  customerId: q.customerId,
});

@ApiTags('Collections')
@ApiExtraModels(...PARTY_MODELS)
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@UseInterceptors(IdempotencyInterceptor)
@RequirePermission('money.move')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly money: MoneyService) {}

  @Post()
  @ApiOperation({
    summary: 'Collect a one-time payment',
    description:
      'Starts a payment that is not tied to an invoice: a mobile money PIN prompt, or a hosted checkout link ' +
      '(card, bank or mobile money on the provider page). The result arrives as collection.succeeded or collection.failed.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiResponse({ status: 201, description: 'The collection', type: MoneyMovementResponse })
  create(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Body() dto: CreateCollectionDto) {
    return this.money.createCollection(db, req.tenant, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List collections' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: 'integer' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer', description: 'Default 20, at most 100' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'walletId', required: false, description: 'Movements into or out of this wallet' })
  @ApiResponse({ status: 200, description: 'Newest first', type: PaginatedMoneyMovementResponse })
  list(@TenantDb() db: PrismaClient, @Query() q: Record<string, string>) {
    return this.money.list(db, 'COLLECTION', listQuery(q));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a collection' })
  @ApiResponse({ status: 200, description: 'Found', type: MoneyMovementResponse })
  get(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.money.get(db, 'COLLECTION', id);
  }

  @Post(':id/refresh')
  @RequirePermission('read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check the collection status with the provider now' })
  @ApiResponse({ status: 200, description: 'Status after the check', type: MoneyMovementResponse })
  refresh(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Param('id') id: string) {
    return this.money.refresh(db, req.tenant.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a collection that has not reached the provider' })
  @ApiResponse({ status: 200, description: 'Canceled', type: MoneyMovementResponse })
  cancel(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Param('id') id: string) {
    return this.money.cancel(db, req.tenant, id);
  }
}

@ApiTags('Payouts')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@UseInterceptors(IdempotencyInterceptor)
@RequirePermission('money.move')
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly money: MoneyService) {}

  @Post()
  @ApiOperation({
    summary: 'Send a payout',
    description:
      'Pays a mobile money number, bank account, PayPal or Yo account from your provider balance, or from a customer ' +
      'wallet. Payouts above your approval threshold wait for approval in the dashboard. A payout whose outcome is ' +
      'unknown is marked stuck and never sent twice.',
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiResponse({ status: 201, description: 'The payout', type: MoneyMovementResponse })
  create(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Body() dto: CreatePayoutDto) {
    return this.money.createPayout(db, req.tenant, { ...dto, createdBy: req.member?.email ?? 'api_key' });
  }

  @Get()
  @ApiOperation({ summary: 'List payouts' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: 'integer' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer', description: 'Default 20, at most 100' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'walletId', required: false, description: 'Movements into or out of this wallet' })
  @ApiResponse({ status: 200, description: 'Newest first', type: PaginatedMoneyMovementResponse })
  list(@TenantDb() db: PrismaClient, @Query() q: Record<string, string>) {
    return this.money.list(db, 'PAYOUT', listQuery(q));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payout' })
  @ApiResponse({ status: 200, description: 'Found', type: MoneyMovementResponse })
  get(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.money.get(db, 'PAYOUT', id);
  }

  @Post(':id/approve')
  @RequirePermission('money.approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a payout',
    description: 'Only from a signed-in dashboard session, so an API key alone can never both create and approve a payout.',
  })
  @ApiResponse({ status: 200, description: 'The payout', type: MoneyMovementResponse })
  approve(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Param('id') id: string) {
    if (req.authMethod !== 'session') {
      throw new ForbiddenException('Payouts are approved from the dashboard, not with an API key');
    }
    return this.money.approvePayout(db, req.tenant, id, req.member?.email ?? req.tenant.email);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a payout waiting for approval (any wallet hold is released)' })
  @ApiResponse({ status: 200, description: 'Canceled', type: MoneyMovementResponse })
  cancel(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Param('id') id: string) {
    return this.money.cancel(db, req.tenant, id);
  }

  @Post(':id/refresh')
  @RequirePermission('read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check the payout status with the provider now' })
  @ApiResponse({ status: 200, description: 'Status after the check', type: MoneyMovementResponse })
  refresh(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Param('id') id: string) {
    return this.money.refresh(db, req.tenant.id, id);
  }
}

@ApiTags('Transfers')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@UseInterceptors(IdempotencyInterceptor)
@RequirePermission('money.move')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly money: MoneyService) {}

  @Post()
  @ApiOperation({ summary: 'Move money between two wallets', description: 'Both wallets must use the same currency.' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiResponse({ status: 201, description: 'The transfer', type: MoneyMovementResponse })
  create(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Body() dto: CreateTransferDto) {
    return this.money.createTransfer(db, req.tenant, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List transfers' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: 'integer' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer', description: 'Default 20, at most 100' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'walletId', required: false, description: 'Movements into or out of this wallet' })
  @ApiResponse({ status: 200, description: 'Newest first', type: PaginatedMoneyMovementResponse })
  list(@TenantDb() db: PrismaClient, @Query() q: Record<string, string>) {
    return this.money.list(db, 'TRANSFER', listQuery(q));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transfer' })
  @ApiResponse({ status: 200, description: 'Found', type: MoneyMovementResponse })
  get(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.money.get(db, 'TRANSFER', id);
  }
}

@ApiTags('Money movement')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@RequirePermission('settings.providers')
@Controller('money')
export class MoneySettingsController {
  constructor(
    private readonly money: MoneyService,
    private readonly managed: ManagedAccountsService,
  ) {}

  @Get('managed')
  @ApiOperation({ summary: 'Whether managed payments are offered here, and this account\'s managed account if it has one' })
  @ApiResponse({ status: 200, description: 'Availability and account', type: ManagedStatusResponse })
  managedStatus(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant) {
    return this.managed.status(db, req.tenant.id);
  }

  @Post('managed')
  @ApiOperation({
    summary: 'Open a managed payments account (no provider account of your own needed)',
    description:
      'The platform collects through its own provider accounts, keeps its fee (on top of the provider\'s) and pays the rest ' +
      'to your payout destination: mobile money, bank or PayPal. Bank details also allow direct settlement where the ' +
      'provider supports it. The account takes payments once it has been reviewed.',
  })
  @ApiResponse({ status: 201, description: 'The new account', type: ManagedAccountResponse })
  openManaged(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Body() dto: OpenManagedAccountDto) {
    return this.managed.open(db, req.tenant.id, dto);
  }

  @Patch('managed')
  @ApiOperation({
    summary: 'Change your managed account\'s contact details or payout destination',
    description: 'Anything left out stays as it is. Every change is recorded by the platform.',
  })
  @ApiResponse({ status: 200, description: 'The account after the change', type: ManagedAccountResponse })
  updateManaged(@TenantDb() db: PrismaClient, @Body() dto: UpdateManagedAccountDto) {
    return this.managed.update(db, dto);
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Enabled features and what each configured provider can do' })
  @ApiResponse({ status: 200, description: 'Settings and providers', type: MoneyCapabilitiesResponse })
  capabilities(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant) {
    return this.money.capabilities(db, req.tenant);
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Turn collections and transfers on or off, and set payout approval and daily limits',
    description: 'Payouts themselves are enabled by the platform operator.',
  })
  @ApiResponse({ status: 200, description: 'The settings after the change', type: MoneySettingsResponse })
  updateSettings(@Req() req: RequestWithTenant, @Body() dto: UpdateMoneySettingsDto) {
    return this.money.updateSettings(req.tenant, dto, false);
  }

  @Get('providers/:provider/balance')
  @ApiOperation({ summary: 'Balance held at a provider (where the provider reports it)' })
  @ApiResponse({ status: 200, description: 'Balance per currency', type: ProviderBalanceResponse })
  balance(@TenantDb() db: PrismaClient, @Param('provider') provider: string) {
    return this.money.balance(db, provider);
  }

  @Get('crypto-deposits')
  @ApiOperation({ summary: 'Crypto transfers seen arriving at your own wallet address, matched or not' })
  @ApiQuery({ name: 'status', required: false, enum: ['matched', 'unmatched', 'assigned', 'confirming'] })
  @ApiQuery({ name: 'page', required: false, type: 'integer' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer' })
  @ApiResponse({ status: 200, description: 'Deposits, newest first', type: PaginatedCryptoDepositResponse })
  cryptoDeposits(
    @TenantDb() db: PrismaClient,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.money.listCryptoDeposits(db, { status, page: Number(page) || 1, limit: Number(limit) || 20 });
  }

  @Post('crypto-deposits/:id/assign')
  @RequirePermission('money.move')
  @HttpCode(200)
  @ApiOperation({ summary: 'Settle an open crypto collection with a deposit that did not match on its own' })
  @ApiResponse({ status: 200, description: 'The collection', type: MoneyMovementResponse })
  assignDeposit(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Param('id') id: string, @Body() dto: AssignDepositDto) {
    return this.money.assignCryptoDeposit(db, req.tenant.id, id, dto.collectionId);
  }

  @Post('providers/:provider/otp')
  @RequirePermission('money.move')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Text a payer the one-time code some providers need before a mobile money collection',
    description: 'Pass the returned pinId, with the code the payer reads back, as `otp` when creating the collection.',
  })
  @ApiResponse({ status: 200, description: 'Code sent', type: PayerOtpResponse })
  requestOtp(@TenantDb() db: PrismaClient, @Param('provider') provider: string, @Body() dto: RequestOtpDto) {
    return this.money.requestPayerOtp(db, provider, dto.phone);
  }

  @Post('providers/:provider/verify-payee')
  @RequirePermission('money.move')
  @HttpCode(200)
  @ApiOperation({ summary: 'Look up the name registered to a payee account before paying it' })
  @ApiResponse({ status: 200, description: 'Lookup result', type: VerifyPayeeResponse })
  verifyPayee(@TenantDb() db: PrismaClient, @Param('provider') provider: string, @Body() dto: VerifyPayeeDto) {
    return this.money.verifyPayee(db, provider, dto.payee);
  }
}
