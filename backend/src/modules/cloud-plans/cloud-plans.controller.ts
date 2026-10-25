import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../common/auth/permissions';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import { PAID_CODES } from './cloud-plans.catalogue';
import { CloudPlansService } from './cloud-plans.service';

export class PlanCheckoutDto {
  @ApiProperty({ enum: PAID_CODES, example: 'cloud_growth_monthly' })
  @IsIn(PAID_CODES)
  plan!: string;

  @ApiProperty({ example: 'UGX', description: 'One of the currencies the plan is priced in' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({ description: 'Where checkout returns to; defaults to the plan page in the dashboard' })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_tld: false })
  returnUrl?: string;
}

export class PlanCheckoutResponse {
  @ApiProperty({ description: 'Send the person here to pay' })
  url!: string;
}

/** Your organisation's plan on the hosted cloud: what it allows, what you use, and upgrading. */
@ApiTags('Plan')
@ApiBearerAuth('JWT')
@UseGuards(TenantGuard)
@Controller('tenants/me/plan')
export class CloudPlansController {
  constructor(private readonly plans: CloudPlansService) {}

  @Get()
  @RequirePermission('read')
  @ApiOperation({ summary: 'Your plan, its limits, your usage, and the plans you can move to' })
  status(@Req() req: RequestWithTenant) {
    return this.plans.status(req.tenant.id);
  }

  @Post('checkout')
  @RequirePermission('org.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start paying for a plan: returns a checkout link for its first invoice' })
  @ApiResponse({ status: 200, type: PlanCheckoutResponse })
  checkout(@Req() req: RequestWithTenant, @Body() dto: PlanCheckoutDto) {
    return this.plans.checkout(req.tenant.id, dto.plan, dto.currency, dto.returnUrl);
  }

  @Post('sync')
  @RequirePermission('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check for a payment just made and update your plan now' })
  async sync(@Req() req: RequestWithTenant) {
    await this.plans.sync(req.tenant.id);
    return this.plans.status(req.tenant.id);
  }

  @Post('cancel')
  @RequirePermission('org.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop your paid plan at the end of the period you paid for; you then return to Free' })
  async cancel(@Req() req: RequestWithTenant) {
    await this.plans.cancel(req.tenant.id);
    return this.plans.status(req.tenant.id);
  }
}
