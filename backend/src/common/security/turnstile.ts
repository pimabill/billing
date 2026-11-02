import { BadRequestException, Logger } from '@nestjs/common';

const logger = new Logger('Turnstile');
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The public half, for the sign-in pages; null when Turnstile is off. */
export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY?.trim() || null;

/**
 * Check a Cloudflare Turnstile token from a sign-in, sign-up or password
 * reset form. Off unless TURNSTILE_SECRET_KEY is set (self-hosted installs
 * and tests). If Cloudflare cannot be reached the request goes through:
 * Turnstile keeps bots out, it does not guard accounts, and an outage there
 * must not lock everyone out.
 */
export async function verifyTurnstile(token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return;
  if (!token) throw new BadRequestException({ message: 'Please complete the check that you are human.', code: 'CAPTCHA_REQUIRED' });

  let outcome: { success?: boolean; 'error-codes'?: string[] };
  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    outcome = await response.json();
  } catch (error) {
    logger.warn(`Could not reach Turnstile, letting the request through: ${error instanceof Error ? error.message : error}`);
    return;
  }
  if (!outcome.success) {
    logger.log(`Turnstile refused a token: ${(outcome['error-codes'] ?? []).join(', ') || 'no reason given'}`);
    throw new BadRequestException({ message: 'The check that you are human failed or expired. Please try again.', code: 'CAPTCHA_FAILED' });
  }
}
