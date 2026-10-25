import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { CloudPlansController } from './cloud-plans.controller';
import { CloudPlansService } from './cloud-plans.service';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [SubscriptionsModule, InvoicesModule],
  controllers: [CloudPlansController],
  providers: [CloudPlansService, TenantGuard],
  exports: [CloudPlansService],
})
export class CloudPlansModule {}
