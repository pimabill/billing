import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma-central/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { CronLockService } from '../../common/scheduling/cron-lock.service';

const DEFAULT_SOURCE = 'https://open.er-api.com/v6/latest/USD';
const DAY = 86_400_000;

export interface RateRow {
  date: Date;
  currency: string;
  perUsd: number;
}

/** The UTC calendar day of a moment, as stored in ExchangeRate.date. */
export const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Daily exchange rates against the US dollar, fetched once a day and kept by
 * date, so an amount is converted at the rate of its own day.
 *
 * EXCHANGE_RATES_URL picks the source (default: open.er-api.com, free, daily,
 * about 160 currencies including UGX, KES and the CFA francs). Any source that
 * answers `{ rates: { CODE: perUsd } }` against USD works, e.g. Open Exchange
 * Rates with an app id in the URL.
 */
@Injectable()
export class FxRatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FxRatesService.name);

  constructor(
    private readonly central: CentralPrismaService,
    @Optional() private readonly cronLock?: CronLockService,
  ) {}

  private get enabled() {
    return process.env.NODE_ENV !== 'test' && process.env.EXCHANGE_RATES_URL !== 'off';
  }

  onApplicationBootstrap() {
    if (!this.enabled) return;
    // Fetch today's rates in the background if we have none yet.
    setTimeout(() => void this.refreshIfStale().catch((e) => this.logger.warn(`Exchange rates: ${e instanceof Error ? e.message : e}`)), 10_000).unref();
  }

  @Cron('30 1 * * *', { timeZone: 'UTC' })
  async scheduled() {
    if (!this.enabled) return;
    const run = () => this.refresh().then(() => undefined);
    if (!this.cronLock) return run();
    await this.cronLock.runExclusive('fx-rates', 10 * 60_000, run);
  }

  async refreshIfStale(): Promise<void> {
    const latest = await this.latestDate();
    if (latest && Date.now() - latest.getTime() < DAY + 2 * 3_600_000) return;
    await this.refresh();
  }

  /** Fetch the source and store its rates under the day it says they are for. */
  async refresh(): Promise<{ date: string; currencies: number }> {
    const url = process.env.EXCHANGE_RATES_URL || DEFAULT_SOURCE;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`rates source answered HTTP ${res.status}`);
    const body = (await res.json()) as { result?: string; base_code?: string; base?: string; rates?: Record<string, number>; time_last_update_unix?: number; timestamp?: number };
    const base = (body.base_code ?? body.base ?? 'USD').toUpperCase();
    if (body.result === 'error' || !body.rates || base !== 'USD') throw new Error('rates source gave no USD-based rates');
    const unix = body.time_last_update_unix ?? body.timestamp;
    const date = utcDay(unix ? new Date(unix * 1000) : new Date());
    const host = new URL(url).host;
    const rows = Object.entries(body.rates)
      .filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && rate > 0)
      .map(([currency, rate]) => ({ date, currency, perUsd: new Prisma.Decimal(rate), source: host }));
    await this.central.client.$transaction([
      this.central.client.exchangeRate.deleteMany({ where: { date } }),
      this.central.client.exchangeRate.createMany({ data: rows }),
    ]);
    this.logger.log(`Stored ${rows.length} exchange rates for ${date.toISOString().slice(0, 10)} from ${host}`);
    return { date: date.toISOString().slice(0, 10), currencies: rows.length };
  }

  async latestDate(): Promise<Date | null> {
    const row = await this.central.client.exchangeRate.findFirst({ orderBy: { date: 'desc' }, select: { date: true } });
    return row?.date ?? null;
  }

  /**
   * Rates for these currencies from a week before `from` to `to`, plus the
   * earliest we have of each (for amounts older than our history).
   */
  async ratesFor(currencies: string[], from: Date, to: Date): Promise<RateRow[]> {
    const codes = [...new Set(currencies.map((c) => c.toUpperCase()))].filter((c) => c !== 'USD');
    if (!codes.length) return [];
    const [window, earliest] = await Promise.all([
      this.central.client.exchangeRate.findMany({
        where: { currency: { in: codes }, date: { gte: new Date(utcDay(from).getTime() - 7 * DAY), lte: utcDay(to) } },
        orderBy: { date: 'asc' },
      }),
      this.central.client.exchangeRate.findMany({ where: { currency: { in: codes } }, orderBy: { date: 'asc' }, distinct: ['currency'] }),
    ]);
    return [...earliest, ...window].map((r) => ({ date: r.date, currency: r.currency, perUsd: Number(r.perUsd) }));
  }
}
