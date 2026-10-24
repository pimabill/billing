import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'john@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class SwitchOrganisationDto {
  @ApiProperty({ description: 'Organisation to switch to' })
  @IsString()
  @IsNotEmpty()
  tenantId: string;
}

export class AcceptSandboxLinkDto {
  @ApiProperty({ description: 'The link token from POST /auth/sandbox/link on live' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class CreateOrganisationDto {
  @ApiProperty({ example: 'Rapcio Ltd' })
  @IsString()
  @IsNotEmpty()
  companyName: string;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'Your password: the existing one if you already have an account, else a new one' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ required: false, description: 'Required when you do not have an account yet' })
  @IsOptional()
  @IsString()
  name?: string;
}
