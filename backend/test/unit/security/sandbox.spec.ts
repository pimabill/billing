import { maskedKey } from '../../../src/common/auth/api-keys';
import { apiKeyPrefix, isSandbox, wrongEnvironmentKey } from '../../../src/config/sandbox';
import { EncryptionService } from '../../../src/services/encryption.service';

describe('sandbox mode', () => {
  const original = process.env.SANDBOX_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.SANDBOX_MODE;
    else process.env.SANDBOX_MODE = original;
  });
  const encryption = () => new EncryptionService({ get: () => 'ab'.repeat(32) } as never);

  it('is live unless SANDBOX_MODE is exactly "true"', () => {
    delete process.env.SANDBOX_MODE;
    expect(isSandbox()).toBe(false);
    process.env.SANDBOX_MODE = 'false';
    expect(apiKeyPrefix()).toBe('sk_live_');
    process.env.SANDBOX_MODE = 'true';
    expect(isSandbox()).toBe(true);
  });

  it('issues and masks test keys in the sandbox and live keys elsewhere', () => {
    process.env.SANDBOX_MODE = 'true';
    expect(encryption().generateApiKey()).toMatch(/^sk_test_[0-9a-f]{64}$/);
    expect(maskedKey('a1b2')).toBe('sk_test_****a1b2');
    process.env.SANDBOX_MODE = 'false';
    expect(encryption().generateApiKey()).toMatch(/^sk_live_[0-9a-f]{64}$/);
    expect(maskedKey('a1b2')).toBe('sk_live_****a1b2');
  });

  it('refuses a key from the other environment with a message saying so', () => {
    process.env.SANDBOX_MODE = 'true';
    expect(wrongEnvironmentKey('sk_live_abc')).toMatch(/live API key/);
    expect(wrongEnvironmentKey('sk_test_abc')).toBeNull();
    process.env.SANDBOX_MODE = 'false';
    expect(wrongEnvironmentKey('sk_test_abc')).toMatch(/sandbox API key/);
    expect(wrongEnvironmentKey('sk_live_abc')).toBeNull();
  });
});
