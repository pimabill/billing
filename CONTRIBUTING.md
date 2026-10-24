# Contributing to PimaBill

Thanks for your interest in contributing to PimaBill! This guide will help you get started.

## We're Looking for Contributors & Testers

PimaBill is in its early stages and we need help from the community. Whether you're an experienced developer or just getting started, there's a way to contribute.

### Alpha Testers

We need people to deploy PimaBill and put it through its paces:

- **Self-host it** with Docker and report any setup issues
- **Test the billing flows** — create customers, plans, subscriptions, generate invoices
- **Try the payment providers** — Stripe, Paystack, Flutterwave, DPO, PayU, PesaPal
- **Break things** — edge cases, error handling, unexpected inputs
- **Report bugs** via [GitHub Issues](https://github.com/pimabill/billing/issues) with steps to reproduce

No code required. Just your time and feedback.

### Contributors

Here's what's on the roadmap — pick what interests you:

| Area | What's Needed | Difficulty |
|------|---------------|------------|
| **Taxes** | Tax management with hierarchical overrides (org, customer, plan, charge) | Medium |
| **Net Payment Terms** | Configurable payment due dates per customer/plan | Easy |
| **Grace Periods** | Draft invoice period before auto-finalization | Easy |
| **Progressive Billing** | Threshold-based invoicing for high-usage customers | Medium |
| **Plan Overrides** | Customer-specific pricing on base plans | Medium |
| **Dunning** | Smart payment retry with configurable cadence | Medium |
| **Enhanced Analytics** | MRR breakdown, churn cohorts, revenue forecasting | Medium |
| **Documentation** | Guides, tutorials, API examples, video walkthroughs | Easy |
| **Frontend** | Dashboard improvements, new pages for upcoming features | Medium |
| **SDKs** | Improve TypeScript and Python SDK documentation/examples | Easy |
| **Testing** | More unit tests, integration tests, edge case coverage | Easy-Medium |
| **DevOps** | Helm charts, Terraform modules, one-click deploys | Medium-Hard |

Interested? Open an issue or comment on an existing one to say you're working on it. We're happy to provide guidance on any of the above.

### Other Ways to Help

- **Star the repo** — helps with visibility
- **Share PimaBill** — blog posts, tweets, talks
- **Answer questions** in [Discussions](https://github.com/pimabill/billing/discussions)
- **Review PRs** — fresh eyes always help

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [Docker](https://www.docker.com/) and Docker Compose
- Git

### Local Development Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/pimabill/billing.git
   cd billing
   ```

2. **Copy environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set real values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_KEY`.

3. **Start infrastructure** (PostgreSQL, Redis)

   ```bash
   docker compose up -d postgres redis
   ```

4. **Install dependencies and generate Prisma clients**

   ```bash
   cd backend
   npm ci
   npx prisma generate --schema=./prisma/schema-central.prisma
   npx prisma generate --schema=./prisma/schema-tenant.prisma
   npm run migrate:central
   ```

5. **Start the API**

   ```bash
   npm run start:dev
   ```

6. **Start the dashboard** (separate terminal)

   ```bash
   cd dashboard
   npm ci
   npm run dev
   ```

### Full Stack with Docker

To run everything (API, dashboard, landing, docs, PostgreSQL, Redis):

```bash
docker compose up -d --build
```

| Service   | URL                          |
|-----------|------------------------------|
| API       | http://localhost:4000         |
| Landing   | http://localhost:4001         |
| Dashboard | http://localhost:4002         |
| Docs      | http://localhost:4003         |

## Project Structure

```
backend/       NestJS API (TypeScript, Prisma, BullMQ)
dashboard/     Next.js dashboard app
landing/       Next.js marketing site
docs/          Nuxt/Docus documentation site
fern/          Fern SDK generation config
sdks/          Generated TypeScript and Python SDKs
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feat/wallet-expiration` — new feature
- `fix/invoice-tax-calc` — bug fix
- `docs/webhook-examples` — documentation

### Commit Messages

Write clear, concise commit messages:

```
feat: add progressive billing threshold check
fix: correct tax hierarchy resolution order
docs: add webhook retry configuration guide
```

PRs are squash-merged, so the **PR title** becomes the commit and sets the next version. CI checks it follows [Conventional Commits](https://www.conventionalcommits.org/):

PimaBill is in **beta**, so versions stay below 1.0 and every GitHub release is marked as a pre-release. While in beta, a breaking change bumps the minor version instead of the major one:

| Title | Release while in beta (0.x) | After 1.0 |
|---|---|---|
| `fix: ...` | patch (0.4.0 → 0.4.1) | patch (1.4.0 → 1.4.1) |
| `feat: ...` | minor (0.4.0 → 0.5.0) | minor (1.4.0 → 1.5.0) |
| `feat!: ...` or `fix!: ...` | minor (0.4.0 → 0.5.0) | major (1.4.0 → 2.0.0) |
| `docs:`, `refactor:`, `test:`, `chore:`, `ci:`, `build:`, `perf:` | no release on their own | no release on their own |

A PR that removes or changes anything existing API clients rely on fails CI unless its title is marked breaking with `!`. Mark it only when it really breaks clients: the mark is permanent in the history and shows up in the changelog.

[release-please](https://github.com/googleapis/release-please) keeps a release PR open on `main` with the next version and changelog. Merging that PR tags the release, and the 1.0 release is made deliberately by maintainers, not by a commit title.

Every PR updates the documentation it affects in the same PR: the guides in `docs/content`, `.env.example` for new settings, and this file for process changes.

### Code Style

- **Backend**: NestJS conventions — modules, controllers, services, DTOs
- **Dashboard**: Next.js App Router, shadcn/ui components, Zustand stores
- **TypeScript**: Strict mode enabled in all packages
- No unused imports or variables
- No `any` types unless absolutely necessary

### Running Tests

```bash
cd backend

# Unit tests
npx jest test/unit --no-coverage --forceExit

# E2E tests (requires running Docker services)
npx jest test/e2e --runInBand --no-coverage --forceExit

# Type check
npx tsc --noEmit
```

### Database Changes

If you modify Prisma schemas:

1. Edit `backend/prisma/schema-central.prisma` or `backend/prisma/schema-tenant.prisma`
2. Regenerate clients: `npx prisma generate --schema=./prisma/schema-<name>.prisma`
3. Create a migration: `npm run prisma:migrate:central -- --name <change>` or `npm run prisma:migrate:tenant -- --name <change>`
   (central and tenant migrations live in `prisma/migrations/central` and `prisma/migrations/tenant`)
4. Apply to existing tenant databases: `npm run migrate:tenants`
5. Document the schema change in your PR description

## Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes with tests where applicable
3. Ensure `npx tsc --noEmit` passes with no errors
4. Ensure all existing tests still pass
5. Open a PR with a Conventional Commits title (see [Commit Messages](#commit-messages)) and a clear description
6. Link any related issues

### PR Description Template

```markdown
## What

Brief description of the change.

## Why

Why is this change needed?

## How to Test

Steps to verify the change works.
```

## Reporting Issues

Use [GitHub Issues](https://github.com/pimabill/billing/issues) to report bugs or request features.

For bugs, include:
- Steps to reproduce
- Expected vs actual behavior
- PimaBill version / commit SHA
- Docker or bare-metal setup
- Relevant logs

## Questions?

Open a [Discussion](https://github.com/pimabill/billing/discussions) for general questions, ideas, or help with setup.

## License

By contributing to PimaBill, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
