/**
 * Product branding shown to tenants and their customers (emails, PDFs, API
 * docs). Change it through environment variables; nothing else in the code
 * should spell out the product name.
 *
 * BRAND_SLUG is a machine identifier sent to providers (e.g. Stripe metadata),
 * so it keeps its old value unless explicitly changed — merchants may filter
 * on it.
 */
export interface Brand {
  name: string;
  slug: string;
  supportEmail: string;
  website: string;
}

export function getBrand(): Brand {
  const name = process.env.BRAND_NAME?.trim() || 'PimaBill';
  return {
    name,
    slug: process.env.BRAND_SLUG?.trim() || 'pimabill',
    supportEmail: process.env.BRAND_SUPPORT_EMAIL?.trim() || 'noreply@pimabill.com',
    website: process.env.BRAND_WEBSITE?.trim() || 'https://pimabill.com',
  };
}
