import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMeta } from '../../../common/dto/pagination.dto';

export class InvoiceCustomerResponse {
  @ApiProperty({ example: 'clx1234567890' })
  id: string;

  @ApiProperty({ example: 'Jane Doe' })
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;
}

export class CheckoutResponse {
  @ApiProperty({ example: 'https://paystack.com/pay/abc123' })
  checkoutUrl: string;

  @ApiProperty({ example: 'clxpay123' })
  paymentId: string;

  @ApiProperty({ example: 'paystack' })
  provider: string;

  @ApiProperty()
  expiresAt: string;
}

export class InvoiceResponse {
  @ApiProperty({ example: 'clx1234567890' })
  id: string;

  @ApiProperty({ example: 'INV-2026-0001' })
  invoiceNumber: string;

  @ApiPropertyOptional()
  subscriptionId?: string;

  @ApiProperty({ example: 'clxcust123' })
  customerId: string;

  @ApiProperty({ example: '99.9900', description: 'Decimal amount as string' })
  amount: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 'DRAFT', enum: ['DRAFT', 'PENDING', 'PAID', 'FAILED', 'CANCELED'] })
  status: string;

  @ApiProperty()
  dueDate: string;

  @ApiPropertyOptional()
  paidAt?: string;

  @ApiPropertyOptional({ example: '/uploads/invoices/inv-123.pdf' })
  pdfUrl?: string;

  @ApiPropertyOptional({ additionalProperties: true, description: 'Line items, plan info, discounts' })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ type: InvoiceCustomerResponse })
  customer?: InvoiceCustomerResponse;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiPropertyOptional({ type: () => CheckoutResponse, description: 'The payment link, when the invoice was created with `checkout`' })
  checkout?: CheckoutResponse;
}

export class PaginatedInvoiceResponse {
  @ApiProperty({ type: [InvoiceResponse] })
  data: InvoiceResponse[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}

