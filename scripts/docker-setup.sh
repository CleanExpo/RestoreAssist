#!/bin/bash

# Docker setup and management script for RestoreAssist
# Usage: ./scripts/docker-setup.sh <command>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default environment
ENV_FILE=".env.local"

# Print colored output
print_info() {
  echo -e "${GREEN}▸ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

# Display usage
show_usage() {
  cat << EOF
RestoreAssist Docker Management

Usage: ./scripts/docker-setup.sh <command>

Commands:
  dev-start       Start development environment with database
  dev-stop        Stop development environment
  dev-logs        Show live logs from development containers
  prod-build      Build production image
  prod-run        Run production container
  db-seed         Seed database with initial data
  db-reset        Reset database (delete data, recreate schema)
  db-shell        Open database shell (psql)
  db-backup       Backup database to file
  test            Run tests in Docker
  clean           Remove all containers, volumes, and images
  health          Check application health
  help            Show this help message

Environment:
  - Development: Uses docker-compose with local PostgreSQL
  - Production: Uses multi-stage Dockerfile with external database

Examples:
  ./scripts/docker-setup.sh dev-start
  ./scripts/docker-setup.sh db-seed
  ./scripts/docker-setup.sh prod-build
EOF
}

# Start development environment
dev_start() {
  print_info "Starting development environment..."
  docker-compose --profile dev up -d

  # Wait for services to be healthy
  print_info "Waiting for services to be healthy..."
  sleep 5

  # Run migrations
  print_info "Running database migrations..."
  docker-compose exec -T app npx prisma migrate deploy

  print_info "Development environment ready!"
  print_info "Access application at: http://localhost:3000"
  print_info "View logs with: ./scripts/docker-setup.sh dev-logs"
}

# Stop development environment
dev_stop() {
  print_info "Stopping development environment..."
  docker-compose --profile dev down
  print_info "Development environment stopped"
}

# Show development logs
dev_logs() {
  print_info "Showing live logs (Ctrl+C to exit)..."
  docker-compose --profile dev logs -f
}

# Build production image
prod_build() {
  print_info "Building production image..."
  docker build -t restoreassist:latest -t restoreassist:$(date +%Y%m%d-%H%M%S) .
  print_info "Production image built successfully"
}

# Run production container
prod_run() {
  if [ ! -f "$ENV_FILE" ]; then
    print_error "Environment file not found: $ENV_FILE"
    print_warning "Please create $ENV_FILE with required environment variables"
    exit 1
  fi

  print_info "Running production container..."
  docker run -d \
    --name restoreassist-prod \
    --env-file "$ENV_FILE" \
    -p 3000:3000 \
    --restart unless-stopped \
    restoreassist:latest

  print_info "Production container started"
  print_info "Access application at: http://localhost:3000"
}

# Seed database
db_seed() {
  print_info "Seeding database..."
  docker-compose --profile dev exec -T app npm run db:seed
  print_info "Database seeded"
}

# Reset database
db_reset() {
  print_warning "This will delete all data and recreate the schema"
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Resetting database..."
    docker-compose --profile dev exec -T app npx prisma migrate reset --force
    print_info "Database reset complete"
  else
    print_info "Database reset cancelled"
  fi
}

# Open database shell
db_shell() {
  print_info "Opening database shell (type \\q to exit)..."
  docker-compose --profile dev exec postgres psql -U dev -d restoreassist
}

# Backup database
db_backup() {
  BACKUP_FILE="backups/restoreassist-$(date +%Y%m%d-%H%M%S).sql"
  mkdir -p backups

  print_info "Backing up database to: $BACKUP_FILE"
  docker-compose --profile dev exec -T postgres pg_dump -U dev restoreassist > "$BACKUP_FILE"
  print_info "Database backed up successfully"
}

# Run tests
run_tests() {
  print_info "Running tests in Docker..."
  docker-compose --profile dev exec -T app npm test
}

# Clean up
clean_all() {
  print_warning "This will remove all containers, volumes, and images"
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Cleaning up Docker resources..."
    docker-compose --profile dev --profile prod down -v
    docker rmi restoreassist:latest 2>/dev/null || true
    print_info "Cleanup complete"
  else
    print_info "Cleanup cancelled"
  fi
}

# Health check
health_check() {
  print_info "Checking application health..."
  if curl -s http://localhost:3000/api/health | grep -q "healthy"; then
    print_info "Application is healthy"
  else
    print_error "Application is not responding"
  fi
}

# Main command routing
case "${1:-help}" in
  dev-start)
    dev_start
    ;;
  dev-stop)
    dev_stop
    ;;
  dev-logs)
    dev_logs
    ;;
  prod-build)
    prod_build
    ;;
  prod-run)
    prod_run
    ;;
  db-seed)
    db_seed
    ;;
  db-reset)
    db_reset
    ;;
  db-shell)
    db_shell
    ;;
  db-backup)
    db_backup
    ;;
  test)
    run_tests
    ;;
  clean)
    clean_all
    ;;
  health)
    health_check
    ;;
  help|--help|-h)
    show_usage
    ;;
  *)
    print_error "Unknown command: $1"
    show_usage
    exit 1
    ;;
esac
