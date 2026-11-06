import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanPriceResponse } from '../../plans/dto/plan-response.dto';

export class PortalCustomerResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'user_12345' })
  externalId: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  name?: string;

  @ApiProperty({ example: 'customer@example.com' })
  email: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiPropertyOptional({ example: 'US' })
  country?: string;
}

export class PortalPlanResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Pro' })
  name: string;

  @ApiProperty({
    example: 'MONTHLY',
    enum: ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
  })
  billingInterval: string;

  @ApiProperty({ type: [PlanPriceResponse] })
  prices: PlanPriceResponse[];
}

export class PortalSubscriptionResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'TRIALING', 'PAUSED'] })
  status: string;

  @ApiProperty({ type: PortalPlanResponse })
  plan: PortalPlanResponse;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ type: String, format: 'date-time' })
  currentPeriodStart: string;

  @ApiProperty({ type: String, format: 'date-time' })
  currentPeriodEnd: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  trialStart?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  trialEnd?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  cancelAt?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

export class PortalMerchantResponse {
  @ApiProperty({ example: 'Acme Internet' })
  name: string;
}

export class PortalInvoiceResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'INV-0042' })
  invoiceNumber: string;

  @ApiProperty({ example: 49.99 })
  amount: number;

  @ApiProperty({ example: 19.99, description: 'What is left to pay' })
  amountDue: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 'PAID', enum: ['DRAFT', 'PENDING', 'PAID', 'FAILED', 'CANCELED'] })
  status: string;

  @ApiProperty({ type: String, format: 'date-time' })
  dueDate: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  paidAt?: string;

  @ApiPropertyOptional()
  pdfUrl?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

export class PortalPaymentResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 49.99 })
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    example: 'SUCCEEDED',
    enum: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED'],
  })
  status: string;

  @ApiProperty({ example: 'stripe' })
  provider: string;

  @ApiPropertyOptional({ example: 'INV-0042' })
  invoiceNumber?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

export class PortalSummaryResponse {
  @ApiProperty({ type: 'integer' })
  activeSubscriptions: number;

  @ApiProperty({ example: 149.97, description: 'Sum of paid invoices' })
  totalSpent: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ type: 'integer' })
  pendingInvoices: number;
}

export class PortalPaymentOptionsResponse {
  @ApiProperty({ description: 'Customers can choose PayPal at checkout (for invoices in paypalCurrencies)' })
  paypal: boolean;

  @ApiProperty({ type: [String], example: ['USD', 'EUR', 'GBP'], description: 'Currencies PayPal takes' })
  paypalCurrencies: string[];
}

export class PortalBillingResponse {
  @ApiProperty({ type: PortalMerchantResponse })
  merchant: PortalMerchantResponse;

  @ApiProperty({ type: PortalPaymentOptionsResponse })
  paymentOptions: PortalPaymentOptionsResponse;

  @ApiProperty({ type: PortalCustomerResponse })
  customer: PortalCustomerResponse;

  @ApiProperty({ type: [PortalSubscriptionResponse], description: 'Active, trialing and paused' })
  subscriptions: PortalSubscriptionResponse[];

  @ApiProperty({ type: [PortalInvoiceResponse], description: 'Latest 20' })
  invoices: PortalInvoiceResponse[];

  @ApiProperty({ type: [PortalPaymentResponse], description: 'Latest 20' })
  payments: PortalPaymentResponse[];

  @ApiProperty({ type: PortalSummaryResponse })
  summary: PortalSummaryResponse;
}
