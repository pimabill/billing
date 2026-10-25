import { BadRequestException } from '@nestjs/common';
import { currencyContext } from './currency-context';

/**
 * Currencies that have no decimal subunit (ISO 4217 exponent = 0).
 * Amounts for these currencies should be treated as whole numbers.
 */
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'JPY', 'KRW', 'UGX', 'RWF', 'XOF', 'XAF', 'TZS',
  'VND', 'CLP', 'GNF', 'BIF', 'DJF', 'KMF', 'PYG',
  'MGA', 'ISK',
]);

/**
 * Currencies that use 3 decimal places (ISO 4217 exponent = 3).
 */
export const THREE_DECIMAL_CURRENCIES = new Set([
  'KWD', 'BHD', 'OMR', 'JOD', 'TND', 'LYD',
]);

/**
 * Returns the number of minor-unit decimal places for the given currency code.
 */
export function getCurrencyDecimals(currency: string): number {
  const upper = currency.toUpperCase();
  const custom = currencyContext.current()?.get(upper);
  if (custom !== undefined) return custom;
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(upper)) return 3;
  return 2;
}

/**
 * Converts a major-unit amount to the smallest currency subunit.
 *
 * Examples:
 *   toSmallestUnit(10.50, 'USD') → 1050   (cents)
 *   toSmallestUnit(1000, 'JPY') → 1000   (yen, already smallest unit)
 *   toSmallestUnit(5.125, 'KWD') → 5125  (fils)
 */
export function toSmallestUnit(amount: number, currency: string): number {
  const decimals = getCurrencyDecimals(currency);
  return Math.round(amount * Math.pow(10, decimals));
}

/**
 * Converts a smallest-unit amount back to major units.
 *
 * Examples:
 *   fromSmallestUnit(1050, 'USD') → 10.50
 *   fromSmallestUnit(1000, 'JPY') → 1000
 */
export function fromSmallestUnit(amount: number, currency: string): number {
  const decimals = getCurrencyDecimals(currency);
  return amount / Math.pow(10, decimals);
}

/**
 * Formats an amount as a decimal string suitable for APIs that accept
 * major-unit values (e.g. PayPal, DPO, Flutterwave).
 * Zero-decimal currencies are returned as integers with no decimal point.
 */
export function formatAmountForApi(amount: number, currency: string): string {
  const decimals = getCurrencyDecimals(currency);
  return amount.toFixed(decimals);
}

// Node has it; the TypeScript lib in use predates it.
const ISO_CODES: ReadonlySet<string> = new Set((Intl as unknown as { supportedValuesOf(key: 'currency'): string[] }).supportedValuesOf('currency'));

/** An ISO 4217 currency code. */
export function isIsoCurrency(code: string): boolean {
  return ISO_CODES.has(code.toUpperCase());
}

/** Every ISO 4217 code the runtime knows, sorted. */
export function isoCurrencies(): string[] {
  return [...ISO_CODES].sort();
}

/** The English name of an ISO currency, e.g. "Ugandan Shilling". */
export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/**
 * Refuses a currency that is neither ISO 4217 nor one the organisation
 * defined (Settings → Currencies), so a typo like "UGS" never becomes a price.
 */
export async function assertKnownCurrency(db: { currency: { findUnique(args: { where: { code: string } }): Promise<unknown> } }, code: string): Promise<string> {
  const upper = (code ?? '').trim().toUpperCase();
  if (isIsoCurrency(upper)) return upper;
  if (upper && (await db.currency.findUnique({ where: { code: upper } }))) return upper;
  throw new BadRequestException(`Unknown currency ${code}: use an ISO 4217 code such as UGX or USD, or add it in Settings → Currencies`);
}

/** The usual currency of a country (ISO 3166 alpha-2), for an organisation's default reporting currency. */
const COUNTRY_CURRENCY: Record<string, string> = {
  UG: 'UGX', KE: 'KES', TZ: 'TZS', RW: 'RWF', BI: 'BIF', SS: 'SSP', ET: 'ETB', SO: 'SOS', CD: 'CDF',
  NG: 'NGN', GH: 'GHS', SL: 'SLE', LR: 'LRD', GM: 'GMD', GN: 'GNF',
  SN: 'XOF', CI: 'XOF', BF: 'XOF', ML: 'XOF', NE: 'XOF', TG: 'XOF', BJ: 'XOF', GW: 'XOF',
  CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', CF: 'XAF', GQ: 'XAF',
  ZA: 'ZAR', ZM: 'ZMW', MW: 'MWK', MZ: 'MZN', ZW: 'ZWG', BW: 'BWP', NA: 'NAD', AO: 'AOA', MG: 'MGA', MU: 'MUR',
  EG: 'EGP', MA: 'MAD', DZ: 'DZD', TN: 'TND', LY: 'LYD', SD: 'SDG',
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', IN: 'INR', AE: 'AED', SA: 'SAR', CN: 'CNY', JP: 'JPY',
  DE: 'EUR', FR: 'EUR', NL: 'EUR', IE: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR',
};

export function currencyForCountry(country: string | null | undefined): string | null {
  return (country && COUNTRY_CURRENCY[country.toUpperCase()]) || null;
}
