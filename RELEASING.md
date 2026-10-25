# Releasing PimaBill

One version covers the whole system: the API, dashboard, landing page, docs, OpenAPI spec and the SDKs. While PimaBill is in beta, versions stay below 1.0 and GitHub releases are marked as pre-releases.

## How a release happens

1. Pull requests are squash-merged with a [Conventional Commits](https://www.conventionalcommits.org/) title (see [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages)).
2. [release-please](https://github.com/googleapis/release-please) keeps a pull request open on `main` titled `chore(main): release X.Y.Z`, with the changelog and the version bumped in every `package.json`, the OpenAPI spec and `version.txt`.
3. **Merging that pull request is the release.** It tags `vX.Y.Z`, publishes the GitHub release, and starts the **SDKs** workflow, which builds and publishes the SDKs.
4. Deploys are separate: every merge to `main` deploys the hosted API and dashboard (**Deploy** workflow).

To release a particular version (for example the first 1.0), add a footer to the commit that should trigger it:

```
Release-As: 1.0.0
```

## SDK packages

| Language | Package | Registry | Install |
|---|---|---|---|
| TypeScript / JavaScript | `pimabill` | npm | `npm install pimabill` |
| Python | `pimabill` | PyPI | `pip install pimabill` |
| PHP | `pimabill/pimabill-php` | Packagist | `composer require pimabill/pimabill-php` |

Go, Java, Ruby and C# (`tier2`) are generated on request and not published.

The SDKs are generated from `backend/openapi/openapi.json` by [Fern](https://buildwithfern.com) (`fern/generators.yml`), then turned into packages by `fern/packaging/package.sh`:

- **TypeScript:** compiled to CommonJS and ES modules with type definitions; no runtime dependencies.
- **Python:** a wheel and source distribution (needs `httpx`, `pydantic`, `typing_extensions`).
- **PHP:** the generated Composer package, pushed to its own repository so Packagist can read it.

Every SDK carries the release version and the MIT licence; the server itself is AGPL-3.0.

## One-time setup for publishing

Until a registry is set up, the workflow skips it (with a notice) and still uploads the built packages as an artifact named `packages-X.Y.Z`. Do these once, by a maintainer of the `pimabill` GitHub organisation.

### npm (`pimabill`)

1. Create (or sign in to) the npm account or organisation that will own the package, with two-factor authentication on.
2. Create a **granular access token**: npmjs.com → Access Tokens → Generate New Token → Granular. Permission: *Read and write*, scope: all packages (the first publish creates `pimabill`), and *Bypass 2FA for automation*. Pick an expiry and note it.
3. In GitHub: `pimabill/billing` → Settings → Secrets and variables → Actions → **New repository secret** named `NPM_TOKEN` with that token.
4. After the first publish, narrow the token to the `pimabill` package.

Releases are published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), which links each version to the workflow run that built it.

### PyPI (`pimabill`)

Trusted publishing needs no stored token:

1. Sign in to [pypi.org](https://pypi.org) (two-factor authentication on) → Your account → **Publishing** → *Add a new pending publisher*:
   - PyPI project name: `pimabill`
   - Owner: `pimabill`, repository: `billing`
   - Workflow name: `release.yml`
   - Environment: `pypi`
2. Add a second pending publisher with workflow `sdks.yml`, for publishing by hand.
3. In GitHub: Settings → Environments → **New environment** `pypi` (optionally require a reviewer).
4. Settings → Secrets and variables → Actions → **Variables** → `PYPI_PUBLISHING` = `true`.

If trusted publishing is refused (it can be, for workflows called from another workflow), create a PyPI API token instead and store it as the secret `PYPI_API_TOKEN`; the workflow uses it when it is set.

### Packagist (`pimabill/pimabill-php`)

Packagist publishes from a git repository's tags, so the PHP SDK lives in its own repository:

1. Create an empty public repository **`pimabill/pimabill-php`** on GitHub.
2. Create a deploy key: `ssh-keygen -t ed25519 -C "pimabill-php release" -f pimabill-php-deploy -N ""`.
3. In `pimabill/pimabill-php` → Settings → Deploy keys → Add: paste `pimabill-php-deploy.pub`, **allow write access**.
4. In `pimabill/billing` → Settings → Secrets → Actions: secret `PHP_SDK_DEPLOY_KEY` with the contents of `pimabill-php-deploy` (the private key). Then delete both key files from your machine.
5. After the first release has pushed code and a tag, go to [packagist.org](https://packagist.org) → Submit → `https://github.com/pimabill/pimabill-php`, then connect your GitHub account so Packagist updates on every tag.

### Fern (optional)

Local generation does not need a Fern account. `FERN_TOKEN` is only needed if Fern's hosted features are used later.

## Publishing by hand

To publish a release again, or one made before publishing was set up: Actions → **SDKs** → *Run workflow*, with group `tier1`, the tag (for example `v0.1.0`) and **Publish** ticked. A version that is already on a registry is refused by that registry, so publishing the same version twice does nothing harmful.

To build the packages locally (needs Docker for Fern):

```bash
cd fern && npx fern-api@3.78.0 generate --local --group tier1 --version 0.1.0 --force && cd ..
fern/packaging/package.sh 0.1.0      # output in dist-sdks/
```

## Checking a release

- npm: `npm view pimabill version`
- PyPI: `pip index versions pimabill`
- Packagist: <https://packagist.org/packages/pimabill/pimabill-php>
- Then a quick install of each and one call against the [sandbox](docs/content/3.guides/8.sandbox.md) with a `sk_test_` key.
