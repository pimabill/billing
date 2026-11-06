import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsDateString,
  ValidateNested,
  IsNumber,
  Min,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InvoiceItemDto } from './invoice-item.dto';

/** Ask for a payment link in the same call: a one-time charge in one request. */
export class InvoiceCheckoutOptionsDto {
  @ApiProperty({ required: false, example: 'https://shop.example.com/paid', description: 'Where the customer returns after paying' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiProperty({ required: false, example: 'flutterwave', description: 'A specific active provider; otherwise the highest-priority one that can take it' })
  @IsOptional()
  @IsString()
  providerName?: string;
  @ApiProperty({ required: false, example: 50, description: 'Charge part of the invoice now, such as a deposit; the rest can be paid later' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiProperty({ required: false, enum: ['card', 'mobile_money', 'paypal'], example: 'paypal', description: 'How the customer pays: only providers that take it are tried. Defaults to card.' })
  @IsOptional()
  @IsIn(['card', 'mobile_money', 'paypal'])
  method?: 'card' | 'mobile_money' | 'paypal';

  @ApiProperty({ required: false, example: true, description: 'Send the customer to the hosted checkout, where they choose how to pay from what you take. Not used with `providerName` or `method`.' })
  @IsOptional()
  @IsBoolean()
  hosted?: boolean;
}

export class CreateInvoiceDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({ required: false, description: 'Subscription ID (optional)' })
  @IsString()
  @IsOptional()
  subscriptionId?: string;

  @ApiProperty({ type: [InvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @ApiProperty({ example: '2025-02-15', description: 'Due date' })
  @IsDateString()
  dueDate: string;

  // --- Backdating fields (for data imports) ---

  @ApiProperty({ required: false, description: 'Override invoice status for imports', enum: ['DRAFT', 'PENDING', 'PAID', 'FAILED', 'CANCELED'] })
  @IsOptional()
  @IsString()
  status?: 'DRAFT' | 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED';

  @ApiProperty({ required: false, description: 'Override invoice number (e.g. INV-00042). Auto-generated if omitted.' })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ required: false, description: 'Currency override (defaults to customer currency)' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false, description: 'Paid at date (ISO 8601). For importing paid invoices.' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiProperty({ required: false, description: 'Backdate createdAt (ISO 8601). For data imports.' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiProperty({
    required: false,
    type: InvoiceCheckoutOptionsDto,
    description: 'Also create a payment link: the response then includes `checkout` with the URL to send the customer',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceCheckoutOptionsDto)
  checkout?: InvoiceCheckoutOptionsDto;
}
