# ================================
# RestoreAssist Docker Management
# ================================
# Makefile for common Docker operations

.PHONY: help build up down restart logs ps clean test dev prod

# Default target
help:
	@echo "RestoreAssist Docker Commands"
	@echo "=============================="
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment"
	@echo "  make dev-build    - Build and start dev environment"
	@echo "  make dev-down     - Stop development environment"
	@echo "  make dev-logs     - View development logs"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start production environment"
	@echo "  make prod-build   - Build and start production"
	@echo "  make prod-down    - Stop production environment"
	@echo "  make prod-logs    - View production logs"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate   - Run database migrations"
	@echo "  make db-studio    - Open Prisma Studio"
	@echo "  make db-reset     - Reset database (WARNING: deletes data)"
	@echo "  make db-seed      - Seed database with test data"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run test suite"
	@echo "  make test-docker  - Test Docker build locally"
	@echo "  make health       - Check application health"
	@echo ""
	@echo "Maintenance:"
	@echo "  make logs         - View all container logs"
	@echo "  make ps           - List running containers"
	@echo "  make clean        - Remove containers and volumes"
	@echo "  make clean-all    - Remove everything including images"
	@echo "  make restart      - Restart all services"
	@echo ""

# ================================
# Development Commands
# ================================
dev:
	docker-compose up -d
	@echo "Development environment started at http://localhost:3001"

dev-build:
	docker-compose up -d --build
	@echo "Development environment built and started"

dev-down:
	docker-compose down

dev-logs:
	docker-compose logs -f app

# ================================
# Production Commands
# ================================
prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo "Production environment started"

prod-build:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
	@echo "Production environment built and started"

prod-down:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

prod-logs:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app

# ================================
# Database Commands
# ================================
db-migrate:
	docker-compose exec app npx prisma migrate deploy

db-studio:
	@echo "Opening Prisma Studio at http://localhost:5555"
	docker-compose exec app npx prisma studio --browser none

db-reset:
	@echo "WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose exec app npx prisma migrate reset --force; \
	fi

db-seed:
	docker-compose exec app npm run db:seed

# ================================
# Testing Commands
# ================================
test:
	docker-compose exec app npm test

test-docker:
	docker build -t restoreassist:test .
	@echo "Docker build successful"

health:
	@curl -s http://localhost:3001/api/health | jq '.'

# ================================
# Maintenance Commands
# ================================
logs:
	docker-compose logs -f

ps:
	docker-compose ps

restart:
	docker-compose restart

clean:
	docker-compose down -v
	@echo "Containers and volumes removed"

clean-all:
	docker-compose down -v --rmi all
	@echo "Everything cleaned including images"

# ================================
# Build Commands
# ================================
build:
	docker-compose build --no-cache

build-prod:
	docker build -t restoreassist:latest --target runner .

# ================================
# Quick Commands
# ================================
up: dev

down: dev-down

shell:
	docker-compose exec app sh

shell-db:
	docker-compose exec postgres psql -U postgres -d restoreassist

# ================================
# Docker Image Management
# ================================
prune:
	docker system prune -af --volumes
	@echo "Docker system pruned"

size:
	@docker images restoreassist --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
