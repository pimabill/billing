import { ApiProperty } from '@nestjs/swagger';

/** A configured provider, as configuring or updating it returns. */
export class ConfiguredPaymentProviderResponse {
  @ApiProperty({ example: 'clx1234567890' })
  id: string;

  @ApiProperty({ example: 'paystack' })
  providerName: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ type: 'integer', example: 1 })
  priority: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

/** One configured provider in full: no credentials, only which environment they are for. */
export class PaymentProviderDetailResponse extends ConfiguredPaymentProviderResponse {
  @ApiProperty({ example: 'Paystack' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ example: true })
  isConfigured: boolean;

  @ApiProperty({ enum: ['live', 'sandbox'], nullable: true, description: 'Which environment the saved credentials are for, when it can be told' })
  environment: 'live' | 'sandbox' | null;

  @ApiProperty({ nullable: true, type: String, description: 'Where the provider should send notifications; null when it sends none' })
  webhookUrl: string | null;
}

/** An entry of the provider list: every supported provider, configured or not. */
export class PaymentProviderResponse {
  @ApiProperty({ example: 'clx1234567890', nullable: true, type: String, description: 'Set once the provider is configured' })
  id: string | null;

  @ApiProperty({ example: 'paystack' })
  providerName: string;

  @ApiProperty({ example: 'Paystack' })
  name: string;

  @ApiProperty({ nullable: true, type: String, example: 'Accept payments from customers in Africa via cards, bank transfers, and mobile money' })
  description: string | null;

  @ApiProperty({ example: true, description: 'Credentials are saved for this organisation' })
  isConfigured: boolean;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ type: 'integer', example: 1, nullable: true, description: 'Lower is tried first; null until configured' })
  priority: number | null;

  @ApiProperty({ enum: ['live', 'sandbox'], nullable: true, description: 'Which environment the saved credentials are for, when it can be told' })
  environment: 'live' | 'sandbox' | null;

  @ApiProperty({ nullable: true, type: String, example: 'https://api.pimabill.com/webhooks/paystack/ten_123', description: 'Where the provider should send notifications; null when it sends none' })
  webhookUrl: string | null;

  @ApiProperty({ nullable: true, type: String })
  createdAt: string | null;

  @ApiProperty({ nullable: true, type: String })
  updatedAt: string | null;
}

export class ProviderTestResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Connection successful' })
  message: string;
}
