import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { validationSchema } from './config/validation.schema';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import jwtConfig from './config/jwt.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PaymentProvidersModule } from './modules/payment-providers/payment-providers.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { AddOnsModule } from './modules/add-ons/add-ons.module';
import { CreditNotesModule } from './modules/credit-notes/credit-notes.module';
import { PortalModule } from './modules/portal/portal.module';
import { CloudPlansModule } from './modules/cloud-plans/cloud-plans.module';
import { BillableMetricsModule } from './modules/billable-metrics/billable-metrics.module';
import { EventsModule } from './modules/events/events.module';
import { ChargesModule } from './modules/charges/charges.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { TaxesModule } from './modules/taxes/taxes.module';
import { PlanOverridesModule } from './modules/plan-overrides/plan-overrides.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PlatformModule } from './modules/platform/platform.module';
import { TeamModule } from './modules/team/team.module';
import { MoneyModule } from './modules/money/money.module';
import { QueuesModule } from './queues/queues.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, jwtConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ServicesModule,
    AuthModule,
    TenantsModule,
    CustomersModule,
    PlansModule,
    SubscriptionsModule,
    InvoicesModule,
    PaymentsModule,
    PaymentProvidersModule,
    WebhooksModule,
    AnalyticsModule,
    CurrenciesModule,
    CouponsModule,
    AddOnsModule,
    CreditNotesModule,
    PortalModule,
    CloudPlansModule,
    BillableMetricsModule,
    EventsModule,
    ChargesModule,
    WalletsModule,
    PaymentMethodsModule,
    TaxesModule,
    PlanOverridesModule,
    LedgerModule,
    PlatformModule,
    TeamModule,
    MoneyModule,
    QueuesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*splat');
  }
}
