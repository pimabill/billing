import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMeta } from '../../../common/dto/pagination.dto';

const RAILS = [
  'card',
  'bank',
  'mobile_money',
  'paypal',
  'yo_account',
  'hosted',
  'crypto',
  'wallet',
];

export class PaymentDetailsResponse {
  @ApiProperty({ example: 'crypto_address', enum: ['crypto_address'] })
  kind: 'crypto_address';

  @ApiProperty({ example: 'USDT' })
  coin: string;

  @ApiProperty({ example: 'tron' })
  chain: string;

  @ApiProperty({ example: 'TQ4b...' })
  address: string;

  @ApiProperty({ example: '25.000137', description: 'Exact amount to send, in the coin' })
  amount: string;

  @ApiPropertyOptional()
  memo?: string;
}

/** A collection, payout or transfer. */
export class MoneyMovementResponse {
  @ApiProperty({ example: 'clx1234567890' })
  id: string;

  @ApiProperty({ example: 'collection', enum: ['collection', 'payout', 'transfer'] })
  type: string;

  @ApiProperty({
    example: 'processing',
    enum: [
      'requires_approval',
      'pending',
      'processing',
      'succeeded',
      'failed',
      'stuck',
      'canceled',
    ],
    description:
      'stuck: the provider could not say whether the money moved; it is re-checked, never resent',
  })
  status: string;

  @ApiProperty({ example: '50000.0000', description: 'Major units' })
  amount: string;

  @ApiProperty({ example: 'UGX' })
  currency: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'yo',
    description: 'Null for wallet transfers',
  })
  provider: string | null;

  @ApiProperty({ example: 'mobile_money', enum: RAILS })
  rail: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { type: 'mobile_money', msisdn: '256771234567' },
    description: 'Payer (collections) or payee (payouts)',
  })
  party: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Your own reference, if you gave one' })
  reference: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Reference sent to the provider' })
  providerReference: string | null;

  @ApiProperty({ type: String, nullable: true })
  providerTransactionId: string | null;

  @ApiProperty({ type: String, nullable: true })
  providerStatus: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Send the payer here to finish a hosted payment',
  })
  paymentUrl: string | null;

  @ApiProperty({
    type: PaymentDetailsResponse,
    nullable: true,
    description: 'Or show the payer these instructions',
  })
  paymentDetails: PaymentDetailsResponse | null;

  @ApiProperty({ type: String, nullable: true })
  failureReason: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Provider fee, when reported' })
  fee: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Platform commission on this movement',
  })
  commission: string | null;

  @ApiProperty({ type: String, nullable: true, enum: ['tenant', 'payer'] })
  commissionChargeTo: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'What the payer was asked for, when it differs from amount',
  })
  chargedAmount: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Wallet credited (collections) or debited (payouts, transfers)',
  })
  walletId: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Transfers: the destination wallet' })
  toWalletId: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  approvedAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  approvedBy: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: string | null;
}

export class PaginatedMoneyMovementResponse {
  @ApiProperty({ type: [MoneyMovementResponse] })
  data: MoneyMovementResponse[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}

export class CommissionRuleResponse {
  @ApiPropertyOptional({ type: 'integer', example: 150, description: 'Basis points: 150 = 1.5%' })
  rateBps?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { UGX: '500' },
  })
  flat?: Record<string, string>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  min?: Record<string, string>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  max?: Record<string, string>;

  @ApiPropertyOptional({ enum: ['tenant', 'payer'] })
  chargeTo?: 'tenant' | 'payer';
}

export class CommissionSettingsResponse {
  @ApiPropertyOptional({ type: CommissionRuleResponse })
  collection?: CommissionRuleResponse;

  @ApiPropertyOptional({ type: CommissionRuleResponse })
  payout?: CommissionRuleResponse;

  @ApiPropertyOptional({ type: CommissionRuleResponse })
  transfer?: CommissionRuleResponse;
}

export class MoneySettingsResponse {
  @ApiProperty()
  collections: boolean;

  @ApiProperty()
  transfers: boolean;

  @ApiProperty({ description: 'Enabled by the platform operator' })
  payouts: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { UGX: '1000000' },
    description: 'Payouts at or above this amount wait for approval',
  })
  payoutApprovalThreshold: Record<string, string>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { UGX: '5000000' },
  })
  payoutDailyLimit: Record<string, string>;

  @ApiProperty({ type: CommissionSettingsResponse, description: 'Set by the platform operator' })
  commission: CommissionSettingsResponse;
}

