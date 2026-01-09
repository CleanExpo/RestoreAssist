# Docker Setup for RestoreAssist

This guide covers using Docker for both development and production deployment of RestoreAssist.

## Quick Start

### Development (with local PostgreSQL)

```bash
# Start development environment
./scripts/docker-setup.sh dev-start

# View logs
./scripts/docker-setup.sh dev-logs

# Stop environment
./scripts/docker-setup.sh dev-stop
```

**Windows:**
```batch
scripts\docker-setup.bat dev-start
```

### Production Build

```bash
# Build production image
./scripts/docker-setup.sh prod-build

# Run production container
./scripts/docker-setup.sh prod-run
```

## Architecture

### Multi-Stage Dockerfile

The `Dockerfile` uses 3 stages to optimize image size and build time:

1. **deps** - Installs production dependencies only
2. **builder** - Installs all dependencies and builds the application
3. **runtime** - Minimal image with only runtime dependencies

**Image Size:**
- Development: ~1.2GB (with build tools)
- Production: ~450MB (optimized runtime only)

### Docker Compose Configuration

**Services:**

- **postgres** (dev only) - PostgreSQL 16 database
- **app** (dev) - Next.js development server with hot reload
- **app-prod** (prod) - Production Next.js application

**Profiles:**
- `dev` - Development environment with database
- `prod` - Production environment

## Environment Variables

Create `.env.local` for development:

```env
# Database (for dev environment)
DB_USER=dev
DB_PASSWORD=dev
DB_NAME=restoreassist

# Next.js
NODE_ENV=development
NEXTAUTH_SECRET=dev-secret-change-in-production
NEXTAUTH_URL=http://localhost:3000

# APIs
STRIPE_SECRET_KEY=sk_test_...
ANTHROPIC_API_KEY=sk-ant-...
```

## Database Management

### Initialize Database

```bash
# Migrations run automatically on dev-start
# Manual run:
./scripts/docker-setup.sh db-seed
```

### Database Shell

Open interactive psql session:

```bash
./scripts/docker-setup.sh db-shell
```

### Database Backup

Backup to file:

```bash
./scripts/docker-setup.sh db-backup
# Creates: backups/restoreassist-YYYYMMDD-HHMMSS.sql
```

### Reset Database

⚠️ **Warning**: Deletes all data

```bash
./scripts/docker-setup.sh db-reset
```

## Development Workflow

### Local Development (without Docker)

Use the standard npm commands:

```bash
npm install
npm run dev
# Access at http://localhost:3000
```

### Development with Docker

Recommended for consistency with production:

```bash
./scripts/docker-setup.sh dev-start

# Code changes trigger hot reload automatically
# Database accessible at localhost:5432
```

**Access:**
- Application: http://localhost:3000
- Database: postgres://dev:dev@localhost:5432/restoreassist

### Building for Production

```bash
# Build optimized Docker image
./scripts/docker-setup.sh prod-build

# Image tags:
# - restoreassist:latest
# - restoreassist:YYYYMMDD-HHMMSS
```

## Production Deployment

### Vercel (Current)

Skip Docker - use native Vercel deployment:

```bash
git push origin main
vercel deploy --prod  # or automatic on merge
```

### Self-Hosted Docker

1. **Prepare environment:**

```bash
# Create .env.local with production values
cat > .env.local << EOF
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
DIRECT_URL=postgresql://user:pass@host:5432/db
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=https://your-domain.com
STRIPE_SECRET_KEY=sk_live_...
ANTHROPIC_API_KEY=sk-ant-...
EOF
```

2. **Build and run:**

```bash
./scripts/docker-setup.sh prod-build
./scripts/docker-setup.sh prod-run
```

3. **Verify health:**

```bash
./scripts/docker-setup.sh health
```

### Docker Compose (Multi-container)

For production with external database:

```bash
docker-compose --profile prod up -d app-prod
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
docker run -p 3001:3000 restoreassist:latest
```

### Database Connection Issues

```bash
# Check database is healthy
./scripts/docker-setup.sh db-shell

# View database logs
docker-compose logs postgres

# Restart database
docker-compose down
docker-compose up -d postgres
```

### Build Failures

```bash
# Clean rebuild
docker build --no-cache -t restoreassist:latest .

# Check build context
du -sh .docker/
```

### Application Crashes

```bash
# View logs
docker-compose logs app

# Inspect container
docker exec -it restoreassist-app /bin/sh

# Check health endpoint
curl http://localhost:3000/api/health
```

## Health Checks

The application includes a health check endpoint for monitoring:

```bash
# Manual health check
curl http://localhost:3000/api/health

# Response (healthy):
{
  "status": "healthy",
  "timestamp": "2026-01-09T12:00:00Z",
  "database": "connected"
}

# Response (unhealthy):
{
  "status": "unhealthy",
  "timestamp": "2026-01-09T12:00:00Z",
  "database": "disconnected",
  "error": "Connection timeout"
}
```

Docker automatically monitors health every 30 seconds.

## Performance Tips

### Development

- Keep Docker volumes mounted for hot reload
- Use `--profile dev` to avoid building production stage
- Database runs in same container network for fast queries

### Production

- Use multi-stage builds (reduces image size 60%)
- Run non-root user for security
- Enable restart policies for resilience
- Use health checks for automatic restart
- Set resource limits:

```bash
docker run \
  --memory=1g \
  --cpus=1 \
  restoreassist:latest
```

## Security

- Non-root user (uid 1001) in production image
- Secrets never committed to repo
- Health checks verify container is responsive
- Base image is Alpine Linux (minimal attack surface)
- Regular dependency updates

## Common Commands

```bash
# Development
./scripts/docker-setup.sh dev-start
./scripts/docker-setup.sh dev-logs
./scripts/docker-setup.sh dev-stop

# Database
./scripts/docker-setup.sh db-seed
./scripts/docker-setup.sh db-shell
./scripts/docker-setup.sh db-backup

# Production
./scripts/docker-setup.sh prod-build
./scripts/docker-setup.sh prod-run

# Maintenance
./scripts/docker-setup.sh health
./scripts/docker-setup.sh clean
```

## For Windows Users

Use the batch script equivalent:

```batch
scripts\docker-setup.bat dev-start
scripts\docker-setup.bat prod-build
scripts\docker-setup.bat health
```

## Useful Docker Commands

```bash
# List running containers
docker ps

# View container logs
docker logs -f <container-id>

# Access container shell
docker exec -it <container-id> /bin/sh

# Inspect container details
docker inspect <container-id>

# View resource usage
docker stats

# Remove dangling images/volumes
docker system prune
```

---

**Last Updated**: 2026-01-09
**Docker Version**: 24.0+
**Docker Compose Version**: 2.20+
