# SDK generation (Fern)

SDKs are generated from the committed OpenAPI spec, `backend/openapi/openapi.json`.
Published SDKs are built on releases and on request by the **SDKs** workflow
(`.github/workflows/sdks.yml`).

Pull-request CI checks that the spec matches the code and flags breaking API
changes. When a PR touches the spec, this folder or the docs, the **Docs and
SDKs** workflow also generates the tier1 SDKs and type-checks every
TypeScript and Python example in `docs/content` against them.

| Group | Languages | When |
|---|---|---|
| `tier1` | TypeScript, Python, PHP | Every release |
| `tier2` | Go, Java, Ruby, C# | On request (workflow dispatch) |

There is no Dart, Swift or browser SDK: billing calls need the secret API key,
which must stay on a server. Mobile and web apps call their own backend.

## After changing the API

```bash
cd backend
npm run openapi:export   # rewrites openapi/openapi.json; commit it with your change
```

Give every new operation an SDK name in `overrides.yml` (a unit test fails
otherwise), and describe its response with a DTO so the SDKs return it.

## Generate locally

Needs Docker:

```bash
cd fern
npx fern-api generate --local --group tier1 --force   # output in ../sdks/ (not committed)

# Then check the docs examples against them (needs pydantic and httpx):
cd ../docs && npm ci && node scripts/check-sdk-snippets.mjs
```

## Packages and publishing

`fern/packaging/package.sh <version>` turns the generated SDKs into an npm package (`pimabill`), a Python wheel (`pimabill`) and the Composer package (`pimabill/pimabill-php`). The **SDKs** workflow runs it on every release and publishes to npm, PyPI and Packagist; see [RELEASING.md](../RELEASING.md) for the one-time registry setup.

## Known generator limits

- TypeScript keeps the header's wire name for the idempotency key:
  `client.payouts.create({ ..., "Idempotency-Key": key })` (Python: `idempotency_key=`).
- PHP exception classes are named after the Fern organisation
  (`PimabillException`, `PimabillApiException`); the client is `PimaBillClient`.
