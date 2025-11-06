#!/bin/bash

# ================================
# RestoreAssist Docker Quick Start Script
# ================================
# This script helps you get started with Docker deployment

set -e

echo "================================"
echo "RestoreAssist Docker Setup"
echo "================================"
echo

# Check if Docker is running
if ! docker version &> /dev/null; then
    echo "ERROR: Docker is not running!"
    echo "Please start Docker and try again."
    exit 1
fi

echo "[1/5] Docker is running..."
echo

# Check if .env.docker.local exists
if [ ! -f .env.docker.local ]; then
    echo "[2/5] Creating .env.docker.local from template..."
    cp .env.docker .env.docker.local
    echo
    echo "================================"
    echo "IMPORTANT: Configuration Required"
    echo "================================"
    echo "Please edit .env.docker.local and set:"
    echo "  - POSTGRES_PASSWORD"
    echo "  - NEXTAUTH_SECRET"
    echo "  - JWT_SECRET"
    echo "  - JWT_REFRESH_SECRET"
    echo "  - ANTHROPIC_API_KEY or OPENAI_API_KEY"
    echo
    echo "Generate secrets with: openssl rand -base64 32"
    echo
    echo "Opening editor..."
    ${EDITOR:-nano} .env.docker.local
else
    echo "[2/5] Configuration file exists..."
fi
echo

# Build Docker images
echo "[3/5] Building Docker images (this may take a few minutes)..."
npm run docker:build
echo

# Start services
echo "[4/5] Starting services..."
npm run docker:up
echo

# Wait for services to be healthy
echo "[5/5] Waiting for services to be ready..."
sleep 10

# Check health endpoint
echo "Checking application health..."
if curl -f http://localhost:3001/api/health &> /dev/null; then
    echo
    echo "================================"
    echo "SUCCESS! RestoreAssist is running"
    echo "================================"
    echo
    echo "Application: http://localhost:3001"
    echo "Health Check: http://localhost:3001/api/health"
    echo
    echo "View logs: npm run docker:logs"
    echo "Stop services: npm run docker:down"
    echo
else
    echo
    echo "Services are starting..."
    echo "Check status with: npm run docker:logs"
    echo "Health check: curl http://localhost:3001/api/health"
    echo
fi

echo "Opening application in browser..."
sleep 2

# Try to open browser based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:3001
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:3001
fi
