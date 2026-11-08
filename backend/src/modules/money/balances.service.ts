import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-tenant/client';
import { formatScaled, toScaled } from '../ledger/ledger.money';
import { providerName } from '../payment-providers/provider-catalogue';
import { GatewayAccountsService } from './gateway.service';
import { MoneyService } from './money.service';
import { ProviderRegistryService } from './provider-registry.service';

/** What one provider holds in one currency. Pending is null when the provider does not say. */
export interface BalanceAmount {
  available: string;
  pending: string | null;
}

export interface BalanceSource {
  provider: string;
  name: string;
  balances: Record<string, BalanceAmount>;
}

export interface CurrencyBalance {
  currency: string;
  available: string;
  pending: string;
  sources: { provider: string; name: string; available: string; pending: string | null }[];
}

export interface BalancesOverview {
  currencies: CurrencyBalance[];
  /** Providers that report balances but could not be reached just now. */
  unavailable: { provider: string; name: string; error: string }[];
  checkedAt: string;
}

const TIMEOUT_MS = 10_000;

/** Money in a currency from every provider, as one balance per currency. Currencies holding money come first. */
export function combineBalances(sources: BalanceSource[]): CurrencyBalance[] {
  const byCurrency = new Map<string, { available: bigint; pending: bigint; sources: CurrencyBalance['sources'] }>();
  for (const source of sources) {
    for (const [code, amount] of Object.entries(source.balances)) {
      const currency = code.toUpperCase();
      const entry = byCurrency.get(currency) ?? { available: 0n, pending: 0n, sources: [] };
      entry.available += toScaled(amount.available);
      entry.pending += toScaled(amount.pending ?? '0');
      entry.sources.push({ provider: source.provider, name: source.name, available: amount.available, pending: amount.pending });
      byCurrency.set(currency, entry);
    }
  }
  return [...byCurrency.entries()]
    .map(([currency, e]) => ({ currency, available: formatScaled(e.available), pending: formatScaled(e.pending), sources: e.sources, total: e.available + e.pending }))
    .sort((a, b) => Number(b.total > 0n) - Number(a.total > 0n) || a.currency.localeCompare(b.currency))
    .map(({ total: _total, ...rest }) => rest);
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('No answer in time')), TIMEOUT_MS).unref?.())]);
}

/**
 * Balances per currency, as Flutterwave shows them: what is available and
 * what is still pending, from the payment gateway and every provider that
 * reports a balance, asked at the same time.
 */
@Injectable()
export class BalancesService {
  private readonly logger = new Logger(BalancesService.name);

  constructor(
    private readonly money: MoneyService,
    private readonly registry: ProviderRegistryService,
    private readonly gateway: GatewayAccountsService,
  ) {}

  async overview(db: PrismaClient): Promise<BalancesOverview> {
    const providers = (await this.registry.list(db)).filter((p) => p.capabilities.balance && p.provider !== 'gateway');
    const asks: { provider: string; fetch: () => Promise<Record<string, BalanceAmount> | null> }[] = [
      {
        provider: 'gateway',
        fetch: async () => {
          const balances = await this.gateway.balances(db);
          return balances ? Object.fromEntries(Object.entries(balances).map(([c, b]) => [c, { available: b.available, pending: b.pending }])) : null;
        },
      },
      ...providers.map((p) => ({
        provider: p.provider,
        fetch: async () => Object.fromEntries(Object.entries((await this.money.balance(db, p.provider)).balances).map(([c, v]) => [c, { available: String(v), pending: null }])),
      })),
    ];

    const results = await Promise.allSettled(asks.map((a) => withTimeout(a.fetch())));
    const sources: BalanceSource[] = [];
    const unavailable: BalancesOverview['unavailable'] = [];
    results.forEach((result, i) => {
      const { provider } = asks[i];
      const name = providerName(provider);
      if (result.status === 'fulfilled') {
        if (result.value) sources.push({ provider, name, balances: result.value });
        return;
      }
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      this.logger.warn(`Could not read the ${provider} balance: ${error}`);
      unavailable.push({ provider, name, error: 'Could not be reached just now' });
    });
    return { currencies: combineBalances(sources), unavailable, checkedAt: new Date().toISOString() };
  }
}
