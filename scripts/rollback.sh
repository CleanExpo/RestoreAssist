#!/bin/bash

# Rollback Script for RestoreAssist
# Reverts deployment to previous stable version

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║   RestoreAssist Deployment Rollback                  ║${NC}"
echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Configuration
VERCEL_TOKEN="${VERCEL_TOKEN}"
VERCEL_ORG_ID="${VERCEL_ORG_ID}"
VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID}"
VERCEL_ORG_ID_FRONTEND="${VERCEL_ORG_ID_FRONTEND}"
VERCEL_PROJECT_ID_FRONTEND="${VERCEL_PROJECT_ID_FRONTEND}"

# Check if running in interactive mode
INTERACTIVE=false
if [ -t 0 ]; then
  INTERACTIVE=true
fi

# Function to log messages
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

# Function to confirm action
confirm_action() {
  local message=$1

  if [ "$INTERACTIVE" = true ]; then
    echo -e "${YELLOW}$message${NC}"
    read -p "Continue? (yes/no): " response
    if [ "$response" != "yes" ] && [ "$response" != "y" ]; then
      echo "Rollback cancelled."
      exit 0
    fi
  else
    log_warning "$message (non-interactive mode, proceeding automatically)"
  fi
}

# =============================================================================
# STEP 1: Verify Prerequisites
# =============================================================================
echo -e "${BLUE}=== Step 1: Verify Prerequisites ===${NC}"
echo ""

# Check for Vercel CLI
if ! command -v vercel &> /dev/null; then
  log_error "Vercel CLI not found. Installing..."
  npm install -g vercel
  log_success "Vercel CLI installed"
fi

# Check for required environment variables
if [ -z "$VERCEL_TOKEN" ]; then
  log_warning "VERCEL_TOKEN not set. You may need to authenticate."
  if [ "$INTERACTIVE" = true ]; then
    read -p "Enter Vercel token: " VERCEL_TOKEN
  fi
fi

echo ""

# =============================================================================
# STEP 2: Identify Current Deployment
# =============================================================================
echo -e "${BLUE}=== Step 2: Identify Current Deployment ===${NC}"
echo ""

log_info "Fetching deployment information..."

# Get backend deployments
if [ -n "$VERCEL_PROJECT_ID" ]; then
  log_info "Backend Project ID: $VERCEL_PROJECT_ID"

  # List recent backend deployments
  echo ""
  echo "Recent backend deployments:"
  vercel ls --token="$VERCEL_TOKEN" 2>/dev/null | head -n 10 || log_warning "Could not list backend deployments"
fi

# Get frontend deployments
if [ -n "$VERCEL_PROJECT_ID_FRONTEND" ]; then
  log_info "Frontend Project ID: $VERCEL_PROJECT_ID_FRONTEND"

  # List recent frontend deployments
  echo ""
  echo "Recent frontend deployments:"
  vercel ls --token="$VERCEL_TOKEN" 2>/dev/null | head -n 10 || log_warning "Could not list frontend deployments"
fi

echo ""

# =============================================================================
# STEP 3: Select Rollback Target
# =============================================================================
echo -e "${BLUE}=== Step 3: Select Rollback Target ===${NC}"
echo ""

ROLLBACK_TYPE=""

if [ "$INTERACTIVE" = true ]; then
  echo "Select rollback option:"
  echo "  1) Rollback both backend and frontend to previous deployment"
  echo "  2) Rollback backend only"
  echo "  3) Rollback frontend only"
  echo "  4) Rollback to specific deployment URL"
  echo "  5) Cancel rollback"
  echo ""
  read -p "Enter option (1-5): " option

  case $option in
    1) ROLLBACK_TYPE="both" ;;
    2) ROLLBACK_TYPE="backend" ;;
    3) ROLLBACK_TYPE="frontend" ;;
    4) ROLLBACK_TYPE="specific" ;;
    5) echo "Rollback cancelled."; exit 0 ;;
    *) log_error "Invalid option. Exiting."; exit 1 ;;
  esac
else
  # Default to rolling back both in non-interactive mode
  ROLLBACK_TYPE="both"
  log_info "Non-interactive mode: Rolling back both backend and frontend"
fi

echo ""

# =============================================================================
# STEP 4: Perform Rollback
# =============================================================================
echo -e "${BLUE}=== Step 4: Perform Rollback ===${NC}"
echo ""

confirm_action "⚠️  WARNING: This will rollback your production deployment!"

rollback_backend() {
  log_info "Rolling back backend deployment..."

  if [ -n "$VERCEL_PROJECT_ID" ]; then
    # Get the previous production deployment
    PREV_DEPLOYMENT=$(vercel ls --token="$VERCEL_TOKEN" --prod 2>/dev/null | grep "production" | sed -n '2p' | awk '{print $1}')

    if [ -n "$PREV_DEPLOYMENT" ]; then
      log_info "Previous backend deployment: $PREV_DEPLOYMENT"

      # Promote previous deployment to production
      if vercel promote "$PREV_DEPLOYMENT" --token="$VERCEL_TOKEN" --scope="$VERCEL_ORG_ID" 2>/dev/null; then
        log_success "Backend rolled back successfully to $PREV_DEPLOYMENT"
        return 0
      else
        log_error "Failed to rollback backend"
        return 1
      fi
    else
      log_error "Could not identify previous backend deployment"
      return 1
    fi
  else
    log_warning "Backend project ID not set, skipping backend rollback"
    return 0
  fi
}

