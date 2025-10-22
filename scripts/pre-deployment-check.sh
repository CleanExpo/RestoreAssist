#!/bin/bash

# Pre-Deployment Verification Script for RestoreAssist
# Run this before deploying to production

echo "🚀 RestoreAssist Pre-Deployment Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check environment variable
check_env_var() {
    local var_name=$1
    local env_file=$2

    if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
        local value=$(grep "^${var_name}=" "$env_file" | cut -d'=' -f2-)
        if [ -z "$value" ] || [[ "$value" =~ (YOUR_|CHANGE_THIS|REPLACE_) ]]; then
            echo -e "${RED}✗${NC} $var_name is not configured in $env_file"
            ((ERRORS++))
            return 1
        else
            echo -e "${GREEN}✓${NC} $var_name is configured"
            return 0
        fi
    else
        echo -e "${YELLOW}⚠${NC} $var_name not found in $env_file"
        ((WARNINGS++))
        return 1
    fi
}

echo "📋 Checking Prerequisites..."
echo ""

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js is not installed"
    ((ERRORS++))
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓${NC} npm installed: $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm is not installed"
    ((ERRORS++))
fi

# Check Prisma CLI
if command_exists prisma; then
    echo -e "${GREEN}✓${NC} Prisma CLI installed"
else
    echo -e "${YELLOW}⚠${NC} Prisma CLI not globally installed (will use npx)"
    ((WARNINGS++))
fi

echo ""
echo "🔐 Checking Backend Environment Variables..."
echo ""

BACKEND_ENV="packages/backend/.env"

if [ ! -f "$BACKEND_ENV" ]; then
    echo -e "${RED}✗${NC} Backend .env file not found!"
    ((ERRORS++))
else
    check_env_var "STRIPE_SECRET_KEY" "$BACKEND_ENV"
    check_env_var "STRIPE_WEBHOOK_SECRET" "$BACKEND_ENV"
    check_env_var "JWT_SECRET" "$BACKEND_ENV"
    check_env_var "JWT_REFRESH_SECRET" "$BACKEND_ENV"
    check_env_var "DATABASE_URL" "$BACKEND_ENV"
    check_env_var "ANTHROPIC_API_KEY" "$BACKEND_ENV"
    check_env_var "EMAIL_FROM" "$BACKEND_ENV"

    # Check if using default secrets
    if grep -q "your-super-secret" "$BACKEND_ENV"; then
        echo -e "${RED}✗${NC} Default JWT secrets detected! MUST change before production"
        ((ERRORS++))
    fi

    # Check if using live Stripe keys
    if grep -q "sk_live_" "$BACKEND_ENV"; then
        echo -e "${GREEN}✓${NC} Using Stripe LIVE keys"
    elif grep -q "sk_test_" "$BACKEND_ENV"; then
        echo -e "${YELLOW}⚠${NC} Using Stripe TEST keys (change to sk_live_ for production)"
        ((WARNINGS++))
    fi
fi

echo ""
echo "🎨 Checking Frontend Environment Variables..."
echo ""

FRONTEND_ENV="packages/frontend/.env.production"

if [ ! -f "$FRONTEND_ENV" ]; then
    echo -e "${YELLOW}⚠${NC} Frontend .env.production file not found (will use .env)"
    FRONTEND_ENV="packages/frontend/.env"
    ((WARNINGS++))
fi

if [ -f "$FRONTEND_ENV" ]; then
    check_env_var "VITE_API_URL" "$FRONTEND_ENV"
    check_env_var "VITE_STRIPE_PUBLISHABLE_KEY" "$FRONTEND_ENV"
    check_env_var "VITE_GOOGLE_CLIENT_ID" "$FRONTEND_ENV"

    # Check if using live Stripe keys
    if grep -q "pk_live_" "$FRONTEND_ENV"; then
        echo -e "${GREEN}✓${NC} Using Stripe LIVE publishable key"
    elif grep -q "pk_test_" "$FRONTEND_ENV"; then
        echo -e "${YELLOW}⚠${NC} Using Stripe TEST publishable key (change to pk_live_ for production)"
        ((WARNINGS++))
    fi
fi

echo ""
echo "📦 Checking Dependencies..."
echo ""

cd packages/frontend
if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        echo -e "${GREEN}✓${NC} Frontend dependencies installed"
    else
        echo -e "${RED}✗${NC} Frontend dependencies not installed (run: npm install)"
        ((ERRORS++))
    fi
fi
cd ../..

cd packages/backend
if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        echo -e "${GREEN}✓${NC} Backend dependencies installed"
    else
        echo -e "${RED}✗${NC} Backend dependencies not installed (run: npm install)"
        ((ERRORS++))
    fi
fi
cd ../..

echo ""
echo "🗄️  Checking Database Configuration..."
echo ""

if [ -f "packages/backend/prisma/schema.prisma" ]; then
    echo -e "${GREEN}✓${NC} Prisma schema found"

    # Check if migrations exist
    if [ -d "packages/backend/prisma/migrations" ]; then
        MIGRATION_COUNT=$(find packages/backend/prisma/migrations -type f -name "migration.sql" | wc -l)
        echo -e "${GREEN}✓${NC} $MIGRATION_COUNT migrations found"
    else
        echo -e "${YELLOW}⚠${NC} No migrations found (run: prisma migrate dev)"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}✗${NC} Prisma schema not found"
    ((ERRORS++))
fi

echo ""
echo "🔧 Checking Build Configuration..."
echo ""

# Check if vite.config.ts exists
if [ -f "packages/frontend/vite.config.ts" ]; then
    echo -e "${GREEN}✓${NC} Vite configuration found"
else
    echo -e "${RED}✗${NC} Vite configuration not found"
    ((ERRORS++))
fi

# Check if tsconfig.json exists
if [ -f "packages/frontend/tsconfig.json" ]; then
    echo -e "${GREEN}✓${NC} Frontend TypeScript configuration found"
else
    echo -e "${YELLOW}⚠${NC} Frontend TypeScript configuration not found"
    ((WARNINGS++))
fi

if [ -f "packages/backend/tsconfig.json" ]; then
    echo -e "${GREEN}✓${NC} Backend TypeScript configuration found"
else
    echo -e "${YELLOW}⚠${NC} Backend TypeScript configuration not found"
    ((WARNINGS++))
fi

echo ""
echo "🧪 Running Tests (if available)..."
echo ""

cd packages/frontend
if npm run test:e2e --help >/dev/null 2>&1; then
    echo "Running E2E tests..."
    # Note: Commented out to avoid long test runs during pre-check
    # npm run test:e2e
    echo -e "${YELLOW}⚠${NC} E2E tests available but not run (run manually: npm run test:e2e)"
else
    echo -e "${YELLOW}⚠${NC} No E2E tests configured"
fi
cd ../..

echo ""
echo "=========================================="
echo "📊 Summary"
echo "=========================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "✅ Ready for production deployment!"
    echo ""
    echo "Next steps:"
    echo "1. Review PRODUCTION_DEPLOYMENT_GUIDE.md"
    echo "2. Build production bundles: npm run build"
    echo "3. Deploy to your hosting platform"
    echo "4. Run post-deployment tests"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo ""
    echo "⚠️  You can proceed but address warnings for optimal production setup"
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo ""
    echo "❌ NOT ready for production deployment!"
    echo ""
    echo "Please fix all errors before deploying to production."
    exit 1
fi
