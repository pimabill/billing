import { Controller, Get, Post, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { InvoiceResponse, PaginatedInvoiceResponse, CheckoutResponse } from './dto/invoice-response.dto';
import { MessageResponse } from '../auth/dto/auth-response.dto';

@ApiTags('Invoices')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({
    summary: 'List invoices',
    description:
      'Retrieve a paginated list of invoices. Supports filtering by status, customer, and date range.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of invoices', type: PaginatedInvoiceResponse })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@TenantDb() db: PrismaClient, @Query() query: InvoiceQueryDto) {
    return this.invoicesService.findAll(db, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get invoice by ID',
    description:
      'Retrieve detailed invoice information including associated customer, subscription, and payments.',
  })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: 'Invoice details with related records', type: InvoiceResponse })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async findOne(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.invoicesService.findOne(db, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new invoice',
    description:
      'Create a draft invoice with line items. The total amount is automatically calculated from the items. ' +
      'For a one-time charge, add `checkout: {}`: the response includes `checkout.checkoutUrl`, a payment link for the customer.',
  })
  @ApiResponse({ status: 201, description: 'Invoice created in draft status', type: InvoiceResponse })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async create(
    @TenantDb() db: PrismaClient,
    @Tenant() tenant: { id: string },
    @Body() dto: CreateInvoiceDto,
  ) {
    const { checkout, ...fields } = dto;
    const invoice = await this.invoicesService.create(db, tenant.id, fields as CreateInvoiceDto);
    if (!checkout) return invoice;
    // A one-time charge: the invoice and the link to pay it, in one call.
    const link = await this.invoicesService.createCheckout(db, (invoice as { id: string }).id, checkout.callbackUrl, checkout.providerName, tenant.id, checkout.amount);
    return { ...invoice, checkout: link };
  }

  @Post(':id/finalize')
  @ApiOperation({
    summary: 'Finalize a draft invoice',
    description: 'Move an invoice from draft to pending status, making it ready for payment.',
  })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: 'Invoice finalized and set to pending', type: InvoiceResponse })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async finalize(
    @TenantDb() db: PrismaClient,
    @Tenant() tenant: { id: string },
    @Param('id') id: string,
  ) {
    return this.invoicesService.finalize(db, tenant.id, id);
  }

  @Post(':id/void')
  @ApiOperation({
    summary: 'Void an invoice',
    description: 'Cancel an unpaid invoice. Paid invoices cannot be voided — use a refund instead.',
  })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: 'Invoice voided', type: InvoiceResponse })
  @ApiResponse({ status: 400, description: 'Cannot void a paid invoice' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async voidInvoice(
    @TenantDb() db: PrismaClient,
    @Tenant() tenant: { id: string },
    @Param('id') id: string,
  ) {
    return this.invoicesService.void(db, tenant.id, id);
  }

  @Post(':id/mark-paid')
  @ApiOperation({
    summary: 'Manually mark invoice as paid',
    description:
      'Record an offline or manual payment against an invoice. ' +
      'Accepts an optional paymentMethod (e.g. "cash", "bank_transfer", "check", "manual").',
  })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        paymentMethod: {
          type: 'string',
          description: 'Payment method used (cash, bank_transfer, check, manual). Defaults to "manual".',
          example: 'cash',
        },
        amount: {
          type: 'number',
          description: 'Part of the invoice paid, for a deposit or an instalment. Defaults to everything still due; the invoice is paid once payments cover it.',
          example: 50,
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Invoice marked as paid', type: InvoiceResponse })
  @ApiResponse({ status: 400, description: 'Invoice is already paid' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async markPaid(
    @TenantDb() db: PrismaClient,
    @Tenant() tenant: { id: string },
    @Param('id') id: string,
    @Body() body: { paymentMethod?: string; amount?: number },
  ) {
    return this.invoicesService.markPaid(db, tenant.id, id, body.paymentMethod, body.amount);
  }

  @Post(':id/checkout')
  @ApiOperation({
    summary: 'Generate a checkout URL',
    description:
      'Initiate a payment session with a configured payment provider. ' +
      "Returns a checkout URL that redirects the customer to the provider's hosted payment page. " +
      'If multiple providers are configured, pass `providerName` to select a specific one; ' +
      'otherwise the highest-priority active provider is used.',
  })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        callbackUrl: {
          type: 'string',
          description: 'URL to redirect customer after payment',
          example: 'https://myapp.com/payment/complete',
        },
        providerName: {
          type: 'string',
          description: 'Optional: name of a specific active payment provider to use (e.g. "stripe", "paypal")',
          example: 'stripe',
        },
        amount: {
          type: 'number',
          description: 'Charge part of the invoice, for a deposit or an instalment. Defaults to everything still due.',
          example: 50,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Checkout session created',
    type: CheckoutResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invoice already paid, voided, or no provider configured',
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async checkout(
    @TenantDb() db: PrismaClient,
    @Req() req: { tenant: { id: string } },
    @Param('id') id: string,
    @Body() body: { callbackUrl?: string; providerName?: string; amount?: number },
  ) {
    return this.invoicesService.createCheckout(db, id, body.callbackUrl, body.providerName, req.tenant.id, body.amount);
  }

  @Post(':id/send-email')
  @ApiOperation({
    summary: 'Send invoice email',
    description:
      'Send the invoice to a specified email address, or to the customer\'s email if none is provided.',
  })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Recipient email address. Defaults to the customer email if omitted.',
          example: 'customer@example.com',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Email queued for delivery', type: MessageResponse })
  @ApiResponse({ status: 400, description: 'No email address available' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async sendEmail(
    @TenantDb() db: PrismaClient,
    @Tenant() tenant: { id: string },
    @Param('id') id: string,
    @Body() body: { email?: string },
  ) {
    return this.invoicesService.sendEmail(db, tenant.id, id, body.email);
  }

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Get or generate invoice PDF',
    description:
      'Returns the PDF binary for the invoice. If a PDF has not been generated yet, it will be created on-demand.',
  })
  @ApiParam({ name: 'id', description: 'Invoice ID' })
  @ApiResponse({
    status: 200,
    description: 'Invoice PDF binary',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getPdf(
    @TenantDb() db: PrismaClient,
    @Tenant() tenant: { id: string },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.invoicesService.generateOrGetPdf(db, tenant.id, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
