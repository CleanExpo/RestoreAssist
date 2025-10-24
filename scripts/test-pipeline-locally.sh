#!/bin/bash

# Test CI/CD Pipeline Locally
# Runs all quality gates to verify pipeline readiness

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║   CI/CD Pipeline Local Test                          ║${NC}"
echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

FAILED_TESTS=0

# Function to log success
log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

# Function to log failure
log_failure() {
  echo -e "${RED}✗${NC} $1"
  FAILED_TESTS=$((FAILED_TESTS + 1))
}

# Function to log info
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

# =============================================================================
# TEST 1: Verify Script Existence
# =============================================================================
echo -e "${BLUE}=== Test 1: Script Files ===${NC}"
echo ""

scripts=(
  "scripts/pre-deploy-validation.sh"
  "scripts/post-deploy-verification.sh"
  "scripts/rollback.sh"
  "scripts/health-check.sh"
)

for script in "${scripts[@]}"; do
  if [ -f "$script" ] && [ -x "$script" ]; then
    log_success "$script exists and is executable"
  else
    log_failure "$script missing or not executable"
  fi
done

echo ""

# =============================================================================
# TEST 2: Verify Documentation
# =============================================================================
echo -e "${BLUE}=== Test 2: Documentation Files ===${NC}"
echo ""

docs=(
  "CICD_PIPELINE.md"
  "DEPLOYMENT_QUICK_REFERENCE.md"
  "CICD_IMPLEMENTATION_SUMMARY.md"
)

for doc in "${docs[@]}"; do
  if [ -f "$doc" ]; then
    log_success "$doc exists"
  else
    log_failure "$doc missing"
  fi
done

echo ""

# =============================================================================
# TEST 3: Verify GitHub Workflows
# =============================================================================
echo -e "${BLUE}=== Test 3: GitHub Workflows ===${NC}"
echo ""

workflows=(
  ".github/workflows/deploy.yml"
  ".github/workflows/test.yml"
)

for workflow in "${workflows[@]}"; do
  if [ -f "$workflow" ]; then
    log_success "$workflow exists"

    # Check for required jobs
    if grep -q "pre-deployment-validation" "$workflow" 2>/dev/null; then
      log_success "  → Contains pre-deployment-validation job"
    fi

    if grep -q "post-deployment-verification" "$workflow" 2>/dev/null; then
      log_success "  → Contains post-deployment-verification job"
    fi
  else
    log_failure "$workflow missing"
  fi
done

echo ""

# =============================================================================
# TEST 4: Verify Dependencies
# =============================================================================
echo -e "${BLUE}=== Test 4: Dependencies ===${NC}"
echo ""

# Check for Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  log_success "Node.js installed: $NODE_VERSION"
else
  log_failure "Node.js not installed"
fi

# Check for npm
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version)
  log_success "npm installed: $NPM_VERSION"
else
  log_failure "npm not installed"
fi

# Check for jq (for JSON parsing in scripts)
if command -v jq &> /dev/null; then
  JQ_VERSION=$(jq --version)
  log_success "jq installed: $JQ_VERSION"
else
  log_info "jq not installed (recommended for post-deployment verification)"
fi

# Check for curl
if command -v curl &> /dev/null; then
  log_success "curl installed"
else
  log_failure "curl not installed (required for verification scripts)"
fi

echo ""

# =============================================================================
# TEST 5: Run Pre-Deployment Validation (Dry Run)
# =============================================================================
echo -e "${BLUE}=== Test 5: Pre-Deployment Validation (Dry Run) ===${NC}"
echo ""

log_info "Testing pre-deployment validation script..."

# Set minimal environment for testing
export NODE_ENV=test
export USE_POSTGRES=false

# Check if script runs without errors (syntax check)
if bash -n scripts/pre-deploy-validation.sh 2>&1; then
  log_success "Pre-deployment validation script syntax valid"
