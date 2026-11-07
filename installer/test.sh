#!/bin/sh
# Runs the installer against a stand-in for Docker. From the repository root: sh installer/test.sh
set -eu
root=$(pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/share"
cp installer/docker-compose.yml version.txt "$work/share/"
cat > "$work/bin/docker" <<'FAKE'
#!/bin/sh
echo "docker $*" >> "$FAKE_LOG"
case "$*" in *pg_dump*) [ -n "${FAKE_EMPTY_DUMP:-}" ] || echo "-- dump" ;; esac
FAKE
chmod +x "$work/bin/docker"
export FAKE_LOG="$work/log" PATH="$work/bin:$PATH" PIMABILL_SHARE="$work/share"
run() { sh "$root/installer/pimabill" "$@" </dev/null; }
check() { "$@" || { echo "Failed: $*"; exit 1; }; }

PIMABILL_DIR="$work/local" run install >/dev/null
check grep -q "^DASHBOARD_URL='http://localhost:4002'$" "$work/local/.env"
check grep -q "^COMPOSE_PROFILES=''$" "$work/local/.env"
check grep -Eq "^ENCRYPTION_KEY='[0-9a-f]{64}'$" "$work/local/.env"
check test "$(stat -c %a "$work/local/.env")" = 600

key=$(grep ENCRYPTION_KEY "$work/local/.env")
PIMABILL_DIR="$work/local" run install >/dev/null
check test "$key" = "$(grep ENCRYPTION_KEY "$work/local/.env")"

PIMABILL_DIR="$work/site" PIMABILL_DASHBOARD_DOMAIN=app.example.com PIMABILL_TLS_EMAIL=a@example.com \
  PIMABILL_EMAIL_HOST=smtp.example.com PIMABILL_EMAIL_PASSWORD="p\$w'd" run install >/dev/null
check grep -q "^API_URL='https://api.example.com'$" "$work/site/.env"
check grep -q "^COMPOSE_PROFILES='https'$" "$work/site/.env"
check grep -qF "EMAIL_PASSWORD='p\$w\\'d'" "$work/site/.env"

PIMABILL_DIR="$work/local" PIMABILL_VERSION=9.9.9 run upgrade >/dev/null
check grep -q "^PIMABILL_VERSION='9.9.9'$" "$work/local/.env"
check test -s "$work"/local/backups/*/tenants.sql.gz

if PIMABILL_DIR="$work/bad" PIMABILL_DASHBOARD_DOMAIN='not a domain' run install >/dev/null 2>&1; then echo "Failed: accepted a bad domain"; exit 1; fi
if FAKE_EMPTY_DUMP=1 PIMABILL_DIR="$work/local" PIMABILL_VERSION=9.9.10 run upgrade >/dev/null 2>&1; then echo "Failed: upgraded on an empty backup"; exit 1; fi
check grep -q "^PIMABILL_VERSION='9.9.9'$" "$work/local/.env"
echo "Installer tests passed"
