/**
 * Where providers send collection notifications. Yo takes success and
 * failure URLs with each request; MTN takes one callback URL per request;
 * Airtel's callback is set once in its portal (the same URL shown here).
 */
export function notificationUrls(provider: string, tenantId: string) {
  const base = `${process.env.API_BASE_URL || 'http://localhost:4000'}/webhooks/${provider}/${tenantId}`;
  return provider === 'yo'
    ? { notificationUrl: `${base}/ipn`, failureNotificationUrl: `${base}/failure` }
    : { notificationUrl: `${base}/callback` };
}
