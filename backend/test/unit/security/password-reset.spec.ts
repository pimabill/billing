import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../../src/modules/auth/auth.service';

const SECRET = 'y'.repeat(48);

describe('password reset', () => {
  let user: { id: string; email: string; password: string; isActive: boolean; passwordChangedAt: Date | null };
  let sendHtml: jest.Mock;
  let auth: AuthService;
  let logged: string[];

  beforeEach(() => {
    user = { id: 'u1', email: 'a@example.com', password: '$argon2id$old', isActive: true, passwordChangedAt: null };
    sendHtml = jest.fn().mockResolvedValue(true);
    const db = {
      user: {
        findUnique: jest.fn(async () => user),
        updateMany: jest.fn(async (args: any) => {
          // Compare-and-set on the password version, as Postgres would.
          if (String(args.where.passwordChangedAt) !== String(user.passwordChangedAt)) return { count: 0 };
          user = { ...user, ...args.data };
          return { count: 1 };
        }),
      },
    };
    auth = new AuthService(
      { client: db } as any,
      {} as any,
      new JwtService(),
      { get: (k: string) => (k === 'JWT_SECRET' ? SECRET : undefined) } as any,
      {} as any,
      { sendHtml } as any,
      {} as any,
    );
    logged = [];
    jest.spyOn((auth as any).logger, 'log').mockImplementation((m: unknown) => logged.push(String(m)));
  });

  const tokenFromEmail = () => {
    const html: string = sendHtml.mock.calls.at(-1)[2];
    return decodeURIComponent(html.match(/token=([^"&]+)/)![1]);
  };

  it('emails the link and never logs the token', async () => {
    await auth.forgotPassword('A@example.com');
    const token = tokenFromEmail();
    expect(sendHtml).toHaveBeenCalledWith('a@example.com', expect.any(String), expect.stringContaining('/reset-password?token='));
    expect(logged.join('\n')).not.toContain(token);
  });

  it('works once, then the same link is refused', async () => {
    await auth.forgotPassword('a@example.com');
    const token = tokenFromEmail();

    await auth.resetPassword(token, 'new-password-1');
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    await expect(auth.resetPassword(token, 'new-password-2')).rejects.toThrow(BadRequestException);
  });

  it('refuses a token signed with the session secret', async () => {
    const forged = new JwtService().sign({ sub: 'u1', typ: 'password-reset', ver: 0 }, { secret: SECRET });
    await expect(auth.resetPassword(forged, 'whatever-123')).rejects.toThrow(BadRequestException);
  });
});
