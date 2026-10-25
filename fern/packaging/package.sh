#!/usr/bin/env bash
# Turn the generated SDKs (../../sdks) into publishable packages in ../../dist-sdks:
#   typescript/  an npm package (CommonJS + ES modules, with types)
#   python/      a wheel and source distribution
#   php/         the Composer package as generated
# Usage: fern/packaging/package.sh 0.1.0
set -euo pipefail
VERSION="${1:?usage: package.sh <version>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SDKS="$ROOT/sdks"
OUT="$ROOT/dist-sdks"
rm -rf "$OUT" && mkdir -p "$OUT"

readme() { # $1 language, $2 install line
  cat <<MD
# PimaBill $1 SDK

The official $1 client for the [PimaBill](https://github.com/pimabill/billing) API: customers, plans,
subscriptions, usage, invoices, payments, wallets and money movement.

\`\`\`
$2
\`\`\`

Full guides and examples: https://github.com/pimabill/billing/tree/main/docs/content

Generated from the PimaBill OpenAPI spec, version $VERSION. MIT licensed.
MD
}

# TypeScript
if [ -d "$SDKS/typescript" ]; then
  T="$OUT/typescript"
  mkdir -p "$T/src"
  cp -r "$SDKS/typescript/." "$T/src/"
  cp "$HERE/typescript/"*.json "$T/"
  cp "$HERE/LICENSE" "$T/"
  readme TypeScript "npm install pimabill" > "$T/README.md"
  # Build tools only (--no-save): the published package has no dependencies.
  (cd "$T" && npm pkg set version="$VERSION" \
    && npm install --no-save --no-audit --no-fund --silent typescript@5.8.3 @types/node@20.17.10 \
    && npx tsc -p tsconfig.cjs.json \
    && npx tsc -p tsconfig.esm.json \
    && rm -rf node_modules \
    && echo '{"type":"module"}' > dist/esm/package.json \
    && echo '{"type":"commonjs"}' > dist/cjs/package.json \
    && npm pack --silent >/dev/null)
  echo "typescript: $(ls "$T"/*.tgz)"
fi

# Python
if [ -d "$SDKS/python" ]; then
  P="$OUT/python"
  mkdir -p "$P/pimabill"
  cp -r "$SDKS/python/." "$P/pimabill/"
  cp "$HERE/python/pyproject.toml" "$HERE/LICENSE" "$P/"
  sed -i "s/^version = \".*\"/version = \"$VERSION\"/" "$P/pyproject.toml"
  touch "$P/pimabill/py.typed"
  readme Python "pip install pimabill" > "$P/README.md"
  (cd "$P" && python3 -m pip install --quiet build==1.2.2 && python3 -m build --outdir dist . >/dev/null)
  echo "python: $(ls "$P"/dist/* | tr '\n' ' ')"
fi

# PHP: already a Composer package; its version comes from the git tag.
if [ -d "$SDKS/php" ]; then
  cp -r "$SDKS/php" "$OUT/php"
  cp "$HERE/LICENSE" "$OUT/php/LICENSE"
  echo "php: $OUT/php"
fi
