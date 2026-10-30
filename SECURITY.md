# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

We only patch the latest release. We recommend always running the most recent version.

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report vulnerabilities privately by emailing **security@pimabill.com**.

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could do)
- Affected component (backend, dashboard, specific endpoint, etc.)
- Your suggested fix, if any

## What to Expect

- **Acknowledgement** within 48 hours
- **Initial assessment** within 5 business days
- **Fix timeline** depends on severity:
  - **Critical** (RCE, auth bypass, data leak): patch within 72 hours
  - **High** (privilege escalation, injection): patch within 1 week
  - **Medium** (CSRF, information disclosure): patch within 2 weeks
  - **Low** (best practice, hardening): next scheduled release

## Scope

The following are in scope:
- Backend API (`backend/`)
- Dashboard application (`dashboard/`)
- Authentication and authorization (JWT, API keys, tenant isolation)
- Payment provider integrations (Stripe, Paystack, Flutterwave, DPO, PayU, PesaPal)
- Webhook signature verification
- Data encryption (API keys, provider credentials)
- Docker configuration and container security

Out of scope:
- Third-party dependencies (report upstream, but let us know)
- Denial-of-service attacks
- Social engineering
- Issues in the landing page or docs site that don't affect user data

## Security Best Practices for Self-Hosters

- Always change default secrets in `.env` (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`)
- Generate secrets with: `openssl rand -hex 32`
- Run PostgreSQL and Redis on private networks, not exposed to the internet
- Use HTTPS in production (reverse proxy with nginx/Caddy + TLS)
- Keep Docker images updated
- Restrict API access with firewalls or security groups
- Rotate API keys periodically via the dashboard

## Credit

We appreciate responsible disclosure. With your permission, we'll credit you in the release notes for any vulnerability you report.
