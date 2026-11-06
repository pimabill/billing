import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { checkoutMethod } from '../invoices/invoices.service';
import { HostedCheckoutService } from './hosted-checkout.service';

/** Behind the hosted checkout page; the link's token is the credential. Not part of the public API. */
@ApiExcludeController()
@Public()
@Controller('pay')
export class HostedCheckoutController {
  constructor(private readonly checkout: HostedCheckoutService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.checkout.view(token);
  }

  @Post(':token')
  @HttpCode(200)
  pay(@Param('token') token: string, @Body() body: { method?: string; provider?: string }) {
    const method = checkoutMethod(body?.method);
    if (!method) throw new BadRequestException('Choose how to pay');
    return this.checkout.pay(token, method, typeof body.provider === 'string' ? body.provider : undefined);
  }
}
