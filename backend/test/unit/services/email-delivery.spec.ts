jest.mock('dns', () => ({ promises: { resolveMx: jest.fn(), resolve4: jest.fn() } }));
import { promises as dns } from 'dns';
import { EmailService } from '../../../src/services/email.service';

const notFound = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
const noData = Object.assign(new Error('no data'), { code: 'ENODATA' });

describe('who the platform emails', () => {
  const user = { findFirst: jest.fn() };
  const invitation = { findFirst: jest.fn() };
  const system = {};
  const make = () => {
    const service = new EmailService({ get: () => undefined } as never, { client: { user, invitation } } as never, {} as never);
    (service as any).systemTransporter = system;
    return service;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.SANDBOX_MODE;
    (dns.resolveMx as jest.Mock).mockResolvedValue([{ exchange: 'mx.example.net', priority: 10 }]);
  });

  it('sends to a domain with a mail server', async () => {
    expect(await make().refusal('amina@gmail.com', system as never)).toBeNull();
  });

  it('skips reserved test domains without looking them up', async () => {
    const service = make();
    for (const to of ['a@example.com', 'b@school.test', 'c@x.invalid', 'd@host.localhost']) {
      expect(await service.refusal(to, system as never)).toBe('a test domain');
    }
    expect(dns.resolveMx).not.toHaveBeenCalled();
  });

  it('skips a domain that cannot receive mail', async () => {
    (dns.resolveMx as jest.Mock).mockRejectedValue(notFound);
    (dns.resolve4 as jest.Mock).mockRejectedValue(notFound);
    expect(await make().refusal('s1@students.demo.cybroid.com', system as never)).toBe('students.demo.cybroid.com has no mail server');
  });

  it('sends to a domain with an address but no MX record', async () => {
    (dns.resolveMx as jest.Mock).mockRejectedValue(noData);
    (dns.resolve4 as jest.Mock).mockResolvedValue(['203.0.113.5']);
    expect(await make().refusal('a@small.co.ug', system as never)).toBeNull();
  });

  it('sends when DNS cannot tell', async () => {
    (dns.resolveMx as jest.Mock).mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }));
    expect(await make().refusal('a@slow.co.ke', system as never)).toBeNull();
  });

  it('in the sandbox, emails only people with a login or an invitation', async () => {
    process.env.SANDBOX_MODE = 'true';
    const service = make();
    user.findFirst.mockResolvedValue(null);
    invitation.findFirst.mockResolvedValue(null);
    expect(await service.refusal('student@gmail.com', system as never)).toBe('the sandbox emails only team members');
    user.findFirst.mockResolvedValue({ id: 'u1' });
    expect(await service.refusal('owner@gmail.com', system as never)).toBeNull();
  });

  it("leaves a tenant's own mail server alone", async () => {
    process.env.SANDBOX_MODE = 'true';
    expect(await make().refusal('a@example.com', {} as never)).toBeNull();
  });
});
