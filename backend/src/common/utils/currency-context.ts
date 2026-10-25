import { AsyncLocalStorage } from 'async_hooks';

/**
 * The organisation's own currencies (code → decimals) for the work in hand:
 * set per request by TenantGuard, and by jobs that bill one organisation, so
 * rounding and formatting know a custom currency's decimals.
 */
const storage = new AsyncLocalStorage<ReadonlyMap<string, number>>();

export const currencyContext = {
  current: (): ReadonlyMap<string, number> | undefined => storage.getStore(),
  /** For the rest of this request's async work. */
  enter: (custom: ReadonlyMap<string, number>) => storage.enterWith(custom),
  run: <T>(custom: ReadonlyMap<string, number>, fn: () => T): T => storage.run(custom, fn),
};
