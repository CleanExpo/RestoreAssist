#!/bin/bash

# ================================
# Docker Build and Test Script
# RestoreAssist
# ================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="restoreassist"
IMAGE_TAG="test"
CONTAINER_NAME="restoreassist-test"
DB_CONTAINER_NAME="restoreassist-test-db"
NETWORK_NAME="restoreassist-test-network"
TEST_PORT=3002

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}RestoreAssist Docker Build Test${NC}"
echo -e "${GREEN}======================================${NC}"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up test environment...${NC}"
    docker stop $CONTAINER_NAME $DB_CONTAINER_NAME 2>/dev/null || true
    docker rm $CONTAINER_NAME $DB_CONTAINER_NAME 2>/dev/null || true
    docker network rm $NETWORK_NAME 2>/dev/null || true
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT

echo -e "\n${YELLOW}Step 1: Building Docker image...${NC}"
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} . || {
    echo -e "${RED}✗ Docker build failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Docker image built successfully${NC}"

echo -e "\n${YELLOW}Step 2: Checking image size...${NC}"
IMAGE_SIZE=$(docker images ${IMAGE_NAME}:${IMAGE_TAG} --format "{{.Size}}")
echo -e "Image size: ${GREEN}${IMAGE_SIZE}${NC}"

echo -e "\n${YELLOW}Step 3: Creating test network...${NC}"
docker network create $NETWORK_NAME || {
    echo -e "${RED}✗ Failed to create network${NC}"
    exit 1
}
echo -e "${GREEN}✓ Network created${NC}"

echo -e "\n${YELLOW}Step 4: Starting PostgreSQL container...${NC}"
docker run -d \
    --name $DB_CONTAINER_NAME \
    --network $NETWORK_NAME \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=test_password \
    -e POSTGRES_DB=restoreassist_test \
    postgres:16-alpine || {
    echo -e "${RED}✗ Failed to start PostgreSQL${NC}"
    exit 1
}
echo -e "${GREEN}✓ PostgreSQL started${NC}"

echo -e "\n${YELLOW}Step 5: Waiting for PostgreSQL to be ready...${NC}"
timeout 30 sh -c 'until docker exec '$DB_CONTAINER_NAME' pg_isready -U postgres; do sleep 1; done' || {
    echo -e "${RED}✗ PostgreSQL not ready${NC}"
    docker logs $DB_CONTAINER_NAME
    exit 1
}
echo -e "${GREEN}✓ PostgreSQL ready${NC}"

echo -e "\n${YELLOW}Step 6: Starting application container...${NC}"
docker run -d \
    --name $CONTAINER_NAME \
    --network $NETWORK_NAME \
    -e NODE_ENV=production \
    -e PORT=3001 \
    -e DATABASE_URL="postgresql://postgres:test_password@${DB_CONTAINER_NAME}:5432/restoreassist_test?schema=public" \
    -e DIRECT_URL="postgresql://postgres:test_password@${DB_CONTAINER_NAME}:5432/restoreassist_test?schema=public" \
    -e NEXTAUTH_SECRET="test-secret-minimum-32-characters-long-for-testing" \
    -e JWT_SECRET="test-jwt-secret-for-testing" \
    -e JWT_REFRESH_SECRET="test-refresh-secret-for-testing" \
    -e RUN_MIGRATIONS=true \
    -p ${TEST_PORT}:3001 \
    ${IMAGE_NAME}:${IMAGE_TAG} || {
    echo -e "${RED}✗ Failed to start application${NC}"
    exit 1
}
echo -e "${GREEN}✓ Application container started${NC}"

echo -e "\n${YELLOW}Step 7: Waiting for application to be ready...${NC}"
MAX_ATTEMPTS=45
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:${TEST_PORT}/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Application is ready!${NC}"
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    echo -n "."
    sleep 2

    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo -e "\n${RED}✗ Application failed to start within timeout${NC}"
        echo -e "\n${YELLOW}Application logs:${NC}"
        docker logs $CONTAINER_NAME
        exit 1
    fi
done

echo -e "\n${YELLOW}Step 8: Testing health endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s http://localhost:${TEST_PORT}/api/health)
echo -e "Health response: ${GREEN}${HEALTH_RESPONSE}${NC}"

# Validate health response
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 9: Testing database connectivity...${NC}"
if echo "$HEALTH_RESPONSE" | grep -q '"database":"connected"'; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 10: Checking container resource usage...${NC}"
docker stats --no-stream $CONTAINER_NAME

echo -e "\n${YELLOW}Step 11: Running security scan (optional)...${NC}"
if command -v trivy &> /dev/null; then
    trivy image --severity HIGH,CRITICAL ${IMAGE_NAME}:${IMAGE_TAG}
else
    echo -e "${YELLOW}⚠ Trivy not installed, skipping security scan${NC}"
    echo -e "  Install with: brew install trivy (macOS) or apt install trivy (Ubuntu)"
fi

echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}All tests passed successfully!${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "\nImage: ${IMAGE_NAME}:${IMAGE_TAG}"
echo -e "Size: ${IMAGE_SIZE}"
echo -e "Test URL: http://localhost:${TEST_PORT}"
echo -e "\nContainer will be cleaned up automatically."
echo -e "Press Enter to cleanup and exit, or Ctrl+C to keep running for manual testing..."
read

# Cleanup will happen automatically via trap
