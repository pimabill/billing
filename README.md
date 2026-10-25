<h1 align="center">PimaBill</h1>

<p align="center">
  <strong>Open-source billing infrastructure for Africa & beyond.</strong><br/>
  Subscriptions, usage-based metering, invoicing, and prepaid wallets — with one API.
</p>

<p align="center">
  <a href="https://github.com/pimabill/billing/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-0e6e6b" alt="License" /></a>
  <a href="https://github.com/pimabill/billing/actions"><img src="https://github.com/pimabill/billing/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

---

## Why PimaBill?

Most billing platforms assume Stripe-only, USD-only, and card-only. PimaBill is built for businesses that operate across **multiple currencies, countries, and payment providers** — especially in Africa where mobile money, bank transfers, and regional gateways are the norm.

- **6 payment providers** — Stripe, Paystack, Flutterwave, DPO, PayU, PesaPal
- **40+ currencies** — USD, EUR, KES, UGX, NGN, GHS, ZAR, TZS, and more
- **Usage-based billing** — Billable metrics with COUNT, SUM, MAX, UNIQUE_COUNT, WEIGHTED_SUM aggregations
- **5 charge models** — Standard, Graduated, Volume, Package, Percentage
- **Multi-tenant** — Each tenant gets isolated data, custom SMTP, and their own payment provider credentials
- **Self-hosted** — Run it on your own infrastructure with Docker

## Features

| Category | What you get |
|----------|-------------|
| **Subscriptions** | Create plans with recurring billing (monthly, yearly, weekly), upgrade/downgrade with proration |
| **Usage Metering** | Ingest events via API, aggregate with billable metrics, charge based on consumption |
| **Invoicing** | Auto-generated invoices with PDF export, email delivery, hosted checkout pages |
| **Prepaid Wallets** | Customer credit wallets with purchased/granted credits, auto-deduction on invoices |
| **Coupons & Add-ons** | Percentage or fixed-amount discounts, one-time add-on charges |
| **Credit Notes** | Issue refunds, void invoices, pro-rated credits on cancellation |
| **Analytics** | Revenue, subscriptions, customers, and payment analytics dashboards |
| **Customer Portal** | Self-service portal for customers to view invoices and manage subscriptions |
| **Webhooks** | Real-time event notifications for invoice, payment, and subscription lifecycle |
| **SDKs** | Auto-generated TypeScript and Python SDKs via Fern |

## Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Landing   │  │  Dashboard  │  │    Docs     │  │   Portal    │
│  Next.js    │  │  Next.js    │  │  Nuxt/Docus │  │  Next.js    │
│  :4001      │  │  :4002      │  │  :4003      │  │  :4002/…    │
└──────┬──────┘  └──────┬──────┘  └─────────────┘  └──────┬──────┘
       │                │                                  │
       └────────────────┼──────────────────────────────────┘
                        │
                 ┌──────▼──────┐
                 │   NestJS    │
                 │   API       │
                 │   :4000     │
                 └──┬───┬───┬──┘
                    │   │   │
              ┌─────┘   │   └─────┐
              ▼         ▼         ▼
         PostgreSQL   Redis    BullMQ
         (Central +   (Cache)  (Workers)
          Tenant DBs)
```

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/pimabill/billing.git
cd billing
cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY

docker compose up -d --build
```

| Service   | URL                   |
|-----------|-----------------------|
| API       | http://localhost:4000  |
| Landing   | http://localhost:4001  |
| Dashboard | http://localhost:4002  |
| Docs      | http://localhost:4003  |

### Production (pre-built images)

```bash
# On your server:
curl -O https://raw.githubusercontent.com/pimabill/billing/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/pimabill/billing/main/.env.example
cp .env.example .env
# Edit .env with real secrets and domain URLs

docker compose -f docker-compose.prod.yml up -d
```

See [nginx.conf.example](nginx.conf.example) for a reverse proxy setup with custom domains.

### Local Development

