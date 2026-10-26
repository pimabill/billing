import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InvoiceItemDto {
  @ApiProperty({
    required: false,
    example: 'cert-bundle-3m',
    description: "Sell an add-on once: its price in the invoice currency fills unitAmount and its name fills description. Use it for one-time products and bundles that never renew.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  addOnCode?: string;

  @ApiProperty({ example: 'Premium Monthly Plan', description: 'Required unless addOnCode is set' })
  @ValidateIf((o: InvoiceItemDto) => !o.addOnCode || o.description !== undefined)
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 9999.99, description: 'Required unless addOnCode is set' })
  @ValidateIf((o: InvoiceItemDto) => !o.addOnCode || o.unitAmount !== undefined)
  @IsNumber()
  @Min(0)
  unitAmount: number;
}
