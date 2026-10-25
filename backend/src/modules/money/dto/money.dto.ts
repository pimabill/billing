import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayerOtpDto, partySchema } from './party.dto';
import { IsBoolean, IsDefined, IsEmail, IsIn, IsObject, IsOptional, IsString, IsUrl, Length, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

export class CreateCollectionDto {
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    example: '50000',
    description: 'Amount in major units, e.g. "50000" UGX or "19.99" USD',
  })
  @IsDefined()
  amount!: string | number;

  @ApiProperty({ example: 'UGX' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ ...partySchema, example: { type: 'mobile_money', msisdn: '256771234567' }, description: 'Who pays' })
  @IsObject()
  payer!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'yo', description: 'Provider to use; defaults to the first configured one that supports the payer type' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ example: 'Order #1042' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 'order-1042', description: 'Your reference. Reusing it returns the original collection instead of charging again.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ description: 'Customer this collection belongs to' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Credit this wallet with the amount once paid' })
  @IsOptional()
  @IsString()
  walletId?: string;

  @ApiPropertyOptional({ description: 'Where the provider sends the payer after a hosted checkout' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;

  @ApiPropertyOptional({
    type: PayerOtpDto,
    description: 'Code the payer received after POST /money/providers/{provider}/otp, where the provider asks for one (Eversend)',
  })
  @IsOptional()
  @IsObject()
  otp?: { pinId: string; pin: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreatePayoutDto {
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'number' }], example: '120000', description: 'Major units' })
  @IsDefined()
  amount!: string | number;

  @ApiProperty({ example: 'UGX' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ ...partySchema, example: { type: 'mobile_money', msisdn: '256771234567', name: 'Amina N' }, description: 'Who is paid' })
  @IsObject()
  payee!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'flutterwave' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ example: 'Supplier invoice 77' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: 'supplier-77', description: 'Your reference. Reusing it returns the original payout instead of paying twice.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ description: 'Pay out of this customer wallet (the amount is held immediately)' })
  @IsOptional()
  @IsString()
  walletId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateTransferDto {
  @ApiProperty()
  @IsString()
  fromWalletId!: string;

  @ApiProperty()
  @IsString()
  toWalletId!: string;

  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'number' }], example: '20000', description: 'Major units' })
  @IsDefined()
  amount!: string | number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ description: 'Your reference. Reusing it returns the original transfer.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateMoneySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  collections?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  transfers?: boolean;

  @ApiPropertyOptional({ example: { UGX: '1000000' }, description: 'Payouts at or above these amounts wait for approval' })
  @IsOptional()
  @IsObject()
  payoutApprovalThreshold?: Record<string, string>;

  @ApiPropertyOptional({ example: { UGX: '10000000' }, description: 'Maximum payouts per currency per UTC day' })
  @IsOptional()
  @IsObject()
  payoutDailyLimit?: Record<string, string>;
}

export class VerifyPayeeDto {
  @ApiProperty({ ...partySchema, example: { type: 'mobile_money', msisdn: '256771234567' } })
  @IsObject()
  payee!: Record<string, unknown>;
}

export class AssignDepositDto {
  @ApiProperty({ description: 'Open USDT on TRON collection this deposit pays' })
  @IsString()
  collectionId!: string;
}

export class ManagedBankDto {
  @ApiProperty({ example: '044', description: 'Bank code from Flutterwave\'s bank list for the country' })
  @IsString()
  @Length(2, 20)
  code!: string;

  @ApiProperty({ example: '0690000031' })
  @IsString()
  @Length(5, 34)
  accountNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountName?: string;
}

export const MANAGED_PAYOUT_TYPES = ['mobile_money', 'bank', 'paypal'] as const;

/** Where the platform pays out the balance it collects on the tenant's behalf. */
export class ManagedPayoutDestinationDto {
  @ApiProperty({ enum: MANAGED_PAYOUT_TYPES, example: 'mobile_money' })
  @IsIn(MANAGED_PAYOUT_TYPES)
  type!: (typeof MANAGED_PAYOUT_TYPES)[number];

  @ApiPropertyOptional({ example: '256771234567', description: 'Mobile money number in international format (mobile_money)' })
  @ValidateIf((d: ManagedPayoutDestinationDto) => d.type === 'mobile_money')
  @IsString()
  @Length(9, 16)
  msisdn?: string;

  @ApiPropertyOptional({ example: 'Rapcio Ltd', description: 'Name on the mobile money or PayPal account' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'finance@rapcio.com', description: 'PayPal account email (paypal)' })
  @ValidateIf((d: ManagedPayoutDestinationDto) => d.type === 'paypal')
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '044', description: 'Bank code (bank)' })
  @ValidateIf((d: ManagedPayoutDestinationDto) => d.type === 'bank')
  @IsString()
  @Length(2, 20)
  bankCode?: string;

  @ApiPropertyOptional({ example: '0690000031', description: 'Account number (bank)' })
  @ValidateIf((d: ManagedPayoutDestinationDto) => d.type === 'bank')
  @IsString()
  @Length(5, 34)
  accountNumber?: string;

  @ApiPropertyOptional({ description: 'Name on the bank account (bank)' })
  @ValidateIf((d: ManagedPayoutDestinationDto) => d.type === 'bank')
  @IsString()
  @Length(2, 120)
  accountName?: string;
}

/** Contact details and where payouts go; anything left out stays as it is. */
export class UpdateManagedAccountDto {
  @ApiPropertyOptional({ example: 'finance@rapcio.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+256700000001' })
  @IsOptional()
  @IsString()
  @Length(9, 16)
  phone?: string;

  @ApiPropertyOptional({ type: ManagedPayoutDestinationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ManagedPayoutDestinationDto)
  payoutDestination?: ManagedPayoutDestinationDto;
}

export class OpenManagedAccountDto {
  @ApiProperty({ example: 'Rapcio Ltd' })
  @IsString()
  @Length(2, 120)
  businessName!: string;

  @ApiProperty({ example: 'finance@rapcio.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '+256700000001' })
  @IsString()
  @Length(9, 16)
  phone!: string;

  @ApiProperty({ example: 'UG' })
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiProperty({ example: 'UGX', description: 'Currency the bank account settles in' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  /** Bank details let the platform settle each payment straight to this account where the provider supports it. */
  @ApiPropertyOptional({ type: ManagedBankDto })
  @ValidateIf((d: OpenManagedAccountDto) => d.bank !== undefined || d.payoutDestination === undefined)
  @IsDefined({ message: 'Give bank details or a payout destination' })
  @ValidateNested()
  @Type(() => ManagedBankDto)
  bank?: ManagedBankDto;

  /** Otherwise the platform holds what it collects and pays it out here. */
  @ApiPropertyOptional({ type: ManagedPayoutDestinationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ManagedPayoutDestinationDto)
  payoutDestination?: ManagedPayoutDestinationDto;
}

export class RequestOtpDto {
  @ApiProperty({ example: '256771234567', description: 'Payer mobile number in international format' })
  @IsString()
  @Length(9, 16)
  phone!: string;
}
