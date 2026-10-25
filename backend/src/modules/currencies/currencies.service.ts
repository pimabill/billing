import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '../../generated/prisma-tenant/client';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { currencyForCountry, currencyName, getCurrencyDecimals, isIsoCurrency, isoCurrencies } from '../../common/utils/currency.utils';
import { Converter } from './converter';
import { currencyContext } from '../../common/utils/currency-context';
import { FxRatesService } from './fx-rates.service';

const CODE = /^[A-Z0-9]{2,10}$/;
const CACHE_MS = 60_000;

export interface CustomCurrencyInput {
  code?: string;
  name?: string;
  symbol?: string | null;
  decimals?: number;
  perUsd?: number | null;
}

/**
 * The currencies an organisation works in: every ISO 4217 currency, plus any
 * it defines itself (points, a stablecoin, a voucher), and the one it reports
 * in. Balances and invoices always stay in their own currency; only reports
 * convert, into the reporting currency.
 */
@Injectable()
export class CurrenciesService {
  private readonly decimalsCache = new Map<string, { at: number; map: Map<string, number> }>();

  constructor(
    private readonly central: CentralPrismaService,
    private readonly fx: FxRatesService,
  ) {}

  /** Settings → reportingCurrency, else the country's currency, else USD. */
  async reportingCurrency(tenantId: string): Promise<string> {
    const tenant = await this.central.client.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const settings = (tenant?.settings ?? {}) as { reportingCurrency?: string; country?: string };
    return (settings.reportingCurrency || currencyForCountry(settings.country) || 'USD').toUpperCase();
  }

  async setReportingCurrency(db: PrismaClient, tenantId: string, code: string): Promise<string> {
    const upper = code.trim().toUpperCase();
    if (!isIsoCurrency(upper) && !(await db.currency.findUnique({ where: { code: upper } }))) throw new BadRequestException(`Unknown currency ${code}`);
    const tenant = await this.central.client.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
    const settings = { ...((tenant.settings ?? {}) as Record<string, unknown>), reportingCurrency: upper };
    await this.central.client.tenant.update({ where: { id: tenantId }, data: { settings: settings as Prisma.InputJsonValue } });
    return upper;
  }

  /** Everything the dashboard needs: the reporting currency, the custom currencies, the ones in use, and the rates' date. */
  async overview(db: PrismaClient, tenantId: string) {
    const [reporting, custom, used, latest] = await Promise.all([
      this.reportingCurrency(tenantId),
      db.currency.findMany({ orderBy: { code: 'asc' } }),
      this.inUse(db),
      this.fx.latestDate(),
    ]);
    const converter = await this.converter(db, tenantId, used, new Date(), new Date());
    return {
      reportingCurrency: reporting,
      ratesAsOf: latest ? latest.toISOString().slice(0, 10) : null,
      inUse: used.map((code) => ({
        code,
        name: custom.find((c) => c.code === code)?.name ?? currencyName(code),
        decimals: custom.find((c) => c.code === code)?.decimals ?? getCurrencyDecimals(code),
        custom: !isIsoCurrency(code),
        perReporting: code === reporting ? 1 : converter.convert(1, code),
      })),
      custom: custom.map((c) => this.present(c)),
      iso: isoCurrencies().map((code) => ({ code, name: currencyName(code), decimals: getCurrencyDecimals(code) })),
    };
  }

  /** Currencies that appear on customers, prices or invoices. */
  async inUse(db: PrismaClient): Promise<string[]> {
    const [customers, prices, invoices] = await Promise.all([
      db.customer.findMany({ distinct: ['currency'], select: { currency: true } }),
      db.planPrice.findMany({ distinct: ['currency'], select: { currency: true } }),
      db.invoice.findMany({ distinct: ['currency'], select: { currency: true } }),
    ]);
    return [...new Set([...customers, ...prices, ...invoices].map((r) => r.currency.toUpperCase()))].sort();
  }

  async createCustom(db: PrismaClient, input: CustomCurrencyInput) {
    const code = (input.code ?? '').trim().toUpperCase();
    if (!CODE.test(code)) throw new BadRequestException('A currency code is 2 to 10 letters or digits, e.g. PTS or USDC');
    if (isIsoCurrency(code)) throw new BadRequestException(`${code} is an ISO currency and is already available`);
    if (await db.currency.findUnique({ where: { code } })) throw new ConflictException(`${code} already exists`);
    const row = await db.currency.create({ data: { code, ...(this.fields(input, true) as { name: string }) } });
    this.decimalsCache.clear();
    return this.present(row);
  }

