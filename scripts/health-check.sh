#!/bin/bash

# Health Check Script for RestoreAssist Deployment
# Tests critical endpoints after deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-https://restoreassist.app}"
FRONTEND_URL="${FRONTEND_URL:-https://restoreassist.app}"
TIMEOUT=10

echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   RestoreAssist Deployment Health Check             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check HTTP endpoint
check_endpoint() {
  local url=$1
  local expected_status=$2
  local description=$3

  echo -n "Checking $description... "

  response=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$url" 2>/dev/null || echo "000")

  if [ "$response" = "$expected_status" ]; then
    echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
    return 0
  elif [ "$response" = "000" ]; then
    echo -e "${RED}✗ FAILED${NC} (Connection timeout)"
    return 1
  else
    echo -e "${YELLOW}⚠ WARNING${NC} (HTTP $response, expected $expected_status)"
    return 1
  fi
}

# Function to check JSON response
check_json_endpoint() {
  local url=$1
  local description=$2

  echo -n "Checking $description... "

  response=$(curl -s --max-time $TIMEOUT "$url" 2>/dev/null || echo "{}")

  if echo "$response" | jq -e . >/dev/null 2>&1; then
    echo -e "${GREEN}✓ OK${NC}"
    echo "  Response: $(echo $response | jq -c .)"
    return 0
  else
    echo -e "${RED}✗ FAILED${NC} (Invalid JSON)"
    echo "  Response: $response"
    return 1
  fi
}

# Track failures
FAILED_CHECKS=0

echo -e "${BLUE}=== Backend Health Checks ===${NC}"
echo ""

# Backend Health Endpoint
if check_json_endpoint "$BACKEND_URL/api/health" "Backend health endpoint"; then
  :
else
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# CORS Test Endpoint
if check_json_endpoint "$BACKEND_URL/api/cors-test" "CORS configuration"; then
  :
else
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# Auth Endpoints (expect 401 unauthorized, which means endpoint works)
if check_endpoint "$BACKEND_URL/api/auth/me" "401" "Auth endpoint"; then
  :
else
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# Stripe Webhook Endpoint (expect 400 or 405, means endpoint exists)
echo -n "Checking Stripe webhook endpoint... "
response=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$BACKEND_URL/api/stripe/webhook" 2>/dev/null || echo "000")
if [ "$response" = "400" ] || [ "$response" = "405" ] || [ "$response" = "200" ]; then
  echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
else
  echo -e "${YELLOW}⚠ WARNING${NC} (HTTP $response)"
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo -e "${BLUE}=== Frontend Health Checks ===${NC}"
echo ""

# Frontend Root
if check_endpoint "$FRONTEND_URL" "200" "Frontend application"; then
  :
else
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# Frontend Assets
if check_endpoint "$FRONTEND_URL/assets/index.js" "200" "Frontend JavaScript bundle" 2>/dev/null ||
   check_endpoint "$FRONTEND_URL/assets/js/index-*.js" "200" "Frontend JavaScript bundle"; then
  :
else
  echo -e "${YELLOW}⚠ WARNING${NC} - Could not verify JavaScript bundle (may use hash in filename)"
fi

echo ""
echo -e "${BLUE}=== SSL Certificate Checks ===${NC}"
echo ""

# SSL Certificate Check
echo -n "Checking SSL certificate... "
cert_info=$(echo | openssl s_client -servername restoreassist.app -connect restoreassist.app:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")

if [ -n "$cert_info" ]; then
  echo -e "${GREEN}✓ OK${NC}"
  echo "  $cert_info"
else
  echo -e "${RED}✗ FAILED${NC}"
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo -e "${BLUE}=== DNS Configuration Checks ===${NC}"
echo ""

# DNS Resolution
echo -n "Checking DNS resolution... "
dns_result=$(dig +short restoreassist.app A | head -n 1)
if [ -n "$dns_result" ]; then
  echo -e "${GREEN}✓ OK${NC}"
  echo "  A record: $dns_result"
else
  echo -e "${RED}✗ FAILED${NC}"
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo -e "${BLUE}=== Summary ===${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
  echo -e "${GREEN}✓ All health checks passed!${NC}"
  echo ""
  echo "Deployment appears healthy and ready for production traffic."
  exit 0
else
  echo -e "${RED}✗ $FAILED_CHECKS health check(s) failed${NC}"
  echo ""
  echo "Please review the failed checks above and investigate issues."
  echo ""
  echo "Common issues:"
  echo "  - Environment variables not configured in Vercel"
  echo "  - Build artifacts not deployed correctly"
  echo "  - DNS propagation still in progress"
  echo "  - SSL certificate provisioning incomplete"
  exit 1
fi
