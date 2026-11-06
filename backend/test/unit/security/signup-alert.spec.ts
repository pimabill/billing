import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../../src/modules/auth/auth.service';

describe('new sign-up alert', () => {
  const user = { id: 'u1', email: 'owner@shop.example', name: 'Amina <b>' };
  const tenant = { id: 't1', name: 'Shop & Co' };
  const saved = { ...process.env };
  let sendHtml: jest.Mock;
  let findFirst: jest.Mock;
  let auth: { alertNewSignup: (u: unknown, t: unknown) => Promise<void> };

  beforeEach(() => {
    process.env = { ...saved, CLOUD_PLANS: 'true' };
    delete process.env.SIGNUP_ALERT_EMAIL;
    sendHtml = jest.fn().mockResolvedValue(true);
    findFirst = jest.fn().mockResolvedValue({ email: 'operator@pimabill.example' });
    auth = new AuthService({ client: { tenant: { findFirst } } } as never, {} as never, new JwtService(), {} as never, {} as never, { sendHtml } as never, {} as never) as never;
  });
  afterAll(() => {
    process.env = saved;
  });

  it("goes to the operator organisation's email, with what the person entered escaped", async () => {
    await auth.alertNewSignup(user, tenant);
    const [to, subject, html] = sendHtml.mock.calls[0];
    expect(to).toBe('operator@pimabill.example');
    expect(subject).toBe('New sign-up: Shop & Co');
    expect(html).toContain('Shop &amp; Co');
    expect(html).toContain('Amina &lt;b&gt;');
    expect(html).toContain('owner@shop.example');
  });

  it('goes to SIGNUP_ALERT_EMAIL when it is set', async () => {
    process.env.SIGNUP_ALERT_EMAIL = 'alerts@pimabill.example';
    await auth.alertNewSignup(user, tenant);
    expect(sendHtml.mock.calls[0][0]).toBe('alerts@pimabill.example');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('stays quiet off the hosted cloud', async () => {
    process.env.CLOUD_PLANS = 'false';
    await auth.alertNewSignup(user, tenant);
    expect(sendHtml).not.toHaveBeenCalled();
  });
});
