import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({ example: 'PTS', description: '2 to 10 letters or digits; not an ISO 4217 code' })
  @Matches(/^[A-Za-z0-9]{2,10}$/, { message: 'code is 2 to 10 letters or digits' })
  code: string;

  @ApiProperty({ example: 'Loyalty points' })
  @IsString()
  @Length(1, 60)
  name: string;

  @ApiPropertyOptional({ example: 'pts' })
  @IsOptional()
  @IsString()
  @Length(0, 8)
  symbol?: string;

  @ApiPropertyOptional({ example: 0, description: 'Decimal places, 0 to 8 (default 2)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  decimals?: number;

  @ApiPropertyOptional({ example: 100, description: 'How many units make one US dollar, for reports in your reporting currency' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  perUsd?: number;
}

export class UpdateCurrencyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 8)
  symbol?: string | null;

  @ApiPropertyOptional({ description: 'Only while nothing uses the currency' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  decimals?: number;

  @ApiPropertyOptional({ nullable: true, description: 'Units per US dollar; null to stop converting it' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @IsPositive()
  perUsd?: number | null;
}

export class ReportingCurrencyDto {
  @ApiProperty({ example: 'UGX', description: 'The currency reports and analytics convert into' })
  @Matches(/^[A-Za-z0-9]{2,10}$/)
  currency: string;
}
