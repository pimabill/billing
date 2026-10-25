import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES } from '../../../common/auth/permissions';

export class TenantInfoResponse {
  @ApiProperty({ example: 'clx1234567890' })
  id: string;

  @ApiProperty({ example: 'Acme Corp' })
  name: string;

  @ApiProperty({ example: 'acme-corp' })
  slug: string;

  @ApiProperty({ example: 'john@company.com' })
  email: string;

  @ApiPropertyOptional({ example: 'https://example.com/webhooks' })
  webhookUrl?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ additionalProperties: true })
  settings?: Record<string, any>;

  @ApiPropertyOptional()
  lastLoginAt?: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class TokenPairResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  refreshToken: string;
}

export class SessionUserResponse {
  @ApiProperty({ example: 'clx1234567890' })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'john@company.com' })
  email: string;
}

export class OrganisationResponse {
  @ApiProperty({ example: 'clx1234567890' })
  id: string;

  @ApiProperty({ example: 'Acme Corp' })
  name: string;

  @ApiProperty({ example: 'acme-corp' })
  slug: string;

  @ApiProperty({ enum: ROLES, description: 'Your role there' })
  role: string;
}

/** The signed-in person in one organisation. */
export class SessionResponse {
  /** The organisation. */
  @ApiProperty({ type: TenantInfoResponse })
  tenant: TenantInfoResponse;

  @ApiProperty({ type: SessionUserResponse })
  user: SessionUserResponse;

  @ApiProperty({ enum: ROLES })
  role: string;

  @ApiProperty({ type: [String], example: ['read', 'billing.write'] })
  permissions: string[];

  @ApiPropertyOptional({ type: [OrganisationResponse], description: 'Every organisation you can switch to' })
  organisations?: OrganisationResponse[];
}

export class LoginResponse extends SessionResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  refreshToken: string;
}

export class RegisterResponse extends LoginResponse {
  @ApiProperty({ example: 'sk_live_abc123...', description: 'The new organisation\'s API key' })
  apiKey: string;
}

export class InvitationInfoResponse {
  @ApiProperty({ example: 'Acme Corp' })
  organisation: string;

  @ApiProperty({ example: 'jane@company.com' })
  email: string;

  @ApiProperty({ enum: ROLES })
  role: string;

  @ApiProperty({ description: 'Whether this email already has an account (then only the password is asked for)' })
  existingUser: boolean;
}

export class SandboxLinkResponse {
  @ApiProperty({ description: 'Pass to POST /auth/sandbox/accept on the sandbox within two minutes' })
  token: string;
}

export class MessageResponse {
  @ApiProperty({ example: 'Operation completed successfully' })
  message: string;
}