export class ProviderCapabilitiesResponse {
  @ApiProperty({ enum: RAILS, isArray: true, example: ['mobile_money'] })
  collect: string[];

  @ApiProperty({ enum: RAILS, isArray: true, example: ['mobile_money', 'bank'] })
  payout: string[];

  @ApiProperty({ description: 'Reports its balance' })
  balance: boolean;

  @ApiProperty({ description: 'Can look up the name on a payee account' })
  verifyPayee: boolean;
}

export class MoneyProviderResponse {
  @ApiProperty({ example: 'yo' })
  provider: string;

  @ApiProperty({ type: ProviderCapabilitiesResponse })
  capabilities: ProviderCapabilitiesResponse;
}

export class MoneyCapabilitiesResponse {
  @ApiProperty({ type: MoneySettingsResponse })
  settings: MoneySettingsResponse;

  @ApiProperty({ type: [MoneyProviderResponse] })
  providers: MoneyProviderResponse[];
}

export class ProviderBalanceResponse {
  @ApiProperty({ example: 'yo' })
  provider: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { UGX: '1250000.00' },
  })
  balances: Record<string, string>;
}

export class VerifyPayeeResponse {
  @ApiProperty()
  valid: boolean;

  @ApiPropertyOptional({ example: 'JANE DOE' })
  name?: string;
}

export class PayerOtpResponse {
  @ApiProperty({ description: 'Pass back as otp.pinId when creating the collection' })
  pinId: string;
}

export class CryptoDepositResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'tron' })
  chain: string;

  @ApiProperty({ example: 'USDT' })
  token: string;

  @ApiProperty({ description: 'Your address it arrived at' })
  address: string;

  @ApiProperty()
  txHash: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Sending address, when the chain reports one',
  })
  from: string | null;

  @ApiProperty({ example: '25.000137' })
  amount: string;

  @ApiProperty({ type: String, format: 'date-time' })
  blockTime: string;

  @ApiProperty({
    enum: ['matched', 'unmatched', 'assigned', 'confirming'],
    description:
      'matched: paid a collection on its own; assigned: matched by a person; confirming: not yet deep enough (Bitcoin)',
  })
  status: string;

  @ApiProperty({ type: String, nullable: true, description: 'The collection it paid, if any' })
  collectionId: string | null;
}

export class PaginatedCryptoDepositResponse {
  @ApiProperty({ type: [CryptoDepositResponse] })
  data: CryptoDepositResponse[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}

export class ManagedFeeResponse {
  @ApiProperty({ enum: ['percentage', 'flat'] })
  type: 'percentage' | 'flat';

  @ApiProperty({ example: 2.5 })
  value: number;
}

export class ManagedAccountResponse {
  @ApiProperty()
  id: string;

  @ApiProperty({
    example: 'pending_review',
    enum: ['pending_review', 'active', 'rejected', 'suspended'],
  })
  status: string;

  @ApiProperty()
  businessName: string;

  @ApiProperty({ example: 'UG' })
  country: string;

  @ApiProperty({ example: 'UGX' })
  currency: string;

  @ApiPropertyOptional()
  bankName?: string;

  @ApiPropertyOptional({ example: '4321' })
  accountNumberLast4?: string;

  @ApiPropertyOptional({ type: ManagedFeeResponse, description: "Platform fee on each payment, on top of the provider's fee" })
  fee?: ManagedFeeResponse;

  @ApiPropertyOptional({
    enum: ['direct', 'balance'],
    description: 'direct: each payment settles to the bank account; balance: held by the platform and paid out',
  })
  settlement?: string;

  @ApiPropertyOptional({ example: 'Mobile money ****6464', description: 'Where payouts go, masked' })
  payoutDestination?: string;

  @ApiPropertyOptional({ example: 'finance@rapcio.com' })
  email?: string;

  @ApiPropertyOptional({ example: '+256700000001' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Why the account was not approved' })
  reason?: string;
}

export class ManagedStatusResponse {
  @ApiProperty({ description: 'Whether managed payments are offered on this installation' })
  available: boolean;

  @ApiProperty({ type: ManagedAccountResponse, nullable: true })
  account: ManagedAccountResponse | null;
}
