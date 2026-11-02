import { verifyTurnstile, turnstileSiteKey } from '../../../src/common/security/turnstile';

const answer = (body: unknown, ok = true) => jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, json: async () => body });

describe('Turnstile', () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SITE_KEY;
  });

  it('is off without a secret key', async () => {
    const fetchImpl = answer({ success: false });
    await expect(verifyTurnstile(undefined, fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(turnstileSiteKey()).toBeNull();
  });

  describe('when on', () => {
    beforeEach(() => {
      process.env.TURNSTILE_SECRET_KEY = 'secret';
      process.env.TURNSTILE_SITE_KEY = 'site';
    });

    it('requires a token', async () => {
      await expect(verifyTurnstile(undefined, answer({ success: true }))).rejects.toMatchObject({ response: { code: 'CAPTCHA_REQUIRED' } });
    });

    it('accepts a token Cloudflare confirms', async () => {
      const fetchImpl = answer({ success: true });
      await expect(verifyTurnstile('tok', fetchImpl)).resolves.toBeUndefined();
      const body = (fetchImpl.mock.calls[0][1] as RequestInit).body as URLSearchParams;
      expect(body.get('secret')).toBe('secret');
      expect(body.get('response')).toBe('tok');
    });

    it('refuses a token Cloudflare rejects', async () => {
      await expect(verifyTurnstile('bad', answer({ success: false, 'error-codes': ['invalid-input-response'] }))).rejects.toMatchObject({ response: { code: 'CAPTCHA_FAILED' } });
    });

    it('lets the request through when Cloudflare cannot be reached', async () => {
      await expect(verifyTurnstile('tok', answer({}, false))).resolves.toBeUndefined();
      await expect(verifyTurnstile('tok', jest.fn().mockRejectedValue(new Error('timeout')))).resolves.toBeUndefined();
    });

    it('gives the sign-in pages the site key', () => {
      expect(turnstileSiteKey()).toBe('site');
    });
  });
});
