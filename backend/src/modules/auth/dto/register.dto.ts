import { IsString, IsNotEmpty, IsEmail, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe', description: 'Full name of the tenant owner' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'john@company.com', description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'securePassword123', description: 'Password (min 8 characters)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Acme Corp', description: 'Company name (used to generate slug)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  companyName: string;

  @ApiProperty({ required: false, description: 'Cloudflare Turnstile token, when the server has Turnstile on (see GET /auth/captcha)' })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
