import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from 'jsonwebtoken';
import { can, Permission, PERMISSION_KEY } from '../auth/permissions';
import { hashApiKey, scopesAllow } from '../auth/api-keys';
import { issuedBeforePasswordChange, verifySessionToken } from '../auth/tokens';
import { CentralPrismaService } from '../../database/central-prisma.service';
import { TenantDatabaseService } from '../../database/tenant-database.service';
import { isPlatformOperator } from '../platform-operator';
import { assertTenantAccess } from './tenant-access';
import { wrongEnvironmentKey } from '../../config/sandbox';
import { assertPlanAllows, loadPlan, mayBeLimited, routeOf, usageCounter } from './plan-limits';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly centralPrisma: CentralPrismaService,
    private readonly tenantDb: TenantDatabaseService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET')!;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      throw new UnauthorizedException('Invalid authorization format');
    }

    // Try a dashboard session first, then an API key.
    const session = await this.resolveFromJwt(token);
    const sessionTenant = session?.tenant ?? null;
    const keyed = sessionTenant ? null : await this.resolveFromApiKey(token);
    const tenant = sessionTenant ?? keyed?.tenant;

    if (!tenant) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!tenant.isActive) {
      throw new UnauthorizedException('Tenant account is deactivated');
    }

    const path = request.originalUrl ?? request.url ?? '';
    // A key acts only within its scopes: a read-only key can only read.
    if (keyed && !scopesAllow(keyed.scopes, request.method, routeOf(path))) {
      throw new ForbiddenException(
        `This API key's scopes (${keyed.scopes.join(', ') || 'none'}) do not allow ${request.method} ${routeOf(path)}.`,
      );
    }

    const operator = isPlatformOperator(tenant, this.configService);
    if (!operator) assertTenantAccess(tenant, request.method, path);

    const tenantDbClient = await this.tenantDb.getTenantClient(tenant.id);

    const route = routeOf(path);
    if (!operator && mayBeLimited(request.method, route)) {
      const central = this.centralPrisma.client as never;
      const plan = await loadPlan(central, tenant.id);
      await assertPlanAllows(plan, request.method, route, usageCounter(central, tenantDbClient as never, tenant.id));
    }

    request.tenant = tenant;
    request.tenantDb = tenantDbClient;
    request.authMethod = sessionTenant ? 'session' : 'api_key';
    request.apiKeyScopes = keyed?.scopes;
    if (session) {
      request.member = session.member;
      this.authorize(context, request.method, session.member.role);
    }

    return true;
  }

  /**
   * People act within their role. A route's own permission wins; otherwise
   * reads need `read` and writes need the controller's permission, or
   * `billing.write`. API keys are limited by their scopes instead.
   */
  private authorize(context: ExecutionContext, method: string, role: Parameters<typeof can>[0]) {
    const own = this.reflector.get<Permission | undefined>(PERMISSION_KEY, context.getHandler());
    const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    const needed: Permission = own ?? (isRead ? 'read' : (this.reflector.get<Permission | undefined>(PERMISSION_KEY, context.getClass()) ?? 'billing.write'));
    if (!can(role, needed)) {
      throw new ForbiddenException(`Your role (${role.toLowerCase()}) cannot do this. Ask an owner or admin.`);
    }
  }

  /**
   * A dashboard session: the organisation, and the person with their current
   * role, read fresh so a removed member, changed role or changed password
   * takes effect at once. Sessions from before people had their own logins
   * act as the owner.
   */
  private async resolveFromJwt(token: string) {
    const payload: JwtPayload | null = verifySessionToken(token, this.jwtSecret);
    if (!payload) return null;
    const tenant = await this.centralPrisma.client.tenant.findUnique({ where: { id: String(payload.sub) } });
    if (!tenant) return null;

    const membership = await this.centralPrisma.client.membership.findFirst({
      where: payload.uid ? { tenantId: tenant.id, userId: String(payload.uid) } : { tenantId: tenant.id, role: 'OWNER' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership || !membership.user.isActive) {
      throw new UnauthorizedException('You are no longer a member of this organisation');
    }
    if (issuedBeforePasswordChange(payload, membership.user.passwordChangedAt)) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }
    return {
      tenant,
      member: { userId: membership.userId, email: membership.user.email, name: membership.user.name, role: membership.role },
    };
  }

  /** An API key, by its hash: an organisation key, or the organisation's own key (full access). */
  private async resolveFromApiKey(apiKey: string) {
    const otherEnvironment = wrongEnvironmentKey(apiKey);
    if (otherEnvironment) throw new UnauthorizedException(otherEnvironment);
    const keyHash = hashApiKey(apiKey);
    const apiKeyRecord = await this.centralPrisma.client.apiKey.findUnique({
      where: { keyHash },
      include: { tenant: true },
    });

    if (apiKeyRecord) {
      if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
        throw new UnauthorizedException('API key has expired');
      }

      await this.centralPrisma.client.apiKey
        .update({
          where: { id: apiKeyRecord.id },
          data: { lastUsed: new Date() },
        })
        .catch((err: any) => {
          this.logger.warn(`Failed to update API key lastUsed: ${err.message}`);
        });

      return { tenant: apiKeyRecord.tenant, scopes: apiKeyRecord.scopes };
    }

    const tenant = await this.centralPrisma.client.tenant.findUnique({
      where: { apiKeyHash: keyHash },
    });
    return tenant ? { tenant, scopes: ['read', 'write'] } : null;
  }
}
