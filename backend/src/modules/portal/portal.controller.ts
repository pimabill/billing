import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesService } from '../invoices/invoices.service';
import { ConfigService } from '@nestjs/config';
import { RequestWithTenant } from '../../common/interfaces/request-with-tenant.interface';
import { signPortalToken } from '../../common/auth/tokens';
import { PortalGuard } from './portal.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PortalService } from './portal.service';
import { PortalBillingResponse } from './dto/portal-response.dto';
import { SubscriptionResponse } from '../subscriptions/dto/subscription-response.dto';
import { InvoiceResponse, PaginatedInvoiceResponse, CheckoutResponse } from '../invoices/dto/invoice-response.dto';
import { PaginatedPaymentResponse } from '../payments/dto/payment-response.dto';

/**
 * Customer-facing billing portal API.
 *
 * Called server to server with the tenant's API key, or from the browser
 * with a portal token issued for one customer (see `sessions`). Never put an
 * API key in a link given to a customer: it grants full access to the account.
 */
@ApiTags('Customer Portal')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(PortalGuard)
@Controller('portal/customers')
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    private readonly config: ConfigService,
    private readonly invoices: InvoicesService,
  ) {}

  @Post(':externalId/sessions')
  @ApiOperation({
    summary: 'Create a customer portal link',
    description:
      'Issues a short-lived token that opens the portal for this one customer, and the hosted portal URL that uses it. ' +
      'Hand customers this link, never your API key.',
  })
  @ApiParam({ name: 'externalId', description: 'Customer external ID' })
  @ApiResponse({ status: 201, description: 'Token, URL and expiry' })
  async createSession(
    @Req() req: RequestWithTenant,
    @TenantDb() db: PrismaClient,
    @Param('externalId') externalId: string,
    @Body() body: { expiresInMinutes?: number },
  ) {
    await this.resolveCustomerId(db, externalId);
    const minutes = body?.expiresInMinutes ?? 60;
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 7 * 24 * 60) {
      throw new BadRequestException('expiresInMinutes must be a whole number between 5 and 10080 (7 days)');
    }
    const token = signPortalToken(this.config.get<string>('JWT_SECRET')!, req.tenant.id, externalId, minutes * 60);
    const dashboardUrl = (process.env.DASHBOARD_URL || 'http://localhost:4002').replace(/\/$/, '');
    return {
      token,
      url: `${dashboardUrl}/portal/${encodeURIComponent(externalId)}?token=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    };
  }

  private async resolveCustomerId(db: PrismaClient, externalId: string): Promise<string> {
    const customer = await this.portalService.getCustomerByExternalId(db, externalId);
    return customer.id;
  }

  @Get(':externalId/billing')
  @ApiOperation({
    summary: 'Get customer billing overview',
    description: 'Returns subscriptions, recent invoices, payments, and summary stats for a customer. Use this to render a billing dashboard for your end-users.',
  })
  @ApiParam({ name: 'externalId', description: 'Customer external ID (your app user ID)' })
  @ApiResponse({ status: 200, description: 'Billing overview with subscriptions, invoices, payments', type: PortalBillingResponse })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getBillingOverview(
    @TenantDb() db: PrismaClient,
    @Param('externalId') externalId: string,
  ) {
    const customerId = await this.resolveCustomerId(db, externalId);
    return this.portalService.getBillingOverview(db, customerId);
  }

  @Get(':externalId/subscriptions')
  @ApiOperation({
    summary: 'List customer subscriptions',
    description: 'Returns all subscriptions for the customer with plan details.',
  })
  @ApiParam({ name: 'externalId', description: 'Customer external ID' })
  @ApiResponse({ status: 200, description: 'List of subscriptions with plan info', type: [SubscriptionResponse] })
  async getSubscriptions(
    @TenantDb() db: PrismaClient,
    @Param('externalId') externalId: string,
  ) {
    const customerId = await this.resolveCustomerId(db, externalId);
    return this.portalService.getSubscriptions(db, customerId);
  }

  @Get(':externalId/invoices')
  @ApiOperation({
    summary: 'List customer invoices',
    description: 'Returns a paginated list of invoices. Filter by status to show only pending invoices.',
  })
  @ApiParam({ name: 'externalId', description: 'Customer external ID' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'PAID', 'FAILED', 'CANCELED'] })
  @ApiQuery({ name: 'page', required: false, type: 'integer' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer' })
  @ApiResponse({ status: 200, description: 'Paginated invoices', type: PaginatedInvoiceResponse })
  async getInvoices(
    @TenantDb() db: PrismaClient,
    @Param('externalId') externalId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const customerId = await this.resolveCustomerId(db, externalId);
    return this.portalService.getInvoices(db, customerId, {
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post(':externalId/invoices/:invoiceId/checkout')
  @ApiOperation({
    summary: 'Create checkout for an invoice',
    description: 'Initiates a payment session with the configured payment provider. Returns a checkout URL to redirect the customer to.',
  })
  @ApiParam({ name: 'externalId', description: 'Customer external ID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: 'Checkout URL and payment details', type: CheckoutResponse })
  @ApiResponse({ status: 400, description: 'Invoice already paid or no provider configured' })
  async createCheckout(
    @TenantDb() db: PrismaClient,
    @Req() req: { tenant: { id: string } },
    @Param('externalId') externalId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() body: { callbackUrl?: string },
  ) {
    const customerId = await this.resolveCustomerId(db, externalId);
    if (body?.callbackUrl !== undefined && !/^https?:\/\//i.test(String(body.callbackUrl))) {
      throw new BadRequestException('callbackUrl must be an http(s) URL');
    }
    return this.portalService.getInvoiceCheckout(db, customerId, invoiceId, body?.callbackUrl, req.tenant.id);
  }

  @Get(':externalId/invoices/:invoiceId/pdf')
  @ApiOperation({ summary: "Download one of the customer's invoices as PDF" })
  @ApiParam({ name: 'externalId', description: 'Customer external ID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice ID' })
  @ApiResponse({ status: 200, description: 'The PDF' })
  async getInvoicePdf(
    @Req() req: RequestWithTenant,
    @Res() res: Response,
    @TenantDb() db: PrismaClient,
    @Param('externalId') externalId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    const customerId = await this.resolveCustomerId(db, externalId);
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { customerId: true, invoiceNumber: true } });
    if (!invoice || invoice.customerId !== customerId) throw new NotFoundException('Invoice not found');
    const pdf = await this.invoices.generateOrGetPdf(db, req.tenant.id, invoiceId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${(invoice.invoiceNumber || invoiceId).replace(/[^A-Za-z0-9_.-]/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(pdf);
  }

  @Get(':externalId/payments')
  @ApiOperation({
    summary: 'List customer payments',
    description: 'Returns a paginated list of all payments made by the customer.',
  })
  @ApiParam({ name: 'externalId', description: 'Customer external ID' })
  @ApiQuery({ name: 'page', required: false, type: 'integer' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer' })
  @ApiResponse({ status: 200, description: 'Paginated payments', type: PaginatedPaymentResponse })
  async getPayments(
    @TenantDb() db: PrismaClient,
    @Param('externalId') externalId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const customerId = await this.resolveCustomerId(db, externalId);
    return this.portalService.getPayments(db, customerId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
