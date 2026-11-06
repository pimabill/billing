import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { MoneyModule } from '../money/money.module';
import { PortalController } from './portal.controller';
import { HostedCheckoutController } from './hosted-checkout.controller';
import { HostedCheckoutService } from './hosted-checkout.service';
import { PortalService } from './portal.service';
import { PortalGuard } from './portal.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [InvoicesModule, MoneyModule],
  controllers: [PortalController, HostedCheckoutController],
  providers: [PortalService, PortalGuard, TenantGuard, HostedCheckoutService],
  exports: [PortalService],
})
export class PortalModule {}
