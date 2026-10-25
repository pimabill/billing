import { RateRow } from './fx-rates.service';

/**
 * Converts amounts into one currency (the organisation's reporting currency)
 * at the rate of each amount's own day. Rates are units per US dollar: daily
 * market rates for ISO currencies, and the organisation's own rate for the
 * currencies it defined. An amount older than our rate history uses the
 * earliest rate we have; an amount with no rate at all is left out of totals
 * and its currency listed in `unconverted`.
 */
export class Converter {
  readonly unconverted = new Set<string>();
  private readonly byCurrency = new Map<string, RateRow[]>();

  constructor(
    readonly currency: string,
    rows: RateRow[],
    private readonly fixed: ReadonlyMap<string, number>,
  ) {
    for (const r of rows) {
      const list = this.byCurrency.get(r.currency) ?? [];
      if (!list.some((x) => x.date.getTime() === r.date.getTime())) list.push(r);
      this.byCurrency.set(r.currency, list);
    }
    for (const list of this.byCurrency.values()) list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /** The newest day any rate is from, or null with no rates at all. */
  get ratesAsOf(): string | null {
    let latest = 0;
    for (const list of this.byCurrency.values()) latest = Math.max(latest, list.at(-1)?.date.getTime() ?? 0);
    return latest ? new Date(latest).toISOString().slice(0, 10) : null;
  }

  /** Units of `code` per US dollar on `at`'s day. */
  perUsd(code: string, at: Date = new Date()): number | null {
    const upper = code.toUpperCase();
    if (upper === 'USD') return 1;
    const fixed = this.fixed.get(upper);
    if (fixed) return fixed;
    const list = this.byCurrency.get(upper);
    if (!list?.length) return null;
    const t = at.getTime();
    let found = list[0];
    for (const r of list) {
      if (r.date.getTime() > t) break;
      found = r;
    }
    return found.perUsd;
  }

  /** `amount` of `from` in the reporting currency, or null when there is no rate. */
  convert(amount: number, from: string, at?: Date): number | null {
    const upper = from.toUpperCase();
    if (upper === this.currency) return amount;
    const rFrom = this.perUsd(upper, at);
    const rTo = this.perUsd(this.currency, at);
    if (!rFrom || !rTo) {
      this.unconverted.add(rFrom ? this.currency : upper);
      return null;
    }
    return (amount / rFrom) * rTo;
  }

  /** Like convert, counting an amount with no rate as zero (it is listed in `unconverted`). */
  sum(amount: number, from: string, at?: Date): number {
    return this.convert(amount, from, at) ?? 0;
  }

  /** What a response says about the conversion. */
  describe() {
    return { currency: this.currency, ratesAsOf: this.ratesAsOf, unconverted: [...this.unconverted].sort() };
  }
}
