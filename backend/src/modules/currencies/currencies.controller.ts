import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { Public } from '../../common/decorators/public.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { RequirePermission } from '../../common/auth/permissions';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto, ReportingCurrencyDto, UpdateCurrencyDto } from './dto/currency.dto';

@ApiTags('Currencies')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@Controller('currencies')
/** The organisation's currency settings; GET /currencies (the public list of ISO currencies) stays in tenants. */
export class CurrencySettingsController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Your reporting currency, the currencies you use and define, and every ISO 4217 currency' })
  overview(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant) {
    return this.currencies.overview(db, req.tenant.id);
  }

  @Put('reporting')
  @RequirePermission('org.manage')
  @ApiOperation({ summary: 'Set the currency reports and analytics convert into' })
  async setReporting(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Body() dto: ReportingCurrencyDto) {
    return { reportingCurrency: await this.currencies.setReportingCurrency(db, req.tenant.id, dto.currency) };
  }

  @Post('custom')
  @RequirePermission('billing.write')
  @ApiOperation({ summary: 'Define your own currency, e.g. points or a stablecoin' })
  create(@TenantDb() db: PrismaClient, @Body() dto: CreateCurrencyDto) {
    return this.currencies.createCustom(db, dto);
  }

  @Patch('custom/:code')
  @RequirePermission('billing.write')
  @ApiOperation({ summary: 'Rename one of your currencies or change its rate' })
  update(@TenantDb() db: PrismaClient, @Param('code') code: string, @Body() dto: UpdateCurrencyDto) {
    return this.currencies.updateCustom(db, code, dto);
  }

  @Delete('custom/:code')
  @RequirePermission('billing.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove one of your currencies, if nothing uses it' })
  async remove(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant, @Param('code') code: string) {
    await this.currencies.deleteCustom(db, req.tenant.id, code);
  }
}
