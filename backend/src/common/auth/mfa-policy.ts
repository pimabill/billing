/** An organisation that asks everyone to use two-step sign-in. */
export function requiresMfa(settings: unknown): boolean {
  return (settings as { requireMfa?: unknown } | null)?.requireMfa === true;
}

/**
 * What someone without two-step sign-in can still reach in an organisation
 * that requires it: setting it up, and the session that says so.
 */
export function mfaSetupAllows(method: string, route: string): boolean {
  if (route === '/auth/mfa' || route.startsWith('/auth/mfa/')) return true;
  if (route === '/auth/session' || route === '/auth/switch') return true;
  return method === 'GET' && route === '/tenants/me';
}
