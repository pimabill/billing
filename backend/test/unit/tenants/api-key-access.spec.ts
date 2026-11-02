import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../../src/common/decorators/public.decorator';
import { TenantsController } from '../../../src/modules/tenants/tenants.controller';
import { PaymentMethodsController } from '../../../src/modules/payment-methods/payment-methods.controller';

describe('API keys on organisation settings', () => {
  const service = { createApiKey: jest.fn(async () => ({ id: 'k' })), deleteApiKey: jest.fn(async () => ({})), rotateApiKey: jest.fn(async () => ({})) };
  const controller = new TenantsController(service as never);
  const tenant = { id: 't1', name: 'Acme', email: 'a@acme.example' };

  it('lets API keys reach these routes; the tenant guard then checks the key and its scopes', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, TenantsController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PaymentMethodsController)).toBe(true);
  });

  it('never lets an API key create, rotate or revoke keys', async () => {
    const req = { tenant, authMethod: 'api_key' as const };
    await expect(controller.createApiKey(req, { name: 'x', scopes: ['read'] } as never)).rejects.toThrow(ForbiddenException);
    await expect(controller.deleteApiKey(req, 'k1')).rejects.toThrow(ForbiddenException);
    await expect(controller.rotateApiKey(req)).rejects.toThrow(ForbiddenException);
    expect(service.createApiKey).not.toHaveBeenCalled();
  });

  it('lets a signed-in person manage keys', async () => {
    await controller.createApiKey({ tenant, authMethod: 'session' }, { name: 'x', scopes: ['read'] } as never);
    expect(service.createApiKey).toHaveBeenCalled();
  });
});
