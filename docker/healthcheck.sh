#!/bin/sh
# ============================================
# Docker Health Check Script
# Comprehensive health verification
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_success() {
    echo "${GREEN}✅ $1${NC}"
}

print_error() {
    echo "${RED}❌ $1${NC}"
}

print_warning() {
    echo "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo "ℹ️  $1"
}

echo "============================================"
echo "RestoreAssist Health Check"
echo "============================================"
echo ""

# Check Docker
if ! docker info > /dev/null 2>&1; then
    print_error "Docker daemon is not running"
    exit 1
fi
print_success "Docker daemon is running"

# Check containers
print_info "Checking containers..."

BACKEND_STATUS=$(docker inspect -f '{{.State.Status}}' restoreassist-backend 2>/dev/null || echo "not found")
FRONTEND_STATUS=$(docker inspect -f '{{.State.Status}}' restoreassist-frontend 2>/dev/null || echo "not found")
POSTGRES_STATUS=$(docker inspect -f '{{.State.Status}}' restoreassist-postgres 2>/dev/null || echo "not found")

if [ "$BACKEND_STATUS" = "running" ]; then
    print_success "Backend container is running"
else
    print_error "Backend container: $BACKEND_STATUS"
fi

if [ "$FRONTEND_STATUS" = "running" ]; then
    print_success "Frontend container is running"
else
    print_warning "Frontend container: $FRONTEND_STATUS (may be in dev mode)"
fi

if [ "$POSTGRES_STATUS" = "running" ]; then
    print_success "PostgreSQL container is running"
else
    print_error "PostgreSQL container: $POSTGRES_STATUS"
fi

# Check health endpoints
print_info "Checking health endpoints..."

if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    print_success "Backend API is healthy"
else
    print_error "Backend API is not responding"
fi

if curl -f http://localhost:5173 > /dev/null 2>&1; then
    print_success "Frontend is healthy (dev mode)"
elif curl -f http://localhost > /dev/null 2>&1; then
    print_success "Frontend is healthy (production mode)"
else
    print_warning "Frontend is not responding (may not be started)"
fi

# Check database connection
print_info "Checking database connection..."

if docker exec restoreassist-postgres pg_isready -U restoreassist > /dev/null 2>&1; then
    print_success "Database is accepting connections"
else
    print_error "Database is not accepting connections"
fi

# Check disk space
print_info "Checking disk space..."

DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    print_success "Disk space: ${DISK_USAGE}% used"
elif [ "$DISK_USAGE" -lt 90 ]; then
    print_warning "Disk space: ${DISK_USAGE}% used (warning threshold)"
else
    print_error "Disk space: ${DISK_USAGE}% used (critical threshold)"
fi

# Check memory usage
print_info "Checking container memory usage..."

docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}" | grep restoreassist || print_warning "No containers running"

echo ""
echo "============================================"
echo "Health Check Complete"
echo "============================================"
