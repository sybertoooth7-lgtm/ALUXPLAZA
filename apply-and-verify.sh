#!/usr/bin/env bash
# Applies the mandatory-admin-MFA update to a local clone of the repo and
# checks it. Usage:
#   ./apply-and-verify.sh /path/to/ALUXPLAZA            # apply + install + lint + typecheck + tests
#   ./apply-and-verify.sh /path/to/ALUXPLAZA --no-tests # skip the database tests
#
# Backend tests need a reachable PostgreSQL. Set TEST_DATABASE_URL, or the
# default postgresql://alux:test@localhost:5432/postgres is used.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/files"
REPO="${1:-}"
RUN_TESTS=1
[ "${2:-}" = "--no-tests" ] && RUN_TESTS=0

if [ -z "$REPO" ] || [ ! -d "$REPO/backend" ] || [ ! -d "$REPO/frontend" ]; then
  echo "Usage: $0 /path/to/ALUXPLAZA [--no-tests]"
  echo "The folder must contain backend/ and frontend/."
  exit 2
fi
REPO="$(cd "$REPO" && pwd)"

step() { printf '\n== %s ==\n' "$1"; }
fail() { printf '\nFAILED: %s\n' "$1" >&2; exit 1; }

step "1. Copy files (exact repo paths)"
COUNT=0
while IFS= read -r rel; do
  rel="${rel#./}"
  mkdir -p "$REPO/$(dirname "$rel")"
  cp "$SRC/$rel" "$REPO/$rel"
  COUNT=$((COUNT + 1))
done < <(cd "$SRC" && find . -type f | sort)
echo "copied $COUNT files"

step "2. Check every file landed with the exact name"
while IFS= read -r rel; do
  rel="${rel#./}"
  [ -f "$REPO/$rel" ] || fail "missing after copy: $rel"
  cmp -s "$SRC/$rel" "$REPO/$rel" || fail "content differs: $rel"
  case "$rel" in
    *" "*|*"•"*) fail "bad character in filename: $rel" ;;
  esac
  echo "ok  $rel"
done < <(cd "$SRC" && find . -type f | sort)

step "3. Lockfiles are valid JSON"
for lock in backend/package-lock.json frontend/package-lock.json; do
  node -e "const j=JSON.parse(require('fs').readFileSync('$REPO/$lock','utf8'));console.log('$lock: lockfileVersion '+j.lockfileVersion+', '+Object.keys(j.packages).length+' packages')" \
    || fail "$lock is not valid JSON"
done

step "4. Backend: install, lint"
( cd "$REPO/backend" && npm ci --no-audit --no-fund >/dev/null && npx eslint . ) || fail "backend install or lint"
echo "backend lint ok"

step "5. Frontend: install, typecheck, lint, build"
( cd "$REPO/frontend" && npm ci --no-audit --no-fund >/dev/null && npx tsc -b && npx eslint . && npx vite build >/dev/null ) || fail "frontend checks"
echo "frontend ok"

if [ "$RUN_TESTS" = "1" ]; then
  step "6. Backend tests (real PostgreSQL)"
  export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://alux:test@localhost:5432/postgres}"
  if ! ( cd "$REPO/backend" && node -e "
    const pg=require('pg');const c=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
    c.connect().then(()=>c.end()).catch(e=>{console.error(e.message);process.exit(1)})" ) 2>/dev/null; then
    fail "cannot reach PostgreSQL at \$TEST_DATABASE_URL. Start it, or re-run with --no-tests."
  fi
  ( cd "$REPO/backend" && npx vitest run ) || fail "backend tests"
else
  step "6. Backend tests skipped (--no-tests)"
fi

step "Done"
( cd "$REPO" && git status --short 2>/dev/null || true )
echo
echo "All checks passed. Review the changes, then commit."
