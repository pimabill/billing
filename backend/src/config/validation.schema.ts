import * as Joi from 'joi';

/** Values from the example files and old defaults: never acceptable secrets. */
const KNOWN_PLACEHOLDERS = [
  /change-?me/i,
  /^generate-/i,
  /^0123456789abcdef/i,
  /^secret$/i,
  /^password$/i,
];

/** A real secret in production: not a placeholder, and long enough to resist guessing. */
function secret(minLength: number) {
  return Joi.string()
    .required()
    .custom((value: string, helpers) => {
      if (process.env.NODE_ENV !== 'production') return value;
      if (KNOWN_PLACEHOLDERS.some((p) => p.test(value))) return helpers.error('secret.placeholder');
      if (value.length < minLength) return helpers.error('string.min', { limit: minLength });
      return value;
    }, 'production secret')
    .messages({ 'secret.placeholder': '{{#label}} is still a placeholder; generate a real secret (openssl rand -hex 32)' });
}

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),

  PORT: Joi.number().default(3000),

  CENTRAL_DATABASE_URL: Joi.string().required(),

  INTERNAL_POSTGRES_URL: Joi.string().required(),

  REDIS_URL: Joi.string().required(),

  JWT_SECRET: secret(32),

  JWT_EXPIRATION: Joi.string().default('1h'),

  // Must differ from JWT_SECRET, so a refresh token can never pass as an access token.
  JWT_REFRESH_SECRET: secret(32).invalid(Joi.ref('JWT_SECRET')).messages({ 'any.invalid': 'JWT_REFRESH_SECRET must differ from JWT_SECRET' }),

  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),

  ENCRYPTION_KEY: secret(64).length(64).hex(),

  EMAIL_HOST: Joi.string().optional().allow(''),

  EMAIL_PORT: Joi.number().optional().allow(''),

  EMAIL_USER: Joi.string().optional().allow(''),

  EMAIL_PASSWORD: Joi.string().optional().allow(''),

  EMAIL_FROM: Joi.string().optional().allow(''),

  EMAIL_FROM_NAME: Joi.string().optional().allow(''),

  PDF_STORAGE_PATH: Joi.string().optional().default('./uploads/invoices'),

  CORS_ORIGINS: Joi.string().optional(),

  API_BASE_URL: Joi.string().optional().default('http://localhost:4000'),

  // 'shadow' projects billing activity into the double-entry ledger alongside
  // the existing tables (nothing reads from it yet); 'off' disables it.
  // Comma-separated tenant ids whose dashboard sessions may open the platform console.
  PLATFORM_ADMIN_TENANT_IDS: Joi.string().optional().allow(''),
  // Lets the operator's own control plane manage organisation access (see admin/service).
  PLATFORM_SERVICE_TOKEN: Joi.string().min(32).optional().allow(''),
  SANDBOX_MODE: Joi.string().valid('true', 'false', '').optional(),
  SANDBOX_LINK_SECRET: Joi.string().min(32).optional().allow(''),
  // Managed payments subscription (private service); leave unset to offer only tenants' own providers.
  MANAGED_PAYMENTS_URL: Joi.string().uri().optional().allow(''),
  MANAGED_PAYMENTS_API_KEY: Joi.string().optional().allow(''),
  MANAGED_PAYMENTS_WEBHOOK_SECRET: Joi.string().optional().allow(''),

  // Product branding (see src/config/brand.ts).
  BRAND_NAME: Joi.string().optional().allow(''),
  BRAND_SLUG: Joi.string().optional().allow(''),
  BRAND_SUPPORT_EMAIL: Joi.string().optional().allow(''),
  BRAND_WEBSITE: Joi.string().optional().allow(''),

  // Lets webhook URLs and SMTP hosts point at private addresses (self-hosted, internal receivers only).
  ALLOW_PRIVATE_WEBHOOK_URLS: Joi.string().valid('true', 'false').optional(),
  DASHBOARD_URL: Joi.string().uri().optional(),

  LEDGER_MODE: Joi.string().valid('off', 'shadow').optional().default('shadow'),
});
