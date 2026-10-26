import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AddOnsService } from './add-ons.service';
import { CreateAddOnDto, UpdateAddOnDto, ApplyAddOnDto } from './dto/create-add-on.dto';
import { AddOnResponse, PaginatedAddOnResponse, AppliedAddOnResponse } from './dto/add-on-response.dto';

@ApiTags('Add-Ons')
@ApiBearerAuth('api-key')
@Public()
@UseGuards(TenantGuard)
@Controller('add-ons')
export class AddOnsController {
  constructor(private readonly addOnsService: AddOnsService) {}

  @Get()
  @ApiOperation({ summary: 'List add-ons', description: 'Retrieve a paginated list of add-ons with prices.' })
  @ApiQuery({ name: 'page', required: false, type: 'integer' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer' })
  @ApiQuery({ name: 'code', required: false, type: String, description: 'Only the add-on with this code; codes are the same in live and the sandbox' })
  @ApiResponse({ status: 200, description: 'Paginated list of add-ons', type: PaginatedAddOnResponse })
  async findAll(
    @TenantDb() db: PrismaClient,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('code') code?: string,
  ) {
    return this.addOnsService.findAll(db, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      code,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get add-on by ID' })
  @ApiParam({ name: 'id', description: 'Add-on ID' })
  @ApiResponse({ status: 200, description: 'Add-on details with prices', type: AddOnResponse })
  @ApiResponse({ status: 404, description: 'Add-on not found' })
  async findOne(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.addOnsService.findOne(db, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an add-on', description: 'Create a one-time charge add-on with multi-currency pricing.' })
  @ApiResponse({ status: 201, description: 'Add-on created', type: AddOnResponse })
  @ApiResponse({ status: 400, description: 'Invalid data or duplicate code' })
  async create(@TenantDb() db: PrismaClient, @Body() dto: CreateAddOnDto) {
    return this.addOnsService.create(db, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an add-on' })
  @ApiParam({ name: 'id', description: 'Add-on ID' })
  @ApiResponse({ status: 200, description: 'Add-on updated', type: AddOnResponse })
  @ApiResponse({ status: 404, description: 'Add-on not found' })
  async update(
    @TenantDb() db: PrismaClient,
    @Param('id') id: string,
    @Body() dto: UpdateAddOnDto,
  ) {
    return this.addOnsService.update(db, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an add-on' })
  @ApiParam({ name: 'id', description: 'Add-on ID' })
  @ApiResponse({ status: 200, description: 'Add-on deleted', type: AddOnResponse })
  @ApiResponse({ status: 404, description: 'Add-on not found' })
  async delete(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.addOnsService.delete(db, id);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Apply add-on to customer', description: 'Create a one-time charge for a customer. Will be included in the next invoice.' })
  @ApiResponse({ status: 201, description: 'Add-on applied', type: AppliedAddOnResponse })
  @ApiResponse({ status: 404, description: 'Add-on, customer, or subscription not found' })
  async apply(@TenantDb() db: PrismaClient, @Body() dto: ApplyAddOnDto) {
    return this.addOnsService.apply(db, dto);
  }

  @Get('applied/list')
  @ApiOperation({ summary: 'List applied add-ons', description: 'View one-time charges applied to customers.' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'invoiced', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: 'integer' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer' })
  @ApiResponse({ status: 200, description: 'Paginated list of applied add-ons', type: [AppliedAddOnResponse] })
  async findApplied(
    @TenantDb() db: PrismaClient,
    @Query('customerId') customerId?: string,
    @Query('invoiced') invoiced?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.addOnsService.findApplied(db, {
      customerId,
      invoiced: invoiced !== undefined ? invoiced === 'true' : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Delete('applied/:id')
  @ApiOperation({ summary: 'Remove applied add-on', description: 'Remove a one-time charge that has not yet been invoiced.' })
  @ApiParam({ name: 'id', description: 'Applied add-on ID' })
  @ApiResponse({ status: 200, description: 'Applied add-on removed', type: AppliedAddOnResponse })
  @ApiResponse({ status: 400, description: 'Cannot remove an already-invoiced add-on' })
  @ApiResponse({ status: 404, description: 'Applied add-on not found' })
  async removeApplied(@TenantDb() db: PrismaClient, @Param('id') id: string) {
    return this.addOnsService.removeApplied(db, id);
  }
}
