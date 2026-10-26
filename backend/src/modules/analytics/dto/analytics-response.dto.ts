import { ApiProperty } from '@nestjs/swagger';

/** How amounts were converted: every total is in the organisation's reporting currency. */
export class ConversionInfo {
  @ApiProperty({ example: 'UGX', description: 'The reporting currency every total is in (Settings → Currencies)' })
  currency: string;

  @ApiProperty({ example: '2026-10-25', nullable: true, type: String, description: 'The newest day the exchange rates used are from' })
  ratesAsOf: string | null;

  @ApiProperty({ type: [String], example: [], description: 'Currencies with no exchange rate, left out of totals' })
  unconverted: string[];
}

export class CurrencyAmount {
  @ApiProperty({ example: 'UGX' }) currency: string;
  @ApiProperty({ example: '1250000.0000', description: 'Exactly as collected, not converted' }) amount: string;
}

export class RevenueAnalyticsResponse extends ConversionInfo {
  @ApiProperty({ type: [CurrencyAmount], description: 'Revenue per currency, exactly as collected' })
  byCurrency: CurrencyAmount[];

  @ApiProperty({ example: '12500.0000', description: 'Total revenue as decimal string' })
  totalRevenue: string;

  @ApiProperty({ type: 'integer', example: 45 })
  invoiceCount: number;

  @ApiProperty({ example: '4200.0000', description: 'Monthly recurring revenue' })
  mrr: string;

  @ApiProperty({ example: '50400.0000', description: 'Annual recurring revenue' })
  arr: string;
}

export class SubscriptionAnalyticsResponse {
  @ApiProperty({ type: 'integer', example: 100 })
  total: number;

  @ApiProperty({ type: 'integer', example: 85 })
  active: number;

  @ApiProperty({ type: 'integer', example: 5 })
  canceled: number;

  @ApiProperty({ type: 'integer', example: 8 })
  trialing: number;

  @ApiProperty({ type: 'integer', example: 2 })
  paused: number;

  @ApiProperty({ type: 'integer', example: 12 })
  newSubscriptions: number;

  @ApiProperty({ example: '5.00', description: 'Churn rate percentage' })
  churnRate: string;

  @ApiProperty({ example: '95.00', description: 'Retention rate percentage' })
  retentionRate: string;
}

export class CustomerAnalyticsResponse extends ConversionInfo {
  @ApiProperty({ type: 'integer', example: 150 })
  totalCustomers: number;

  @ApiProperty({ type: 'integer', example: 12 })
  newCustomers: number;

  @ApiProperty({ example: '83.33', description: 'Average revenue per user' })
  arpu: string;

  @ApiProperty({ example: '12500.0000' })
  totalRevenue: string;
}

export class PaymentAnalyticsResponse {
  @ApiProperty({ type: 'integer', example: 200 })
  totalPayments: number;

  @ApiProperty({ type: 'integer', example: 180 })
  succeeded: number;

  @ApiProperty({ type: 'integer', example: 15 })
  failed: number;

  @ApiProperty({ type: 'integer', example: 5 })
  pending: number;

  @ApiProperty({ example: '90.00', description: 'Success rate percentage' })
  successRate: string;
}

export class MrrPlanBreakdown {
  @ApiProperty() planId: string;
  @ApiProperty() planName: string;
  @ApiProperty() mrr: number;
  @ApiProperty() subscriptionCount: number;
}

export class MrrBreakdownResponse extends ConversionInfo {
  @ApiProperty() totalMrr: number;
  @ApiProperty() newMrr: number;
  @ApiProperty() expansionMrr: number;
  @ApiProperty() contractionMrr: number;
  @ApiProperty() churnMrr: number;
  @ApiProperty() netNewMrr: number;
  @ApiProperty({ type: [MrrPlanBreakdown] }) byPlan: MrrPlanBreakdown[];
}

export class NetRevenueResponse extends ConversionInfo {
  @ApiProperty() grossRevenue: number;
  @ApiProperty() refunds: number;
  @ApiProperty() creditNotes: number;
  @ApiProperty() netRevenue: number;
}

export class CohortRow {
  @ApiProperty({ example: '2026-01' }) month: string;
  @ApiProperty() totalCustomers: number;
  @ApiProperty({ type: [Number] }) retentionPercentages: number[];
}

export class ChurnCohortsResponse {
  @ApiProperty({ type: [String] }) months: string[];
  @ApiProperty({ type: [CohortRow] }) cohorts: CohortRow[];
}

export class LtvPlanBreakdown {
  @ApiProperty() planId: string;
  @ApiProperty() planName: string;
  @ApiProperty() avgLtv: number;
  @ApiProperty() avgLifespanDays: number;
}

export class LtvResponse extends ConversionInfo {
  @ApiProperty() avgLtv: number;
  @ApiProperty() avgLifespanDays: number;
  @ApiProperty({ type: [LtvPlanBreakdown] }) byPlan: LtvPlanBreakdown[];
}

export class KpisResponse extends ConversionInfo {
  @ApiProperty({ example: 4200, description: 'Monthly Recurring Revenue in your reporting currency' })
  mrr: number;

  @ApiProperty({ example: 50400, description: 'Annual Recurring Revenue (MRR × 12) in your reporting currency' })
  arr: number;

  @ApiProperty({ example: 12500, description: 'Total all-time revenue from paid invoices in your reporting currency' })
  totalRevenue: number;

  @ApiProperty({ type: 'integer', example: 85, description: 'Number of currently active subscriptions' })
  activeSubscriptions: number;

  @ApiProperty({ example: 100, description: 'Total number of subscriptions ever created' })
  totalSubscriptions: number;

  @ApiProperty({ type: 'integer', example: 150, description: 'Total registered customers' })
  totalCustomers: number;

  @ApiProperty({ type: 'integer', example: 12, description: 'New customers created within the selected period' })
  newCustomers: number;

  @ApiProperty({ example: '5.00%', description: 'Churn rate: canceled / total subscriptions' })
  churnRate: string;

  @ApiProperty({ example: '95.00%', description: 'Retention rate: 100 - churn rate' })
  retentionRate: string;

  @ApiProperty({ example: '90.00%', description: 'Payment success rate' })
  successRate: string;

  @ApiProperty({ example: 83.33, description: 'Average Revenue Per User in your reporting currency' })
  arpu: number;

  @ApiProperty({ example: 500, description: 'Average customer Lifetime Value in your reporting currency' })
  avgLtv: number;

  @ApiProperty({ example: 180, description: 'Average customer lifespan in days' })
  avgLifespanDays: number;
}

export class CurrencyTotals {
  @ApiProperty({ example: 'UGX' }) currency: string;
  @ApiProperty({ example: '3200000.0000', description: 'Paid this calendar month, as collected' }) collectedThisMonth: string;
  @ApiProperty({ example: '2900000.0000', description: 'Paid last calendar month, as collected' }) collectedLastMonth: string;
  @ApiProperty({ example: '650000.0000', description: 'On unpaid invoices' }) outstanding: string;
  @ApiProperty({ example: '2100000.0000', description: 'Monthly recurring revenue in this currency' }) mrr: string;
  @ApiProperty({ example: 1, nullable: true, type: Number, description: 'One unit in the reporting currency at today\'s rate' }) rate: number | null;
}

export class ByCurrencyResponse extends ConversionInfo {
  @ApiProperty({ type: [CurrencyTotals] }) currencies: CurrencyTotals[];
}
