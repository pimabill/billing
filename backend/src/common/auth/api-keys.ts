import { createHash } from 'crypto';
import { apiKeyPrefix } from '../../config/sandbox';

/**
 * API keys are shown once and stored only as a SHA-256 hash plus their last
 * four characters, so a database or backup leak does not leak usable keys.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function lastFour(key: string): string {
  return key.slice(-4);
}

export function maskedKey(last4: string | null | undefined): string | null {
  return last4 ? `${apiKeyPrefix()}****${last4}` : null;
}

/**
 * Scopes: "read" (GET/HEAD/OPTIONS anywhere) and "write" (anything anywhere),
 * or the same for one resource, e.g. "customers:read", "invoices:write"
 * (the first path segment after /api). Write includes read.
 */
export const API_KEY_SCOPES = ['read', 'write'] as const;
export const SCOPE_PATTERN = /^(read|write|[a-z][a-z0-9-]*:(read|write))$/;

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/** The resource a route belongs to: its first segment, e.g. "/customers/123" → "customers". */
export function resourceOf(route: string): string {
  return route.replace(/^\/+/, '').split('/')[0] ?? '';
}

/** Whether a key with these scopes may make this request. */
export function scopesAllow(scopes: readonly string[], method: string, route = ''): boolean {
  const read = READ_METHODS.includes(method.toUpperCase());
  const resource = resourceOf(route);
  return scopes.some((scope) => {
    const [target, access] = scope.includes(':') ? scope.split(':', 2) : ['*', scope];
    if (target !== '*' && target !== resource) return false;
    return access === 'write' || (access === 'read' && read);
  });
}
