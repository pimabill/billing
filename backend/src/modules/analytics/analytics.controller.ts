import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import {
  RevenueAnalyticsResponse,
  SubscriptionAnalyticsResponse,
  CustomerAnalyticsResponse,
  PaymentAnalyticsResponse,
  MrrBreakdownResponse,
  NetRevenueResponse,
  ChurnCohortsResponse,
  LtvResponse,
  KpisResponse,
  ByCurrencyResponse,
} from './dto/analytics-response.dto';

@ApiTags('Analytics')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('revenue')
  @ApiOperation({
    summary: 'Get revenue analytics',
    description:
      'Retrieve revenue metrics including total revenue, MRR (monthly recurring revenue), ' +
      'and revenue breakdown by period. Supports filtering by date range and currency.',
  })
  @ApiResponse({ status: 200, description: 'Revenue metrics and breakdown', type: RevenueAnalyticsResponse })
  async revenue(@TenantDb() db: PrismaClient, @Query() query: AnalyticsQueryDto, @Req() req: RequestWithTenant) {
    return this.analyticsService.getRevenueAnalytics(db, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      currency: query.currency,
    }, req.tenant.id);
  }

  @Get('subscriptions')
  @ApiOperation({
    summary: 'Get subscription analytics',
    description:
      'Retrieve subscription metrics including active count, churn rate, ' +
      'new subscriptions, and status distribution.',
  })
  @ApiResponse({ status: 200, description: 'Subscription metrics and trends', type: SubscriptionAnalyticsResponse })
  async subscriptions(@TenantDb() db: PrismaClient, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getSubscriptionAnalytics(db, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('customers')
  @ApiOperation({
    summary: 'Get customer analytics',
    description:
      'Retrieve customer metrics including total count, new customers, ' +
      'and geographic distribution.',
  })
  @ApiResponse({ status: 200, description: 'Customer metrics and distribution', type: CustomerAnalyticsResponse })
  async customers(@TenantDb() db: PrismaClient, @Query() query: AnalyticsQueryDto, @Req() req: RequestWithTenant) {
    return this.analyticsService.getCustomerAnalytics(db, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    }, req.tenant.id);
  }

  @Get('payments')
  @ApiOperation({
    summary: 'Get payment analytics',
    description:
      'Retrieve payment metrics including success rate, failure rate, ' +
      'total volume, and breakdown by payment provider.',
  })
  @ApiQuery({ name: 'provider', required: false, description: 'Filter by payment provider name' })
  @ApiResponse({ status: 200, description: 'Payment metrics and provider breakdown', type: PaymentAnalyticsResponse })
  async payments(
    @TenantDb() db: PrismaClient,
    @Query() query: AnalyticsQueryDto,
    @Query('provider') provider?: string,
  ) {
    return this.analyticsService.getPaymentAnalytics(db, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      provider,
    });
  }

  @Get('mrr-breakdown')
  @ApiOperation({
    summary: 'Get MRR breakdown',
    description: 'MRR breakdown by movement type (new, expansion, contraction, churn) and by plan.',
  })
  @ApiResponse({ status: 200, description: 'MRR breakdown', type: MrrBreakdownResponse })
  async mrrBreakdown(@TenantDb() db: PrismaClient, @Query() query: AnalyticsQueryDto, @Req() req: RequestWithTenant) {
    return this.analyticsService.getMrrBreakdown(db, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    }, req.tenant.id);
  }

  @Get('net-revenue')
  @ApiOperation({
    summary: 'Get net revenue',
    description: 'Gross revenue minus refunds and credit notes.',
  })
  @ApiResponse({ status: 200, description: 'Net revenue breakdown', type: NetRevenueResponse })
  async netRevenue(@TenantDb() db: PrismaClient, @Query() query: AnalyticsQueryDto, @Req() req: RequestWithTenant) {
    return this.analyticsService.getNetRevenue(db, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    }, req.tenant.id);
  }

  @Get('churn-cohorts')
  @ApiOperation({
    summary: 'Get churn cohort analysis',
    description: 'Monthly cohort retention matrix showing what percentage of each cohort is retained over time.',
  })
  @ApiQuery({ name: 'months', required: false, type: Number, description: 'Number of months to analyze (default 12)' })
  @ApiResponse({ status: 200, description: 'Cohort retention matrix', type: ChurnCohortsResponse })
  async churnCohorts(
    @TenantDb() db: PrismaClient,
    @Query('months') months?: string,
  ) {
    return this.analyticsService.getChurnCohorts(db, {
      months: months ? parseInt(months, 10) : undefined,
    });
  }

  @Get('ltv')
  @ApiOperation({
    summary: 'Get customer lifetime value',
    description: 'Average customer LTV and lifespan, broken down by plan.',
  })
  @ApiResponse({ status: 200, description: 'LTV metrics', type: LtvResponse })
  async ltv(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant) {
    return this.analyticsService.getLtv(db, req.tenant.id);
  }

  @Get('kpis')
  @ApiOperation({
    summary: 'Get aggregated KPIs',
    description:
      'Returns all headline KPIs in a single call: MRR, ARR, total revenue, active subscriptions, ' +
      'total customers, churn rate, success rate, ARPU, average LTV, and average customer lifespan.',
  })
  @ApiResponse({ status: 200, description: 'Aggregated KPI metrics', type: KpisResponse })
  async kpis(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant) {
    return this.analyticsService.getKpis(db, req.tenant.id);
  }

  @Get('by-currency')
  @ApiOperation({
    summary: 'Money per currency',
    description:
      'Collected this month and last, outstanding, and recurring revenue in each currency, exactly as they are ' +
      '(nothing converted), with each currency\'s rate into your reporting currency.',
  })
  @ApiResponse({ status: 200, description: 'Totals per currency', type: ByCurrencyResponse })
  async byCurrency(@TenantDb() db: PrismaClient, @Req() req: RequestWithTenant) {
    return this.analyticsService.getByCurrency(db, req.tenant.id);
  }
}