```bash
# Start infrastructure
docker compose up -d central-db internal-tenant-db redis --wait

# Backend
cd backend
npm ci
npx prisma generate --schema=./prisma/schema-central.prisma
npx prisma generate --schema=./prisma/schema-tenant.prisma
npm run migrate:central   # tenant databases are migrated when created
npm run start:dev

# Dashboard (separate terminal)
cd dashboard
npm ci
npm run dev
```

## Project Structure

```
backend/       NestJS API — TypeScript, Prisma, BullMQ, PostgreSQL
dashboard/     Next.js 16 dashboard — shadcn/ui, Tailwind v4, Zustand
landing/       Next.js 15 marketing site
docs/          Nuxt/Docus documentation site
fern/          Fern SDK generation config
sdks/          Generated TypeScript and Python SDKs
```

## API

PimaBill exposes a REST API with 107 endpoints across 18 controllers. Interactive API docs are available at `/api/reference` (powered by Scalar).

**Authentication**: Register a tenant, get a JWT, and pass it as `Authorization: Bearer <token>`. Alternatively, use the API key from your tenant settings as `X-API-Key: <key>`.

```bash
# Register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "email": "john@acme.com", "password": "secret", "companyName": "Acme Corp"}'

# Create a customer
curl -X POST http://localhost:4000/api/customers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "email": "jane@example.com", "currency": "USD"}'
```

## SDKs

Official SDKs for TypeScript, Python and PHP are generated from the OpenAPI spec and published with every release (MIT licensed):

```bash
npm install pimabill
pip install pimabill
composer require pimabill/pimabill-php
```

### TypeScript

```typescript
import { PimaBillClient, PimaBillEnvironment } from "pimabill";

const client = new PimaBillClient({ token: process.env.PIMABILL_API_KEY! });
// Sandbox: new PimaBillClient({ token: "sk_test_...", environment: PimaBillEnvironment.Sandbox })
// Self-hosted: new PimaBillClient({ token, baseUrl: "https://billing.example.com" })

const customer = await client.customers.create({
  externalId: "usr_98765",
  name: "Jane Doe",
  email: "jane@example.com",
  currency: "USD",
});
```

### Python

```python
import os

from pimabill import PimaBillClient

client = PimaBillClient(token=os.environ["PIMABILL_API_KEY"])

customer = client.customers.create(
    external_id="usr_98765",
    name="Jane Doe",
    email="jane@example.com",
    currency="USD",
)
```

See the [SDK guides](docs/content/2.sdks) and [RELEASING.md](RELEASING.md) for how the packages are built and published.

## Sandbox

A sandbox deployment (`SANDBOX_MODE=true`) runs the same code against payment providers' test accounts, with `sk_test_` keys. The live dashboard can switch between live and sandbox; see the [Sandbox guide](docs/content/3.guides/8.sandbox.md).

## Payment Providers

| Provider | Regions | Methods |
|----------|---------|---------|
| **Stripe** | Global | Cards, bank transfers, wallets |
| **Paystack** | Nigeria, Ghana, South Africa, Kenya | Cards, bank transfers, mobile money |
| **Flutterwave** | 30+ African countries | Cards, mobile money, bank transfers |
| **DPO** | 20+ African countries | Cards, mobile money |
| **PayU** | South Africa, Nigeria, Kenya | Cards, EFT, mobile money |
| **PesaPal** | Kenya, Uganda, Tanzania | M-Pesa, Airtel Money, cards |

Configure providers per-tenant in the dashboard under **Settings > Payment Providers**. Credentials are encrypted at rest.

## Contributing

We're actively looking for contributors and testers. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and the roadmap.

Areas where help is needed:
- Taxes, net payment terms, grace periods
- Progressive billing, plan overrides, dunning
- Enhanced analytics, Helm charts, more tests

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

PimaBill is licensed under [AGPL-3.0](LICENSE). The generated SDKs are MIT-licensed, so they can be used in any project.
