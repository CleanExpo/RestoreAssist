# RestoreAssist Docker Setup Guide

Complete guide for containerizing and deploying RestoreAssist using Docker and Docker Compose.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Environment](#development-environment)
- [Production Deployment](#production-deployment)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Database Management](#database-management)
- [Monitoring & Logs](#monitoring--logs)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Overview

RestoreAssist uses a modern containerized architecture with:

- **Frontend**: React + Vite app served by Nginx
- **Backend**: Node.js API with Express
- **Database**: PostgreSQL 16
- **Reverse Proxy**: Nginx (production only)

### Container Images

All containers use multi-stage builds for optimal size and security:

- **Frontend**: `node:20-alpine` → `nginx:alpine` (production)
- **Backend**: `node:20-alpine` with non-root user
- **Database**: `postgres:16-alpine`
- **Reverse Proxy**: `nginx:alpine`

## Prerequisites

### Required Software

```bash
# Docker
Docker version 24.0.0 or higher
Docker Compose version 2.0.0 or higher

# Verify installation
docker --version
docker-compose --version
```

### System Requirements

**Development:**
- CPU: 2 cores minimum
- RAM: 4GB minimum
- Disk: 10GB free space

**Production:**
- CPU: 4 cores recommended
- RAM: 8GB recommended
- Disk: 50GB free space (with logs and backups)

## Quick Start

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/restoreassist.git
cd restoreassist

# Copy environment file
cp .env.docker .env

# Edit .env with your configuration
nano .env  # or use your preferred editor
```

### 2. Start Development Environment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:3001
# Database Admin: http://localhost:8080 (optional)
```

### 3. Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes data)
docker-compose down -v
```

## Development Environment

### Starting Development Mode

```bash
# Start with build
docker-compose up --build

# Start in detached mode
docker-compose up -d

# Start specific services
docker-compose up frontend backend

# Start with database admin tool
docker-compose --profile tools up
```

### Hot Reload

Development mode includes hot reload for both frontend and backend:

- **Frontend**: Vite dev server with HMR on port 5173
- **Backend**: tsx watch mode on port 3001

### Running Commands in Containers

```bash
# Access backend shell
docker-compose exec backend sh

# Access frontend shell
docker-compose exec frontend sh

# Access database
docker-compose exec postgres psql -U restoreassist -d restoreassist

# Run npm commands
docker-compose exec backend npm run test
docker-compose exec frontend npm run build
```

### Database Migrations

```bash
# Generate Prisma migration
docker-compose exec backend npx prisma migrate dev --name migration_name

# Apply migrations
docker-compose exec backend npx prisma migrate deploy

# Reset database (⚠️ deletes all data)
docker-compose exec backend npx prisma migrate reset

# Generate Prisma Client
docker-compose exec backend npx prisma generate
```

### Debugging

```bash
# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres

# View last 100 lines
docker-compose logs --tail=100 backend

# Check service health
docker-compose ps

# Inspect container
docker inspect restoreassist-backend-dev
```

## Production Deployment

### 1. Prepare Environment

```bash
# Copy production environment template
cp .env.docker .env

# Edit with production values
nano .env
```

**Critical Production Settings:**

```bash
# Strong JWT secret (32+ characters)
JWT_SECRET=generate-with-openssl-rand-base64-32

# Strong database password
POSTGRES_PASSWORD=generate-with-openssl-rand-base64-32

# Production URLs
VITE_API_URL=https://api.restoreassist.app
VITE_APP_URL=https://restoreassist.app

# Enable security features
NODE_ENV=production
DEBUG=false
LOG_LEVEL=info
```

### 2. Build Production Images

```bash
# Build all production images
docker-compose -f docker-compose.prod.yml build

# Build specific service
docker-compose -f docker-compose.prod.yml build backend
docker-compose -f docker-compose.prod.yml build frontend

# Build with no cache (clean build)
docker-compose -f docker-compose.prod.yml build --no-cache
```

### 3. Deploy

```bash
# Start production stack
docker-compose -f docker-compose.prod.yml up -d

# View startup logs
docker-compose -f docker-compose.prod.yml logs -f

# Check service health
docker-compose -f docker-compose.prod.yml ps
```

### 4. SSL/TLS Setup

#### Using Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificates
sudo certbot certonly --standalone -d restoreassist.app -d www.restoreassist.app

# Copy certificates
sudo cp /etc/letsencrypt/live/restoreassist.app/fullchain.pem ./docker/nginx/ssl/
sudo cp /etc/letsencrypt/live/restoreassist.app/privkey.pem ./docker/nginx/ssl/

# Update nginx configuration
# Uncomment SSL sections in docker/nginx/conf.d/default.conf

# Restart nginx
docker-compose -f docker-compose.prod.yml restart nginx
```

#### Certificate Auto-Renewal

```bash
# Add to crontab
0 3 * * * certbot renew --quiet && docker-compose -f /path/to/restoreassist/docker-compose.prod.yml restart nginx
```

### 5. Verify Deployment

```bash
# Check all services are healthy
docker-compose -f docker-compose.prod.yml ps

# Test API health endpoint
curl https://api.restoreassist.app/health

# Test frontend
curl -I https://restoreassist.app

# Monitor logs
docker-compose -f docker-compose.prod.yml logs -f --tail=50
```

## Architecture

### Network Architecture

```
                    ┌─────────────────┐
                    │   Internet      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Nginx Proxy    │ :80, :443
                    │  (Production)   │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     ┌────────▼────────┐          ┌────────▼────────┐
     │   Frontend      │          │   Backend API   │
     │  (Nginx/React)  │ :80      │   (Node.js)     │ :3001
     └─────────────────┘          └────────┬────────┘
                                           │
                                  ┌────────▼────────┐
                                  │   PostgreSQL    │ :5432
                                  │   (Database)    │
                                  └─────────────────┘
```

### Docker Network

All services communicate through a private Docker network:

- **Development**: `restoreassist_network`
- **Production**: `restoreassist_network_prod`

Services reference each other by container name (e.g., `http://backend:3001`).

### Volume Mounts

**Development:**
```
- Frontend source → /app/src (hot reload)
- Backend source → /app/src (hot reload)
- PostgreSQL data → postgres_data
```

**Production:**
```
- PostgreSQL data → postgres_data_prod
- Nginx cache → nginx_cache
- Nginx logs → nginx_logs
- Backups → ./backups
```

## Configuration

### Environment Variables

Complete list of environment variables:

#### Database
```bash
POSTGRES_DB=restoreassist
POSTGRES_USER=restoreassist
POSTGRES_PASSWORD=secure_password
DATABASE_URL=postgresql://user:pass@postgres:5432/db
```

#### Application
```bash
NODE_ENV=production
PORT=3001
DEBUG=false
LOG_LEVEL=info
```

#### Security
```bash
JWT_SECRET=min-32-characters-secure-random-string
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
ALLOWED_ORIGINS=https://restoreassist.app
```

#### External Services
```bash
# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx

# Anthropic AI
ANTHROPIC_API_KEY=sk-ant-xxx

# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Build Arguments

Frontend build arguments:

```bash
docker build \
  --build-arg VITE_API_URL=https://api.restoreassist.app \
  --build-arg VITE_APP_URL=https://restoreassist.app \
  --build-arg VITE_GOOGLE_CLIENT_ID=xxx \
  -t restoreassist-frontend \
  ./packages/frontend
```

## Database Management

### Backups

#### Automated Backups

```bash
# Create backup
./docker/scripts/backup-db.sh

# Backups are stored in ./backups/
# Format: backup_YYYYMMDD_HHMMSS.sql.gz
# Automatic cleanup after 30 days
```

#### Manual Backup

```bash
# Create timestamped backup
docker exec restoreassist-postgres pg_dump -U restoreassist restoreassist > backup_$(date +%Y%m%d).sql

# Compress
gzip backup_$(date +%Y%m%d).sql
```

#### Scheduled Backups

Add to crontab for daily backups:

```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/restoreassist && ./docker/scripts/backup-db.sh >> /var/log/restoreassist-backup.log 2>&1
```

### Restore

```bash
# Restore from backup
./docker/scripts/restore-db.sh ./backups/backup_20250101_020000.sql.gz

# Manual restore
gunzip -c backup.sql.gz | docker exec -i restoreassist-postgres psql -U restoreassist -d restoreassist
```

### Database Access

```bash
# Connect via psql
docker-compose exec postgres psql -U restoreassist -d restoreassist

# Connect via Adminer (development)
docker-compose --profile tools up -d adminer
# Access: http://localhost:8080
# Server: postgres
# Username: restoreassist
# Database: restoreassist
```

### Migrations

```bash
# Create new migration
docker-compose exec backend npx prisma migrate dev --name add_new_table

# Apply pending migrations
docker-compose exec backend npx prisma migrate deploy

# View migration status
docker-compose exec backend npx prisma migrate status

# Reset database (⚠️ destructive)
docker-compose exec backend npx prisma migrate reset
```

## Monitoring & Logs

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
docker-compose logs -f nginx

# Last N lines
docker-compose logs --tail=100 backend

# Since timestamp
docker-compose logs --since 2025-01-01T00:00:00 backend
```

### Log Files

Production logs location:

```
./docker/nginx/logs/
  ├── access.log
  ├── error.log
  └── access.log.1.gz (rotated)
```

### Resource Usage

```bash
# Real-time stats
docker stats

# Specific containers
docker stats restoreassist-backend restoreassist-frontend

# One-time stats
docker stats --no-stream
```

### Health Checks

```bash
# Check all services
docker-compose ps

# Check specific service health
docker inspect --format='{{.State.Health.Status}}' restoreassist-backend

# Test health endpoints
curl http://localhost:3001/api/health
curl http://localhost/health
```

### Container Inspection

```bash
# Full container details
docker inspect restoreassist-backend

# Specific field
docker inspect --format='{{.NetworkSettings.IPAddress}}' restoreassist-backend

# Container processes
docker top restoreassist-backend

# Container filesystem changes
docker diff restoreassist-backend
```

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port
lsof -i :5173  # or netstat -ano | findstr :5173 on Windows

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
ports:
  - "5174:5173"  # Use different host port
```

#### Container Won't Start

```bash
# Check logs
docker-compose logs backend

# Check container status
docker-compose ps

# Rebuild container
docker-compose up -d --build backend

# Remove and recreate
docker-compose rm backend
docker-compose up -d backend
```

#### Database Connection Refused

```bash
# Check postgres is running
docker-compose ps postgres

# Check postgres logs
docker-compose logs postgres

# Verify DATABASE_URL
docker-compose exec backend env | grep DATABASE_URL

# Test connection
docker-compose exec backend npx prisma db pull
```

#### Frontend Build Fails

```bash
# Clear build cache
docker-compose build --no-cache frontend

# Check for missing env vars
docker-compose config

# Build with verbose output
docker-compose build --progress=plain frontend
```

#### Out of Disk Space

```bash
# Check Docker disk usage
docker system df

# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove everything unused
docker system prune -a --volumes
```

### Debug Mode

Enable debug logging:

```bash
# Backend
docker-compose exec backend sh
export DEBUG=true
export LOG_LEVEL=debug
npm run dev

# View detailed logs
docker-compose logs -f backend | grep DEBUG
```

### Reset Everything

```bash
# Stop all containers
docker-compose down

# Remove volumes (⚠️ deletes all data)
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Clean system
docker system prune -a --volumes

# Start fresh
docker-compose up --build
```

## Security Best Practices

### 1. Environment Variables

- ✅ Never commit `.env` to version control
- ✅ Use strong, random passwords (32+ characters)
- ✅ Rotate secrets regularly
- ✅ Use different secrets for dev/staging/production

```bash
# Generate secure secrets
openssl rand -base64 32

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. Container Security

- ✅ Run containers as non-root user
- ✅ Use minimal base images (alpine)
- ✅ Multi-stage builds to reduce attack surface
- ✅ Scan images for vulnerabilities

```bash
# Scan image for vulnerabilities
docker scan restoreassist-backend

# Update base images regularly
docker-compose pull
docker-compose up -d --build
```

### 3. Network Security

- ✅ Don't expose database port to host in production
- ✅ Use reverse proxy for SSL termination
- ✅ Enable rate limiting
- ✅ Configure CORS properly

### 4. Database Security

- ✅ Use strong database passwords
- ✅ Enable SSL for database connections
- ✅ Regular backups with encryption
- ✅ Restrict database user permissions

### 5. SSL/TLS

- ✅ Use Let's Encrypt for free SSL certificates
- ✅ Enable HSTS headers
- ✅ Use TLS 1.2+
- ✅ Configure strong ciphers

### 6. Logging & Monitoring

- ✅ Enable Sentry for error tracking
- ✅ Log all authentication attempts
- ✅ Monitor resource usage
- ✅ Set up alerts for failures

### 7. Updates

```bash
# Update dependencies
docker-compose exec backend npm update
docker-compose exec frontend npm update

# Rebuild with updates
docker-compose up -d --build

# Update Docker images
docker-compose pull
docker-compose up -d
```

## Advanced Configuration

### Custom Nginx Configuration

Edit `docker/nginx/conf.d/default.conf` for:

- Custom SSL settings
- Additional security headers
- Rate limiting rules
- Caching policies
- Proxy timeouts

### Resource Limits

Edit `docker-compose.prod.yml`:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Multiple Environments

```bash
# Staging
docker-compose -f docker-compose.prod.yml -f docker-compose.staging.yml up -d

# Different env file
docker-compose --env-file .env.staging up -d
```

## Support

### Getting Help

- **Documentation**: [README.md](./README.md)
- **Issues**: GitHub Issues
- **Email**: support@restoreassist.app

### Useful Commands Reference

```bash
# Development
docker-compose up                    # Start dev environment
docker-compose down                  # Stop dev environment
docker-compose logs -f               # View logs
docker-compose exec backend sh      # Access backend shell

# Production
docker-compose -f docker-compose.prod.yml up -d     # Start production
docker-compose -f docker-compose.prod.yml down      # Stop production
docker-compose -f docker-compose.prod.yml ps        # Check status

# Database
./docker/scripts/backup-db.sh       # Create backup
./docker/scripts/restore-db.sh      # Restore backup
docker-compose exec postgres psql   # Access database

# Maintenance
docker system prune                 # Clean up
docker-compose pull                 # Update images
docker-compose up -d --build        # Rebuild and restart
```

---

**Happy Containerizing! 🐳**

For questions or issues, please refer to the [README.md](./README.md) or contact support.
