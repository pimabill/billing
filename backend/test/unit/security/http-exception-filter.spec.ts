import { UnauthorizedException } from '@nestjs/common';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { PlanLimitException } from '../../../src/common/guards/plan-limits';

function respond(exception: unknown) {
  const json = jest.fn();
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status: () => ({ json }) }), getRequest: () => ({ method: 'GET', url: '/api/x' }) }),
  };
  new HttpExceptionFilter().catch(exception, host as never);
  return json.mock.calls[0][0];
}

describe('HttpExceptionFilter', () => {
  it('keeps the machine-readable code an exception carries', () => {
    expect(respond(new UnauthorizedException({ message: 'Enter the code', code: 'MFA_REQUIRED' }))).toMatchObject({ statusCode: 401, message: 'Enter the code', code: 'MFA_REQUIRED' });
    expect(respond(new PlanLimitException('Free allows 1,000 customers', { planName: 'Free', manageUrl: 'https://x/plan' }))).toMatchObject({
      statusCode: 402,
      code: 'PLAN_LIMIT',
      plan: 'Free',
      upgradeUrl: 'https://x/plan',
    });
  });

  it('describes nothing of an unexpected error', () => {
    expect(respond(new Error('connect ECONNREFUSED 10.0.0.5:5432'))).toMatchObject({ statusCode: 500, message: 'Internal server error' });
  });
});
