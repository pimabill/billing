import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Patch,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethodResponse } from './dto/payment-method-response.dto';

@ApiTags('Payment Methods')
@ApiBearerAuth()
// TenantGuard authenticates both dashboard sessions and API keys (within their scopes).
@Public()
@UseGuards(TenantGuard)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Post()
  @ApiOperation({ summary: 'Save a payment method' })
  @ApiResponse({ status: 201, description: 'Payment method saved successfully', type: PaymentMethodResponse })
  async create(@Request() req: RequestWithTenant, @Body() createDto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(req.tenant.id, createDto);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get all payment methods for a customer' })
  @ApiResponse({ status: 200, description: 'Payment methods retrieved successfully', type: [PaymentMethodResponse] })
  async findAllByCustomer(
    @Request() req: RequestWithTenant,
    @Param('customerId') customerId: string,
  ) {
    return this.paymentMethodsService.findAll(req.tenant.id, customerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payment method by ID' })
  @ApiResponse({ status: 200, description: 'Payment method retrieved successfully', type: PaymentMethodResponse })
  async findOne(@Request() req: RequestWithTenant, @Param('id') id: string) {
    return this.paymentMethodsService.findOne(req.tenant.id, id);
  }

  @Patch(':id/set-default')
  @ApiOperation({ summary: 'Set a payment method as default' })
  @ApiResponse({ status: 200, description: 'Payment method set as default', type: PaymentMethodResponse })
  async setDefault(@Request() req: RequestWithTenant, @Param('id') id: string) {
    return this.paymentMethodsService.setDefault(req.tenant.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a payment method' })
  @ApiResponse({ status: 200, description: 'Payment method deleted successfully' })
  async remove(@Request() req: RequestWithTenant, @Param('id') id: string) {
    return this.paymentMethodsService.remove(req.tenant.id, id);
  }
}
