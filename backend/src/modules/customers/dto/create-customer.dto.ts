import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsObject,
  IsInt,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: 'user_12345', description: "Tenant's user ID" })
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ required: false, example: 'Jane Doe' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false, example: 'NG' })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  country?: string;

  @ApiProperty({ example: 'NGN', description: 'An ISO 4217 code, or one of your own currencies (Settings → Currencies)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency: string;

  @ApiProperty({ required: false, description: 'Custom metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty({ type: 'integer', required: false, example: 30, description: 'Net payment terms in days (overrides org and plan defaults)' })
  @IsInt()
  @Min(0)
  @Max(365)
  @IsOptional()
  netPaymentTerms?: number;

  @ApiProperty({ required: false, description: 'Backdate createdAt (ISO 8601). For data imports.' })
  @IsDateString()
  @IsOptional()
  createdAt?: string;
}
