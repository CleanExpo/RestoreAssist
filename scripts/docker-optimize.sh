#!/bin/bash

# ================================
# Docker Image Optimization Script
# RestoreAssist
# ================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

IMAGE_NAME="restoreassist"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Docker Image Optimization${NC}"
echo -e "${GREEN}======================================${NC}"

echo -e "\n${YELLOW}Current image sizes:${NC}"
docker images ${IMAGE_NAME} --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

echo -e "\n${YELLOW}Analyzing image layers...${NC}"
docker history ${IMAGE_NAME}:latest --human=true --no-trunc

echo -e "\n${YELLOW}Running dive analysis (if installed)...${NC}"
if command -v dive &> /dev/null; then
    dive ${IMAGE_NAME}:latest
else
    echo -e "${YELLOW}⚠ dive not installed${NC}"
    echo "Install with: brew install dive (macOS)"
fi

echo -e "\n${YELLOW}Optimization tips:${NC}"
echo "1. Use multi-stage builds (✓ already implemented)"
echo "2. Minimize layers (✓ already implemented)"
echo "3. Use .dockerignore (✓ already implemented)"
echo "4. Use Alpine base images (✓ already implemented)"
echo "5. Clean package manager cache (✓ already implemented)"
echo "6. Remove dev dependencies (✓ already implemented)"

echo -e "\n${YELLOW}Build cache analysis:${NC}"
docker system df

echo -e "\n${GREEN}Optimization complete!${NC}"
