import { createHmac } from 'crypto';
import { JwtPayload, sign, verify } from 'jsonwebtoken';

/**
 * Every kind of token is signed with its own key derived from JWT_SECRET, so
 * a token issued for one purpose (a password reset, a customer portal link)
 * can never be presented as another (a dashboard session).
 */
export type TokenPurpose = 'password-reset' | 'portal' | 'mfa' | 'checkout';

export function derivedSecret(jwtSecret: string, purpose: TokenPurpose): string {
  return createHmac('sha256', jwtSecret).update(`pimabill:${purpose}`).digest('hex');
}

/**
 * A dashboard session token: verified, and of the session kind. Older session
 * tokens carry no `typ`; anything naming another purpose is refused.
 */
export function verifySessionToken(token: string, jwtSecret: string): JwtPayload | null {
  let payload: JwtPayload;
  try {
    payload = verify(token, jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || !payload.sub) return null;
  if (payload.typ !== undefined && payload.typ !== 'access') return null;
  if ((payload as { type?: unknown }).type !== undefined) return null;
  return payload;
}

/** Sessions issued before the person's password last changed are no longer valid. */
export function issuedBeforePasswordChange(payload: JwtPayload, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return false;
  // `iat` has one-second resolution; allow tokens issued in the same second as the change.
  return typeof payload.iat !== 'number' || payload.iat < Math.floor(passwordChangedAt.getTime() / 1000);
}

/**
 * A reset token names the password version it may replace (when the password
 * last changed, 0 for never); once the password changes, the token is spent.
 */
export function passwordVersion(passwordChangedAt: Date | null | undefined): number {
  return passwordChangedAt ? passwordChangedAt.getTime() : 0;
}

export interface PortalTokenPayload {
  /** Tenant id */
  sub: string;
  /** The customer's external id */
  cid: string;
  typ: 'portal';
}

export function signPortalToken(jwtSecret: string, tenantId: string, externalId: string, expiresInSeconds: number): string {
  const payload: PortalTokenPayload = { sub: tenantId, cid: externalId, typ: 'portal' };
  return sign(payload, derivedSecret(jwtSecret, 'portal'), { algorithm: 'HS256', expiresIn: expiresInSeconds });
}

export function verifyPortalToken(token: string, jwtSecret: string): PortalTokenPayload | null {
  try {
    const payload = verify(token, derivedSecret(jwtSecret, 'portal'), { algorithms: ['HS256'] }) as JwtPayload;
    if (payload.typ !== 'portal' || typeof payload.sub !== 'string' || typeof payload.cid !== 'string') return null;
    return { sub: payload.sub, cid: payload.cid, typ: 'portal' };
  } catch {
    return null;
  }
}

export interface CheckoutTokenPayload {
  /** Tenant id */
  sub: string;
  /** The invoice this link pays */
  inv: string;
  typ: 'checkout';
  /** Part of the invoice to charge, such as a deposit; otherwise all that is left. */
  amt?: number;
  /** What had been paid when a part-payment link was made, to tell when it has been used. */
  paid?: number;
  /** Where the customer goes when they are done. */
  ret?: string;
}

/** A link to the hosted checkout: it can show and pay this one invoice, and nothing else. */
export function signCheckoutToken(jwtSecret: string, tenantId: string, invoiceId: string, expiresInSeconds: number, extra: Pick<CheckoutTokenPayload, 'amt' | 'paid' | 'ret'> = {}): string {
  const payload: CheckoutTokenPayload = { sub: tenantId, inv: invoiceId, typ: 'checkout', ...extra };
  return sign(payload, derivedSecret(jwtSecret, 'checkout'), { algorithm: 'HS256', expiresIn: expiresInSeconds });
}

export function verifyCheckoutToken(token: string, jwtSecret: string): CheckoutTokenPayload | null {
  try {
    const payload = verify(token, derivedSecret(jwtSecret, 'checkout'), { algorithms: ['HS256'] }) as JwtPayload;
    if (payload.typ !== 'checkout' || typeof payload.sub !== 'string' || typeof payload.inv !== 'string') return null;
    return { sub: payload.sub, inv: payload.inv, typ: 'checkout', amt: payload.amt, paid: payload.paid, ret: payload.ret };
  } catch {
    return null;
  }
}
