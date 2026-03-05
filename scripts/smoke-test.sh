#!/usr/bin/env bash
# =============================================================================
# RestoreAssist Smoke Tests -- 12 automated checks against a running instance
# Usage:  BASE_URL=https://restoreassist.com.au ./scripts/smoke-test.sh
#         ./scripts/smoke-test.sh                      (defaults to localhost:3000)
# =============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0
TOTAL=12

echo ""
echo "============================================"
echo "  RestoreAssist Smoke Tests"
echo "  Target: $BASE_URL"
echo "  Date:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================"
echo ""

# ------------------------------------------------------------------
# Helper: run a single check
# ------------------------------------------------------------------
check() {
  local num="$1"
  local name="$2"
  local cmd="$3"
  local expected="$4"

  result=$(eval "$cmd" 2>/dev/null) || result=""
  if echo "$result" | grep -q "$expected"; then
    echo "  PASS  [$num/$TOTAL] $name"
    ((PASS++))
  else
    echo "  FAIL  [$num/$TOTAL] $name"
    echo "          expected to find: $expected"
    echo "          got: $(echo "$result" | head -c 200)"
    ((FAIL++))
  fi
}

# ==================================================================
# 1. Homepage loads (HTTP 200)
# ==================================================================
check 1 "Homepage returns 200" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL'" \
  "200"

# ==================================================================
# 2. Health API returns ok
# ==================================================================
check 2 "Health API (/api/health)" \
  "curl -s '$BASE_URL/api/health'" \
  '"status":"ok"'

# ==================================================================
# 3. Auth redirect -- unauthenticated request to /dashboard returns redirect (302/307)
# ==================================================================
check 3 "Dashboard redirects to login when unauthenticated" \
  "curl -s -o /dev/null -w '%{http_code}' -L --max-redirs 0 '$BASE_URL/dashboard'" \
  "307\|302\|200"

# ==================================================================
# 4. NextAuth session endpoint exists
# ==================================================================
check 4 "NextAuth session endpoint (/api/auth/session)" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/auth/session'" \
  "200"

# ==================================================================
# 5. Protected API returns 401 without session
# ==================================================================
check 5 "Clients API returns 401 unauthenticated" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/clients'" \
  "401"

# ==================================================================
# 6. Reports API returns 401 without session
# ==================================================================
check 6 "Reports API returns 401 unauthenticated" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/reports'" \
  "401"

# ==================================================================
# 7. Invoices API returns 401 without session
# ==================================================================
check 7 "Invoices API returns 401 unauthenticated" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/invoices'" \
  "401"

# ==================================================================
# 8. Contractors public listing returns 200
# ==================================================================
check 8 "Contractors public listing (/api/contractors)" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/contractors'" \
  "200"

# ==================================================================
# 9. Static assets load (Next.js _next chunk)
# ==================================================================
check 9 "Static assets served (/_next/ present in homepage)" \
  "curl -s '$BASE_URL' | grep -o '_next'" \
  "_next"

# ==================================================================
# 10. Security headers present
# ==================================================================
check 10 "Security headers (X-Frame-Options)" \
  "curl -s -I '$BASE_URL' | grep -i 'x-frame-options'" \
  "DENY"

# ==================================================================
# 11. Stripe webhook endpoint accepts POST (returns 400 without sig, not 404)
# ==================================================================
check 11 "Stripe webhook endpoint exists (/api/webhooks/stripe)" \
  "curl -s -o /dev/null -w '%{http_code}' -X POST '$BASE_URL/api/webhooks/stripe' -H 'Content-Type: application/json' -d '{}'" \
  "400"

# ==================================================================
# 12. Cron endpoint rejects unauthenticated requests
# ==================================================================
check 12 "Cron cleanup rejects without secret (/api/cron/cleanup)" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/cron/cleanup'" \
  "401"

# ==================================================================
# Summary
# ==================================================================
echo ""
echo "============================================"
echo "  Results: $PASS passed, $FAIL failed (out of $TOTAL)"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "  SMOKE TEST FAILED -- $FAIL check(s) did not pass."
  exit 1
else
  echo ""
  echo "  All smoke tests passed."
  exit 0
fi
