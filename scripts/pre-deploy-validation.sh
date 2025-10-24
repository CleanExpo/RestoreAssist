#!/bin/bash

# Pre-Deployment Validation Script
# Comprehensive quality gate checks before allowing deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
FAILED_CHECKS=0
WARNINGS=0

echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║   RestoreAssist Pre-Deployment Validation           ║${NC}"
echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to log success
log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

# Function to log failure
log_failure() {
  echo -e "${RED}✗${NC} $1"
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
}

# Function to log warning
log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

# Function to log info
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

# =============================================================================
# GATE 1: Environment Variable Validation
# =============================================================================
echo -e "${BLUE}=== Gate 1: Environment Variables ===${NC}"
echo ""

check_env_var() {
  local var_name=$1
  local is_required=$2
  local description=$3

  if [ -z "${!var_name}" ]; then
    if [ "$is_required" = "true" ]; then
      log_failure "$description ($var_name) is missing"
    else
      log_warning "$description ($var_name) is optional but not set"
    fi
  else
    log_success "$description ($var_name) is set"
  fi
}

# Backend critical variables
check_env_var "ANTHROPIC_API_KEY" "true" "Anthropic API Key"
check_env_var "JWT_SECRET" "true" "JWT Secret"
check_env_var "JWT_REFRESH_SECRET" "true" "JWT Refresh Secret"
check_env_var "STRIPE_SECRET_KEY" "true" "Stripe Secret Key"
check_env_var "STRIPE_WEBHOOK_SECRET" "true" "Stripe Webhook Secret"
check_env_var "ALLOWED_ORIGINS" "true" "CORS Allowed Origins"

# Frontend critical variables
check_env_var "VITE_API_URL" "true" "Frontend API URL"
check_env_var "VITE_GOOGLE_CLIENT_ID" "true" "Google OAuth Client ID"
check_env_var "VITE_STRIPE_PUBLISHABLE_KEY" "true" "Stripe Publishable Key"
check_env_var "VITE_STRIPE_PRICE_FREE_TRIAL" "true" "Stripe Free Trial Price ID"
check_env_var "VITE_STRIPE_PRICE_MONTHLY" "true" "Stripe Monthly Price ID"
check_env_var "VITE_STRIPE_PRICE_YEARLY" "true" "Stripe Yearly Price ID"

# Optional but recommended
check_env_var "SENTRY_DSN" "false" "Sentry DSN for error tracking"
check_env_var "GOOGLE_CLIENT_SECRET" "false" "Google OAuth Client Secret"

echo ""

# =============================================================================
# GATE 2: TypeScript Compilation
# =============================================================================
echo -e "${BLUE}=== Gate 2: TypeScript Compilation ===${NC}"
echo ""

# Backend TypeScript check
echo -n "Checking backend TypeScript compilation... "
if cd packages/backend && npx tsc --noEmit 2>&1 | tee /tmp/backend-tsc.log; then
  log_success "Backend TypeScript compiles without errors"
else
  log_failure "Backend TypeScript compilation failed"
  echo -e "${RED}Compilation errors:${NC}"
  cat /tmp/backend-tsc.log
fi
cd ../..

# Frontend TypeScript check
echo -n "Checking frontend TypeScript compilation... "
if cd packages/frontend && npx tsc --noEmit 2>&1 | tee /tmp/frontend-tsc.log; then
  log_success "Frontend TypeScript compiles without errors"
else
  log_failure "Frontend TypeScript compilation failed"
  echo -e "${RED}Compilation errors:${NC}"
  cat /tmp/frontend-tsc.log
fi
cd ../..

echo ""

# =============================================================================
# GATE 3: Unit Test Execution
# =============================================================================
echo -e "${BLUE}=== Gate 3: Unit Tests ===${NC}"
echo ""

# Backend tests
echo "Running backend unit tests..."
if cd packages/backend && npm test -- --passWithNoTests 2>&1 | tee /tmp/backend-tests.log; then
  log_success "Backend unit tests passed"
else
  log_failure "Backend unit tests failed"
  echo -e "${RED}Test failures:${NC}"
  tail -n 50 /tmp/backend-tests.log
fi
cd ../..

# Frontend tests
echo "Running frontend unit tests..."
if cd packages/frontend && npm test -- --run 2>&1 | tee /tmp/frontend-tests.log; then
  log_success "Frontend unit tests passed"
else
  log_failure "Frontend unit tests failed"
  echo -e "${RED}Test failures:${NC}"
  tail -n 50 /tmp/frontend-tests.log
fi
cd ../..

echo ""

# =============================================================================
# GATE 4: Build Verification
# =============================================================================
echo -e "${BLUE}=== Gate 4: Build Verification ===${NC}"
echo ""

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf packages/backend/dist packages/frontend/dist

# Backend build
echo "Building backend..."
if cd packages/backend && npm run build 2>&1 | tee /tmp/backend-build.log; then
  log_success "Backend build completed"
else
  log_failure "Backend build failed"
  echo -e "${RED}Build errors:${NC}"
  tail -n 50 /tmp/backend-build.log
fi
cd ../..

# Frontend build
echo "Building frontend..."
if cd packages/frontend && npm run build 2>&1 | tee /tmp/frontend-build.log; then
  log_success "Frontend build completed"
