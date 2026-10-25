import { ForbiddenException } from '@nestjs/common';
import { routeOf } from './plan-limits';

export type AccessMode = 'FULL' | 'READ_ONLY' | 'SUSPENDED';

/** Routes a suspended organisation can still read, so the dashboard can say why. */
const SUSPENDED_ALLOWED = ['/tenants/me', '/admin/me'];

/**
 * Applies an organisation's access mode to a request. Read-only allows
 * reads; suspended allows only what the dashboard needs to show the reason.
 * The error carries the reason and where to resolve it.
 */
export function assertTenantAccess(
  tenant: { accessMode?: AccessMode | null; accessReason?: string | null; accessUrl?: string | null },
  method: string,
  path: string,
): void {
  const mode = tenant.accessMode ?? 'FULL';
  if (mode === 'FULL') return;
  const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  const route = routeOf(path);
  // Paying for a plan is how a restricted organisation gets back; allow it in any mode.
  if (route === '/tenants/me/plan' || route.startsWith('/tenants/me/plan/')) return;
  if (mode === 'READ_ONLY' && isRead) return;
  if (mode === 'SUSPENDED' && isRead && SUSPENDED_ALLOWED.includes(route)) return;
  throw new ForbiddenException({
    statusCode: 403,
    code: mode === 'READ_ONLY' ? 'TENANT_READ_ONLY' : 'TENANT_SUSPENDED',
    message:
      tenant.accessReason ||
      (mode === 'READ_ONLY' ? 'This organisation is read-only.' : 'This organisation is suspended.'),
    ...(tenant.accessUrl && { accessUrl: tenant.accessUrl }),
  });
}
