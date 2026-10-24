/**
 * A sandbox deployment (SANDBOX_MODE=true) runs the same code against test
 * provider accounts. Its keys and emails say so, so test and live are never
 * confused.
 */
export function isSandbox(): boolean {
  return process.env.SANDBOX_MODE === 'true';
}

export function apiKeyPrefix(): 'sk_test_' | 'sk_live_' {
  return isSandbox() ? 'sk_test_' : 'sk_live_';
}

/** Why a key is refused here, when it plainly belongs to the other environment. */
export function wrongEnvironmentKey(key: string): string | null {
  if (isSandbox() && key.startsWith('sk_live_')) return 'This is a live API key; this is the sandbox. Use a sk_test_ key here.';
  if (!isSandbox() && key.startsWith('sk_test_')) return 'This is a sandbox API key; use it against the sandbox API, or use a sk_live_ key here.';
  return null;
}