rollback_frontend() {
  log_info "Rolling back frontend deployment..."

  if [ -n "$VERCEL_PROJECT_ID_FRONTEND" ]; then
    # Get the previous production deployment
    PREV_DEPLOYMENT=$(vercel ls --token="$VERCEL_TOKEN" --prod 2>/dev/null | grep "production" | sed -n '2p' | awk '{print $1}')

    if [ -n "$PREV_DEPLOYMENT" ]; then
      log_info "Previous frontend deployment: $PREV_DEPLOYMENT"

      # Promote previous deployment to production
      if vercel promote "$PREV_DEPLOYMENT" --token="$VERCEL_TOKEN" --scope="$VERCEL_ORG_ID_FRONTEND" 2>/dev/null; then
        log_success "Frontend rolled back successfully to $PREV_DEPLOYMENT"
        return 0
      else
        log_error "Failed to rollback frontend"
        return 1
      fi
    else
      log_error "Could not identify previous frontend deployment"
      return 1
    fi
  else
    log_warning "Frontend project ID not set, skipping frontend rollback"
    return 0
  fi
}

# Execute rollback based on selection
case $ROLLBACK_TYPE in
  both)
    rollback_backend
    BACKEND_SUCCESS=$?
    rollback_frontend
    FRONTEND_SUCCESS=$?

    if [ $BACKEND_SUCCESS -eq 0 ] && [ $FRONTEND_SUCCESS -eq 0 ]; then
      log_success "Rollback completed successfully"
    else
      log_error "Rollback partially failed"
    fi
    ;;

  backend)
    rollback_backend
    ;;

  frontend)
    rollback_frontend
    ;;

  specific)
    read -p "Enter deployment URL to promote: " DEPLOYMENT_URL
    log_info "Promoting $DEPLOYMENT_URL to production..."
    if vercel promote "$DEPLOYMENT_URL" --token="$VERCEL_TOKEN" 2>/dev/null; then
      log_success "Deployment promoted successfully"
    else
      log_error "Failed to promote deployment"
    fi
    ;;
esac

echo ""

# =============================================================================
# STEP 5: Verify Rollback
# =============================================================================
echo -e "${BLUE}=== Step 5: Verify Rollback ===${NC}"
echo ""

log_info "Waiting for deployment to propagate (30 seconds)..."
sleep 30

BACKEND_URL="${BACKEND_URL:-https://restoreassist.app}"
FRONTEND_URL="${FRONTEND_URL:-https://restoreassist.app}"

# Check backend health
log_info "Checking backend health..."
backend_response=$(curl -s --max-time 10 "$BACKEND_URL/api/health" 2>/dev/null || echo "{}")

if echo "$backend_response" | jq -e '.status' >/dev/null 2>&1; then
  log_success "Backend is responding after rollback"
else
  log_error "Backend health check failed after rollback"
fi

# Check frontend
log_info "Checking frontend..."
frontend_response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL" 2>/dev/null || echo "000")

if [ "$frontend_response" = "200" ]; then
  log_success "Frontend is accessible after rollback"
else
  log_error "Frontend returned HTTP $frontend_response after rollback"
fi

echo ""

# =============================================================================
# STEP 6: Database Rollback (Manual)
# =============================================================================
echo -e "${BLUE}=== Step 6: Database Rollback ===${NC}"
echo ""

log_warning "Database rollback must be performed manually if needed"
echo ""
echo "If database migrations were applied:"
echo "  1. Identify which migrations were applied"
echo "  2. Run: cd packages/backend && npx prisma migrate rollback"
echo "  3. Verify database schema matches rolled-back code"
echo ""
echo "Common rollback scenarios:"
echo "  • Added new column → Run migration to remove it"
echo "  • Modified table → Restore previous schema"
echo "  • Seeded data → Remove test data manually"
echo ""

if [ "$INTERACTIVE" = true ]; then
  read -p "Have you addressed database changes? (yes/no): " db_response
  if [ "$db_response" != "yes" ] && [ "$db_response" != "y" ]; then
    log_warning "Remember to handle database changes manually"
  fi
fi

echo ""

# =============================================================================
# FINAL SUMMARY
# =============================================================================
echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║   Rollback Summary                                   ║${NC}"
echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

log_success "Rollback procedure completed"
echo ""
echo "Next steps:"
echo "  1. Verify application functionality"
echo "  2. Run post-deployment verification:"
echo "     bash scripts/post-deploy-verification.sh"
echo "  3. Check application logs for errors"
echo "  4. Investigate root cause of deployment issue"
echo "  5. Fix issues before next deployment"
echo ""
echo "Monitoring:"
echo "  • Backend logs: vercel logs <deployment-url>"
echo "  • Frontend logs: vercel logs <deployment-url>"
echo "  • Sentry: Check for error reports"
echo "  • Stripe webhooks: Verify webhook delivery"
echo ""

exit 0
