#!/bin/bash
# ============================================================
# URGENT: Redeploy Backend to Fix CORS Production Issue
# ============================================================
# This script redeploys the backend with CORS fixes to Vercel
# Time to complete: 5 minutes
# ============================================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo " VERCEL BACKEND EMERGENCY REDEPLOY"
echo "========================================"
echo ""
echo "This will:"
echo " 1. Build backend with TypeScript"
echo " 2. Deploy to Vercel production"
echo " 3. Test CORS configuration"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Check if we're in the right directory
if [ ! -f "packages/backend/src/index.ts" ]; then
    echo -e "${RED}ERROR: Cannot find packages/backend/src/index.ts${NC}"
    echo "Make sure you're running this from the RestoreAssist root directory"
    exit 1
fi

echo ""
echo "[1/5] Checking Vercel CLI..."
echo "========================================"
if ! command -v vercel &> /dev/null; then
    echo "Vercel CLI not found. Installing..."
    npm install -g vercel
    if [ $? -ne 0 ]; then
        echo -e "${RED}ERROR: Failed to install Vercel CLI${NC}"
        echo "Please run: npm install -g vercel"
        exit 1
    fi
fi
echo -e "${GREEN}✓${NC} Vercel CLI found"

echo ""
echo "[2/5] Building backend..."
echo "========================================"
cd packages/backend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm ci || npm install
fi

# Build TypeScript
echo "Building TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Build failed${NC}"
    echo "Check the TypeScript errors above"
    cd ../..
    exit 1
fi

if [ ! -f "dist/index.js" ]; then
    echo -e "${RED}ERROR: dist/index.js not created${NC}"
    cd ../..
    exit 1
fi

echo -e "${GREEN}✓${NC} Build successful (dist/index.js created)"

echo ""
echo "[3/5] Deploying to Vercel..."
echo "========================================"
echo ""
echo "IMPORTANT: If prompted to login, follow the instructions"
echo ""
sleep 2

# Deploy to production
vercel --prod --yes
if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Deployment failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo " 1. Run: vercel login"
    echo " 2. Ensure you have access to the project"
    echo " 3. Check Vercel dashboard for errors"
    cd ../..
    exit 1
fi

echo -e "${GREEN}✓${NC} Deployment complete"

echo ""
echo "[4/5] Getting deployment URL..."
echo "========================================"

# Try to get the production URL
vercel ls --prod 2>&1 | grep "restore-assist-backend" || true

echo ""
echo "The backend should now be deployed to:"
echo " https://restore-assist-backend.vercel.app"
echo ""

echo ""
echo "[5/5] Testing deployment..."
echo "========================================"

# Wait for deployment to be ready
echo "Waiting 10 seconds for deployment to stabilize..."
sleep 10

# Test health endpoint
echo ""
echo "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -k -s "https://restore-assist-backend.vercel.app/api/health" 2>&1)
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✓${NC} Health check passed"
    echo "$HEALTH_RESPONSE"
else
    echo -e "${YELLOW}WARNING: Health check returned unexpected response${NC}"
    echo "$HEALTH_RESPONSE"
fi

echo ""
echo "Testing CORS configuration..."
curl -k -I -X OPTIONS "https://restore-assist-backend.vercel.app/api/auth/config" \
  -H "Origin: https://restoreassist.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" 2>&1 | grep -i "Access-Control"

cd ../..

echo ""
echo "========================================"
echo " DEPLOYMENT COMPLETE"
echo "========================================"
echo ""
echo "Next steps:"
echo " 1. Open: https://restoreassist.app"
echo " 2. Open browser console (F12)"
echo " 3. Refresh the page"
echo " 4. Check for CORS errors (should be GONE)"
echo " 5. Try clicking Google OAuth button"
echo ""
echo "If CORS errors persist:"
echo " 1. Go to Vercel Dashboard"
echo " 2. Go to restore-assist-backend project"
echo " 3. Settings -> Environment Variables"
echo " 4. Add/Update: ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app"
echo " 5. Click 'Redeploy' in Vercel dashboard"
echo ""
echo "Deployment URL: https://restore-assist-backend.vercel.app"
echo ""
