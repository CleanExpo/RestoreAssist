# Docker Deployment Guide

Complete guide for deploying RestoreAssist using Docker in development and production environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Configuration](#configuration)
- [Docker Images](#docker-images)
- [Networking](#networking)
- [Volumes & Data Persistence](#volumes--data-persistence)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

## Quick Start

### Development

```bash
# 1. Copy environment file
cp .env.docker .env.docker.local

# 2. Update with your values
# Edit .env.docker.local with your API keys and secrets

# 3. Start development environment
make dev

# 4. Access application
# http://localhost:3001
```

### Production

```bash
# 1. Set up environment
cp .env.docker .env.production.local

# 2. Build and start
make prod-build

# 3. Check health
make health
```

## Prerequisites

- Docker 24.0+ with BuildKit enabled
- Docker Compose 2.20+
- Make (optional, for convenience commands)
- 4GB RAM minimum (8GB recommended)
- 20GB free disk space

## Development Setup

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Using Makefile

```bash
# Start development environment
make dev

# Build and start (after code changes)
make dev-build

# View logs
make dev-logs

# Stop environment
make dev-down
```

### Services Included

- **app**: Next.js application (port 3001)
- **postgres**: PostgreSQL 16 (port 5432)
- **redis**: Redis 7 cache (port 6379)
- **prisma-studio**: Database admin UI (port 5555)

### Development Features

- Hot reload enabled
- Prisma Studio for database management
- Redis for session storage
- Volume mounts for live code updates

## Production Deployment

### Architecture

```
Internet → Nginx (80/443) → Next.js App (3001) → PostgreSQL (5432)
                                                 ↓
                                               Redis (6379)
```

### Deployment Steps

#### 1. Prepare Environment

```bash
# Create production environment file
cp .env.docker .env.production

# Edit with production values
nano .env.production
```

**Required variables:**
- `POSTGRES_PASSWORD`: Strong database password
- `REDIS_PASSWORD`: Strong Redis password
- `NEXTAUTH_SECRET`: Random 32+ character string
- `JWT_SECRET`: Random 32+ character string
- `DATABASE_URL`: Production database connection
- All API keys (Anthropic, Stripe, etc.)

#### 2. Set Up Secrets (Recommended)

```bash
# Create secrets directory
mkdir -p secrets

# Store sensitive values
echo "your-db-password" > secrets/db_password.txt
echo "your-jwt-secret" > secrets/jwt_secret.txt
echo "your-nextauth-secret" > secrets/nextauth_secret.txt
echo "sk-ant-your-key" > secrets/anthropic_api_key.txt
echo "sk_live_stripe" > secrets/stripe_secret_key.txt

# Secure permissions
chmod 600 secrets/*
```

#### 3. SSL/TLS Certificates

```bash
# Place SSL certificates
mkdir -p docker/nginx/ssl
cp /path/to/fullchain.pem docker/nginx/ssl/
cp /path/to/privkey.pem docker/nginx/ssl/
```

Or use Let's Encrypt:

```bash
# Using Certbot
docker run -it --rm \
  -v $(pwd)/docker/nginx/ssl:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d restoreassist.app -d www.restoreassist.app
```

#### 4. Deploy

```bash
# Build production images
make prod-build

# Start services
make prod

# Check health
make health

# View logs
make prod-logs
```

#### 5. Database Migration

```bash
# Run migrations
make db-migrate

# Verify
docker-compose exec app npx prisma db pull
```

## Configuration

### Environment Variables

#### Application (.env.docker)

```bash
# Core
NODE_ENV=production
PORT=3001

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/restoreassist
DIRECT_URL=postgresql://user:pass@postgres:5432/restoreassist

# Authentication
NEXTAUTH_URL=https://restoreassist.app
NEXTAUTH_SECRET=<random-32-chars>
JWT_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>

# External APIs
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_live_...
GOOGLE_CLIENT_ID=...
```

### Docker Compose Override

Create `docker-compose.override.yml` for local customizations:

```yaml
version: '3.9'

services:
  app:
    environment:
      - DEBUG=true
    ports:
      - "3001:3001"
```

## Docker Images

### Build Information

- **Base Image**: `node:20-alpine`
- **Multi-stage build**: 3 stages (deps, builder, runner)
- **Size**: ~200MB (optimized)
- **Architecture**: linux/amd64

### Build Process

```bash
# Development build
docker-compose build

# Production build (optimized)
docker build -t restoreassist:latest --target runner .

# Multi-platform build
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t restoreassist:latest .
```

### Image Layers

1. **deps**: Install production dependencies only
2. **builder**: Build Next.js application with standalone output
3. **runner**: Minimal runtime with only necessary files

### Optimizations

- Standalone output mode (Next.js)
- Multi-stage builds
- Layer caching
- Minimal base image (Alpine)
- No dev dependencies
- .dockerignore optimization

## Networking

### Network Configuration

- **Bridge Network**: `restoreassist-network`
- Internal communication between services
- Only exposed ports accessible from host

### Port Mapping

| Service | Internal | External | Description |
|---------|----------|----------|-------------|
| app | 3001 | 3001 | Next.js application |
| postgres | 5432 | 5432* | PostgreSQL database |
| redis | 6379 | 6379* | Redis cache |
| nginx | 80,443 | 80,443 | Reverse proxy |

*Only exposed in development

### Production Security

In production:
- Database ports bound to `127.0.0.1` only
- Redis ports bound to `127.0.0.1` only
- All traffic routed through Nginx
- Internal network for service communication

## Volumes & Data Persistence

### Volume Types

```yaml
volumes:
  postgres_data:        # Database files
  redis_data:          # Redis persistence
  app_uploads:         # User uploads (if not using S3)
  nginx_cache:         # Nginx cache
  nginx_logs:          # Nginx logs
```

### Backup

```bash
# Backup database
docker-compose exec postgres pg_dump -U postgres restoreassist > backup.sql

# Backup volumes
docker run --rm \
  -v restoreassist_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data

# Restore
docker run --rm \
  -v restoreassist_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/postgres-backup.tar.gz -C /
```

## Health Checks

### Application Health

```bash
# Check via API
curl http://localhost:3001/api/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345,
  "database": "connected",
  "version": "0.1.0"
}
```

### Container Health

```bash
# Check all services
docker-compose ps

# View health status
make ps

# Monitor health
watch -n 5 'docker-compose ps'
```

### Healthcheck Configuration

Each service has built-in healthchecks:

- **App**: HTTP check on `/api/health`
- **PostgreSQL**: `pg_isready`
- **Redis**: `redis-cli ping`
- **Nginx**: HTTP check on `/health`

## Troubleshooting

### Common Issues

#### 1. Container Won't Start

```bash
# Check logs
docker-compose logs app

# Common causes:
# - Missing environment variables
# - Database connection issues
# - Port conflicts
```

#### 2. Database Connection Failed

```bash
# Verify database is healthy
docker-compose ps postgres

# Test connection
docker-compose exec app npx prisma db pull

# Check DATABASE_URL format
echo $DATABASE_URL
```

#### 3. Build Failures

```bash
# Clear build cache
docker-compose build --no-cache

# Check .dockerignore
cat .dockerignore

# Verify Dockerfile
docker build -t test .
```

#### 4. Performance Issues

```bash
# Check resource usage
docker stats

# Increase resources in docker-compose.prod.yml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Debug Mode

```bash
# Enable debug logs
export DEBUG=true
docker-compose up

# Shell into container
make shell

# View environment
docker-compose exec app env
```

## Advanced Usage

### Custom Build Args

```bash
docker build \
  --build-arg NODE_ENV=production \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  -t restoreassist:custom .
```

### Multi-Environment Setup

```bash
# Staging
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
```

### CI/CD Integration

GitHub Actions workflow included:
- Automatic builds on push to main
- Push to GitHub Container Registry
- Vulnerability scanning with Trivy
- Automated testing

```bash
# Manual trigger
gh workflow run docker-build.yml
```

### Scaling

```bash
# Scale app instances
docker-compose up -d --scale app=3

# With load balancer
# See docker-compose.prod.yml nginx configuration
```

### Monitoring

```bash
# Resource usage
docker stats

# Logs with filter
docker-compose logs --tail=100 -f app | grep ERROR

# Export metrics
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Secrets properly stored
- [ ] SSL/TLS certificates installed
- [ ] Database backups configured
- [ ] Monitoring setup
- [ ] Log rotation enabled
- [ ] Resource limits set
- [ ] Health checks verified
- [ ] Security scan passed
- [ ] Performance tested
- [ ] Rollback plan ready

## Security Best Practices

1. **Never commit secrets** - Use `.env*.local` files
2. **Use Docker secrets** in production
3. **Enable SSL/TLS** - Use Let's Encrypt
4. **Limit resource usage** - Set CPU/memory limits
5. **Regular updates** - Keep base images updated
6. **Scan images** - Use Trivy or similar
7. **Non-root user** - Already configured
8. **Network isolation** - Use internal networks
9. **Volume encryption** - For sensitive data
10. **Audit logs** - Enable and monitor

## Support

For issues and questions:
- GitHub Issues: https://github.com/yourusername/restoreassist
- Documentation: https://docs.restoreassist.app
- Email: support@restoreassist.app
