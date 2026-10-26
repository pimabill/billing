import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import { currencyContext } from '../../common/utils/currency-context';
import { CurrenciesService } from './currencies.service';

/**
 * Runs each organisation request inside its currency context, so rounding and
 * formatting know the decimals of the currencies it defined. (A guard cannot
 * do this: what it sets does not reach the handler.)
 */
@Injectable()
export class CurrencyContextInterceptor implements NestInterceptor {
  constructor(private readonly currencies: CurrenciesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    if (!request?.tenant?.id || !request.tenantDb) return next.handle();
    return from(this.currencies.customDecimals(request.tenantDb, request.tenant.id).catch(() => new Map<string, number>())).pipe(
      switchMap((custom) => new Observable((subscriber) => currencyContext.run(custom, () => next.handle().subscribe(subscriber)))),
    );
  }
}