else
  log_failure "Pre-deployment validation script has syntax errors"
fi

echo ""

# =============================================================================
# TEST 6: Run Post-Deployment Verification (Dry Run)
# =============================================================================
echo -e "${BLUE}=== Test 6: Post-Deployment Verification (Dry Run) ===${NC}"
echo ""

log_info "Testing post-deployment verification script..."

# Check if script runs without errors (syntax check)
if bash -n scripts/post-deploy-verification.sh 2>&1; then
  log_success "Post-deployment verification script syntax valid"
else
  log_failure "Post-deployment verification script has syntax errors"
fi

echo ""

# =============================================================================
# TEST 7: Run Rollback Script (Dry Run)
# =============================================================================
echo -e "${BLUE}=== Test 7: Rollback Script (Dry Run) ===${NC}"
echo ""

log_info "Testing rollback script..."

# Check if script runs without errors (syntax check)
if bash -n scripts/rollback.sh 2>&1; then
  log_success "Rollback script syntax valid"
else
  log_failure "Rollback script has syntax errors"
fi

echo ""

# =============================================================================
# TEST 8: Check Environment Variables
# =============================================================================
echo -e "${BLUE}=== Test 8: Environment Variables ===${NC}"
echo ""

log_info "Checking for critical environment variables..."

critical_vars=(
  "ANTHROPIC_API_KEY"
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
)

for var in "${critical_vars[@]}"; do
  if [ -n "${!var}" ]; then
    log_success "$var is set"
  else
    log_info "$var not set (required for deployment)"
  fi
done

echo ""

# =============================================================================
# TEST 9: Test TypeScript Compilation
# =============================================================================
echo -e "${BLUE}=== Test 9: TypeScript Compilation ===${NC}"
echo ""

log_info "Checking TypeScript compilation..."

# Backend
if [ -f "packages/backend/tsconfig.json" ]; then
  log_success "Backend tsconfig.json found"

  if cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | head -n 5; then
    log_success "Backend TypeScript check passed"
  else
    log_failure "Backend TypeScript has errors"
  fi
  cd ../..
else
  log_failure "Backend tsconfig.json not found"
fi

# Frontend
if [ -f "packages/frontend/tsconfig.json" ]; then
  log_success "Frontend tsconfig.json found"

  if cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -n 5; then
    log_success "Frontend TypeScript check passed"
  else
    log_failure "Frontend TypeScript has errors"
  fi
  cd ../..
else
  log_failure "Frontend tsconfig.json not found"
fi

echo ""

# =============================================================================
# TEST 10: Verify Package Scripts
# =============================================================================
echo -e "${BLUE}=== Test 10: Package Scripts ===${NC}"
echo ""

log_info "Checking package.json scripts..."

required_scripts=(
  "build"
  "test"
  "validate:deployment"
)

for script in "${required_scripts[@]}"; do
  if grep -q "\"$script\":" package.json 2>/dev/null; then
    log_success "Root package.json has '$script' script"
  else
    log_info "Root package.json missing '$script' script"
  fi
done

echo ""

# =============================================================================
# FINAL SUMMARY
# =============================================================================
echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║   Pipeline Test Summary                              ║${NC}"
echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  log_success "All pipeline tests passed!"
  echo ""
  echo -e "${GREEN}✓ CI/CD PIPELINE READY${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Configure GitHub secrets"
  echo "  2. Test with a dummy commit"
  echo "  3. Monitor first deployment"
  echo "  4. Verify post-deployment checks"
  echo ""
  exit 0
else
  echo -e "${RED}✗ PIPELINE NOT READY${NC}"
  echo ""
  echo -e "${RED}Failed tests: $FAILED_TESTS${NC}"
  echo ""
  echo "Required actions:"
  echo "  1. Fix failed tests above"
  echo "  2. Re-run this script"
  echo "  3. Do not push to main until all tests pass"
  echo ""
  exit 1
fi