else
  log_failure "Frontend build failed"
  echo -e "${RED}Build errors:${NC}"
  tail -n 50 /tmp/frontend-build.log
fi
cd ../..

# Verify build outputs
echo "Verifying build artifacts..."

if [ -d "packages/backend/dist" ] && [ -f "packages/backend/dist/index.js" ]; then
  log_success "Backend build artifacts present"
else
  log_failure "Backend build artifacts missing"
fi

if [ -d "packages/frontend/dist" ] && [ -f "packages/frontend/dist/index.html" ]; then
  log_success "Frontend build artifacts present"
else
  log_failure "Frontend build artifacts missing"
fi

echo ""

# =============================================================================
# GATE 5: Security Checks
# =============================================================================
echo -e "${BLUE}=== Gate 5: Security Checks ===${NC}"
echo ""

# Check for exposed secrets in code
echo "Scanning for exposed secrets..."
SECRET_PATTERNS=(
  "ANTHROPIC_API_KEY.*sk-ant-"
  "JWT_SECRET.*['\"].*['\"]"
  "STRIPE_SECRET_KEY.*sk_"
  "password.*=.*['\"].*['\"]"
  "api_key.*=.*['\"].*['\"]"
)

SECRETS_FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  if grep -r -E "$pattern" packages/backend/src packages/frontend/src 2>/dev/null | grep -v ".test" | grep -v "example"; then
    log_failure "Potential secret found matching pattern: $pattern"
    SECRETS_FOUND=1
  fi
done

if [ $SECRETS_FOUND -eq 0 ]; then
  log_success "No exposed secrets detected in source code"
fi

# NPM audit
echo "Running npm security audit..."
if npm audit --audit-level=high 2>&1 | tee /tmp/npm-audit.log; then
  log_success "No high-severity npm vulnerabilities found"
else
  log_warning "npm audit found vulnerabilities (review /tmp/npm-audit.log)"
fi

echo ""

# =============================================================================
# GATE 6: Database Migration Check
# =============================================================================
echo -e "${BLUE}=== Gate 6: Database Migrations ===${NC}"
echo ""

# Check for pending migrations
if [ -d "packages/backend/prisma/migrations" ]; then
  MIGRATION_COUNT=$(ls -1 packages/backend/prisma/migrations | wc -l)
  log_info "Found $MIGRATION_COUNT database migrations"

  # Check if migrations are up to date
  if cd packages/backend && npx prisma migrate status 2>&1 | grep -q "Database schema is up to date"; then
    log_success "Database migrations are up to date"
  else
    log_warning "Database migrations may need to be applied"
  fi
  cd ../..
else
  log_info "No Prisma migrations directory found"
fi

echo ""

# =============================================================================
# GATE 7: API Route Validation
# =============================================================================
echo -e "${BLUE}=== Gate 7: API Routes Validation ===${NC}"
echo ""

CRITICAL_ROUTES=(
  "authRoutes.js"
  "trialAuthRoutes.js"
  "reportRoutes.js"
  "stripeRoutes.js"
  "subscriptionRoutes.js"
)

for route in "${CRITICAL_ROUTES[@]}"; do
  if [ -f "packages/backend/dist/routes/$route" ]; then
    log_success "Critical route compiled: $route"
  else
    log_failure "Critical route missing: $route"
  fi
done

echo ""

# =============================================================================
# GATE 8: Vercel Configuration Validation
# =============================================================================
echo -e "${BLUE}=== Gate 8: Vercel Configuration ===${NC}"
echo ""

# Backend Vercel config
if [ -f "packages/backend/vercel.json" ]; then
  log_success "Backend vercel.json present"
else
  log_failure "Backend vercel.json missing"
fi

# Frontend Vercel config
if [ -f "packages/frontend/vercel.json" ]; then
  log_success "Frontend vercel.json present"
else
  log_failure "Frontend vercel.json missing"
fi

# API handler
if [ -f "packages/backend/api/index.js" ]; then
  log_success "Backend API handler present"
else
  log_failure "Backend API handler missing"
fi

echo ""

# =============================================================================
# FINAL SUMMARY
# =============================================================================
echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║   Validation Summary                                 ║${NC}"
echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
  log_success "All critical checks passed! ($WARNINGS warnings)"
  echo ""
  echo -e "${GREEN}✓ DEPLOYMENT AUTHORIZED${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Review warnings if any"
  echo "  2. Proceed with deployment"
  echo "  3. Monitor post-deployment health checks"
  echo ""
  exit 0
else
  echo -e "${RED}✗ DEPLOYMENT BLOCKED${NC}"
  echo ""
  echo -e "${RED}Failed checks: $FAILED_CHECKS${NC}"
  echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
  echo ""
  echo "Required actions:"
  echo "  1. Fix all failed checks above"
  echo "  2. Re-run validation script"
  echo "  3. Do not deploy until all checks pass"
  echo ""
  echo "Common issues:"
  echo "  • Missing environment variables"
  echo "  • TypeScript compilation errors"
  echo "  • Failing unit tests"
  echo "  • Build artifacts not generated"
  echo "  • Security vulnerabilities"
  echo ""
  exit 1
fi
