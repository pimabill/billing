import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CurrencyContextInterceptor } from './currency-context.interceptor';
import { CurrencySettingsController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { FxRatesService } from './fx-rates.service';

/** Global: analytics, the tenant guard and billing all need the organisation's currencies. */
@Global()
@Module({
  controllers: [CurrencySettingsController],
  providers: [CurrenciesService, FxRatesService, { provide: APP_INTERCEPTOR, useClass: CurrencyContextInterceptor }],
  exports: [CurrenciesService, FxRatesService],
})
export class CurrenciesModule {}