  async updateCustom(db: PrismaClient, code: string, input: CustomCurrencyInput) {
    const upper = code.toUpperCase();
    const existing = await db.currency.findUnique({ where: { code: upper } });
    if (!existing) throw new NotFoundException(`No custom currency ${upper}`);
    if (input.decimals !== undefined && input.decimals !== existing.decimals && (await this.usage(db, upper)) > 0) {
      throw new BadRequestException(`${upper} is already in use; its decimals cannot change`);
    }
    const row = await db.currency.update({ where: { code: upper }, data: this.fields(input, false) });
    this.decimalsCache.clear();
    return this.present(row);
  }

  async deleteCustom(db: PrismaClient, tenantId: string, code: string) {
    const upper = code.toUpperCase();
    if (!(await db.currency.findUnique({ where: { code: upper } }))) throw new NotFoundException(`No custom currency ${upper}`);
    if ((await this.usage(db, upper)) > 0) throw new ConflictException(`${upper} is used by customers, prices or invoices and cannot be removed`);
    if ((await this.reportingCurrency(tenantId)) === upper) throw new ConflictException(`${upper} is your reporting currency; choose another first`);
    await db.currency.delete({ where: { code: upper } });
    this.decimalsCache.clear();
  }

  /** Decimals of the organisation's own currencies, cached briefly, for rounding (see currencyContext). */
  async customDecimals(db: PrismaClient, tenantId: string): Promise<Map<string, number>> {
    const hit = this.decimalsCache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.map;
    const rows = await db.currency.findMany({ select: { code: true, decimals: true } });
    const map = new Map(rows.map((r) => [r.code, r.decimals]));
    this.decimalsCache.set(tenantId, { at: Date.now(), map });
    return map;
  }

  /** Run a job for one organisation inside its currency context (see currencyContext). */
  async runFor<T>(db: PrismaClient, tenantId: string, fn: () => Promise<T>): Promise<T> {
    const custom = await this.customDecimals(db, tenantId).catch(() => new Map<string, number>());
    return currencyContext.run(custom, fn);
  }

  /** A converter into the reporting currency, with rates for these currencies over these dates. */
  async converter(db: PrismaClient, tenantId: string, currencies: Iterable<string>, from: Date, to: Date): Promise<Converter> {
    const reporting = await this.reportingCurrency(tenantId);
    const custom = await db.currency.findMany({ where: { perUsd: { not: null } }, select: { code: true, perUsd: true } });
    const fixed = new Map(custom.map((c) => [c.code, Number(c.perUsd)]));
    const codes = [...new Set([...currencies, reporting].map((c) => c.toUpperCase()))].filter((c) => isIsoCurrency(c));
    const rows = await this.fx.ratesFor(codes, from, to);
    return new Converter(reporting, rows, fixed);
  }

  private async usage(db: PrismaClient, code: string): Promise<number> {
    const counts = await Promise.all([
      db.customer.count({ where: { currency: code } }),
      db.planPrice.count({ where: { currency: code } }),
      db.invoice.count({ where: { currency: code } }),
      db.subscription.count({ where: { currency: code } }),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  }

  private fields(input: CustomCurrencyInput, creating: boolean) {
    const data: { name?: string; symbol?: string | null; decimals?: number; perUsd?: Prisma.Decimal | null } = {};
    if (input.name !== undefined || creating) {
      const name = (input.name ?? '').trim();
      if (!name) throw new BadRequestException('A currency needs a name');
      data.name = name.slice(0, 60);
    }
    if (input.symbol !== undefined) data.symbol = input.symbol?.trim().slice(0, 8) || null;
    if (input.decimals !== undefined) {
      if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 8) throw new BadRequestException('Decimals are a whole number from 0 to 8');
      data.decimals = input.decimals;
    }
    if (input.perUsd !== undefined) {
      if (input.perUsd !== null && !(input.perUsd > 0)) throw new BadRequestException('The rate is how many units make one US dollar, above zero');
      data.perUsd = input.perUsd === null ? null : new Prisma.Decimal(input.perUsd);
    }
    return data;
  }

  private present(c: { code: string; name: string; symbol: string | null; decimals: number; perUsd: Prisma.Decimal | null; createdAt: Date }) {
    return { code: c.code, name: c.name, symbol: c.symbol, decimals: c.decimals, perUsd: c.perUsd === null ? null : Number(c.perUsd), createdAt: c.createdAt };
  }
}
