# RestoreAssist Docker Deployment Guide

Complete guide for deploying RestoreAssist using Docker and Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Docker Scripts](#docker-scripts)
- [Architecture](#architecture)
- [Database Setup](#database-setup)
- [Environment Variables](#environment-variables)
- [Deployment Modes](#deployment-modes)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)
- [Security Best Practices](#security-best-practices)
- [Monitoring & Logs](#monitoring--logs)
- [Backup & Recovery](#backup--recovery)

---

## Prerequisites

Before you begin, ensure you have installed:

- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
  - Version 20.10 or higher
  - Download: https://docs.docker.com/get-docker/

- **Docker Compose**
  - Version 2.0 or higher
  - Usually included with Docker Desktop

Verify installation:
```bash
docker --version
docker-compose --version
```

---

## Quick Start

### 1. Clone and Configure

```bash
# Navigate to project directory
cd D:\RestoreAssist

# Copy Docker environment template
copy .env.docker .env.docker.local

# Edit .env.docker.local with your configuration
notepad .env.docker.local
```

**Minimum required configuration:**
- Set secure `POSTGRES_PASSWORD`
- Generate secure `NEXTAUTH_SECRET` (run: `openssl rand -base64 32`)
- Generate secure `JWT_SECRET` (run: `openssl rand -base64 32`)
- Generate secure `JWT_REFRESH_SECRET` (run: `openssl rand -base64 32`)
- Add your `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

### 2. Build and Start

```bash
# Build Docker images
npm run docker:build

# Start all services (detached mode)
npm run docker:up

# View logs
npm run docker:logs
```

### 3. Access Application

- **Application:** http://localhost:3001
- **Health Check:** http://localhost:3001/api/health
- **Database:** localhost:5432 (accessible from host machine)

### 4. Stop Services

```bash
# Stop all services
npm run docker:down

# Stop and remove volumes (clean slate)
npm run docker:clean
```

---

## Configuration

### Environment File Setup

The Docker deployment uses `.env.docker.local` for configuration. This file is gitignored and should never be committed.

**Steps:**

1. Copy the template:
   ```bash
   copy .env.docker .env.docker.local
   ```

2. Generate secure secrets:
   ```bash
   # Windows PowerShell
   [Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))

   # Linux/Mac/WSL
   openssl rand -base64 32
   ```

3. Update required variables in `.env.docker.local`:
   - `POSTGRES_PASSWORD`
   - `NEXTAUTH_SECRET`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

4. Optional: Configure additional services (Stripe, email, AWS, etc.)

### Docker Compose Override (Optional)

For local development overrides, create `docker-compose.override.yml`:

```yaml
version: '3.9'

services:
  app:
    ports:
      - "3002:3001"  # Use different port
    environment:
      DEBUG: "true"
      LOG_LEVEL: "debug"
    volumes:
      # Mount source code for hot reload (development only)
      - ./app:/app/app:ro
```

---

## Docker Scripts

All Docker operations are available via npm scripts:

| Script | Command | Description |
|--------|---------|-------------|
| `npm run docker:build` | `docker-compose build` | Build Docker images |
| `npm run docker:up` | `docker-compose up -d` | Start services (detached) |
| `npm run docker:down` | `docker-compose down` | Stop all services |
| `npm run docker:logs` | `docker-compose logs -f` | Follow logs (all services) |
| `npm run docker:restart` | `docker-compose restart` | Restart all services |
| `npm run docker:clean` | `docker-compose down -v` | Stop and remove volumes |
| `npm run docker:dev` | `docker-compose up` | Start with logs (foreground) |
| `npm run docker:db` | `docker-compose up -d postgres` | Start database only |
| `npm run docker:prisma-migrate` | `docker-compose exec app npx prisma migrate deploy` | Run Prisma migrations |
| `npm run docker:prisma-studio` | `docker-compose exec app npx prisma studio` | Open Prisma Studio |

### Direct Docker Compose Commands

You can also use Docker Compose directly:

```bash
# View service status
docker-compose ps

# View logs for specific service
docker-compose logs -f app
docker-compose logs -f postgres

# Execute commands in running container
docker-compose exec app sh
docker-compose exec postgres psql -U postgres -d restoreassist

# Rebuild specific service
docker-compose build app

# Scale services (if needed)
docker-compose up -d --scale app=3
```

---

## Architecture

### Docker Services

The stack consists of two main services:

#### 1. PostgreSQL Database (`postgres`)
- **Image:** `postgres:16-alpine`
- **Container Name:** `restoreassist-db`
- **Port:** 5432 (exposed to host)
- **Volume:** `postgres_data` (persistent storage)
- **Health Check:** Automatic with `pg_isready`

#### 2. Next.js Application (`app`)
- **Image:** Custom build from Dockerfile
- **Container Name:** `restoreassist-app`
- **Port:** 3001 (exposed to host)
- **Dependencies:** PostgreSQL (waits for healthy state)
- **Health Check:** HTTP GET to `/api/health`
- **Startup:** Runs Prisma migrations automatically

### Network Architecture

```
┌─────────────────────────────────────────────┐
│ Host Machine (localhost)                    │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Browser                              │  │
│  │ http://localhost:3001                │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
└───────────────┼─────────────────────────────┘
                │ Port 3001
┌───────────────┼─────────────────────────────┐
│ Docker Network (restoreassist-network)      │
│               │                             │
│  ┌────────────▼─────────────────────────┐  │
│  │ Next.js App Container                │  │
│  │ restoreassist-app                    │  │
│  │ - Node.js 20.19.4                    │  │
│  │ - Next.js 15.0.3                     │  │
│  │ - Prisma Client                      │  │
│  │ Port: 3001 (internal)                │  │
│  └────────────┬─────────────────────────┘  │
│               │ DATABASE_URL                │
│               │ postgres://postgres:5432    │
│  ┌────────────▼─────────────────────────┐  │
│  │ PostgreSQL Container                 │  │
│  │ restoreassist-db                     │  │
│  │ - PostgreSQL 16                      │  │
│  │ - Volume: postgres_data              │  │
│  │ Port: 5432 (internal & exposed)      │  │
│  └──────────────────────────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

### Build Stages (Multi-Stage Dockerfile)

1. **deps:** Install production dependencies
2. **builder:** Build application with Prisma generation
3. **runner:** Minimal runtime image with non-root user

---

## Database Setup

### Automatic Setup

The database is automatically configured when you start the services:

1. PostgreSQL container starts and initializes database
2. `init-db.sql` runs (creates extensions)
3. Application container starts
4. Prisma migrations run automatically on startup

### Manual Database Operations

#### Access PostgreSQL Shell

```bash
docker-compose exec postgres psql -U postgres -d restoreassist
```

#### Run Prisma Migrations

```bash
# Deploy all pending migrations
npm run docker:prisma-migrate

# Or directly:
docker-compose exec app npx prisma migrate deploy
```

#### Create New Migration

```bash
# Generate migration from schema changes
docker-compose exec app npx prisma migrate dev --name migration_name
```

#### Prisma Studio (Database Browser)

```bash
npm run docker:prisma-studio

# Access at: http://localhost:5555
```

#### Database Backup

```bash
# Backup database to file
docker-compose exec postgres pg_dump -U postgres restoreassist > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
docker-compose exec -T postgres psql -U postgres -d restoreassist < backup_20240101_120000.sql
```

#### Reset Database

```bash
# Stop services
npm run docker:down

# Remove volumes (deletes data)
docker volume rm restoreassist_postgres_data

# Start fresh
npm run docker:up
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Database password | `your_secure_password` |
| `NEXTAUTH_SECRET` | NextAuth.js secret | `openssl rand -base64 32` |
| `JWT_SECRET` | JWT signing secret | `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | `openssl rand -base64 32` |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-api03-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_PORT` | Application port | `3001` |
| `POSTGRES_PORT` | Database port | `5432` |
| `DEBUG` | Enable debug mode | `false` |
| `LOG_LEVEL` | Logging level | `info` |
| `EMAIL_ENABLED` | Enable email | `true` |

### Service-Specific Variables

#### Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

#### Email (SMTP)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`

#### AWS S3
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`

#### Google OAuth
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

---

## Deployment Modes

### Development Mode

For local development with live logs:

```bash
npm run docker:dev
```

Features:
- Logs visible in terminal
- Easy to stop with Ctrl+C
- Good for testing

### Production Mode (Detached)

For production deployment:

```bash
npm run docker:up
```

Features:
- Runs in background
- Automatic restart on failure
- Logs accessible via `docker:logs`

### Database-Only Mode

Run only PostgreSQL for local development:

```bash
# Start database
npm run docker:db

# Update .env to use Docker database
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/restoreassist

# Run Next.js locally
npm run dev
```

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

**Error:** `Bind for 0.0.0.0:3001 failed: port is already allocated`

**Solutions:**
```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process (Windows)
taskkill /PID <PID> /F

# Or change port in .env.docker.local
APP_PORT=3002
```

#### 2. Database Connection Failed

**Error:** `Can't reach database server`

**Solutions:**
```bash
# Check database is running
docker-compose ps

# View database logs
docker-compose logs postgres

# Verify credentials in .env.docker.local
# Ensure POSTGRES_PASSWORD matches

# Restart database
docker-compose restart postgres
```

#### 3. Prisma Client Not Generated

**Error:** `Cannot find module '@prisma/client'`

**Solutions:**
```bash
# Rebuild images
npm run docker:build

# Manually generate Prisma client
docker-compose exec app npx prisma generate
```

#### 4. Application Not Responding

**Solutions:**
```bash
# Check health status
curl http://localhost:3001/api/health

# View application logs
docker-compose logs app

# Restart application
docker-compose restart app

# Check container status
docker-compose ps
```

#### 5. Build Fails

**Solutions:**
```bash
# Clean build cache
docker-compose build --no-cache

# Remove old images
docker image prune -a

# Check Docker disk space
docker system df

# Clean up Docker
docker system prune -a
```

### Debug Mode

Enable detailed logging:

```bash
# Add to .env.docker.local
DEBUG=true
LOG_LEVEL=debug

# Restart services
npm run docker:restart

# View logs
npm run docker:logs
```

### Container Shell Access

Access running container for debugging:

```bash
# Application container
docker-compose exec app sh

# Database container
docker-compose exec postgres sh

# View environment variables
docker-compose exec app env

# Check Prisma status
docker-compose exec app npx prisma studio
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All environment variables configured
- [ ] Secure secrets generated (not default values)
- [ ] Database backups configured
- [ ] SSL/TLS certificates ready
- [ ] Monitoring and alerting set up
- [ ] Log aggregation configured
- [ ] Resource limits reviewed
- [ ] Security scan completed

### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.9'

services:
  app:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Deploy with:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Reverse Proxy (Nginx)

Example Nginx configuration for production:

```nginx
server {
    listen 80;
    server_name restoreassist.app;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name restoreassist.app;

    ssl_certificate /etc/ssl/certs/restoreassist.crt;
    ssl_certificate_key /etc/ssl/private/restoreassist.key;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Health Monitoring

Set up monitoring with health checks:

```bash
# Check application health
curl -f http://localhost:3001/api/health || exit 1

# Database health
docker-compose exec postgres pg_isready -U postgres
```

---

## Security Best Practices

### 1. Secrets Management

- **Never commit** `.env.docker.local` to version control
- Use strong, randomly generated secrets
- Rotate secrets regularly
- Use Docker secrets for sensitive data in production

```bash
# Generate secure secrets
openssl rand -base64 32
```

### 2. Container Security

- ✅ Non-root user (nextjs:nodejs)
- ✅ Multi-stage build (minimal attack surface)
- ✅ Alpine Linux base images
- ✅ No unnecessary packages
- ✅ Health checks enabled

### 3. Network Security

- Use internal networks for service communication
- Expose only necessary ports
- Implement rate limiting
- Use HTTPS in production (via reverse proxy)

### 4. Database Security

- Strong PostgreSQL password
- Limit database user permissions
- Regular backups
- Enable SSL for database connections in production

### 5. Image Security

Scan images for vulnerabilities:

```bash
# Install Trivy
docker pull aquasec/trivy

# Scan image
docker run aquasec/trivy image restoreassist-app
```

---

## Monitoring & Logs

### View Logs

```bash
# All services
npm run docker:logs

# Specific service
docker-compose logs -f app
docker-compose logs -f postgres

# Last N lines
docker-compose logs --tail=100 app

# Since timestamp
docker-compose logs --since="2024-01-01T00:00:00" app
```

### Log Management

Logs are stored with rotation:
- **Max size:** 10MB per file
- **Max files:** 3 files
- **Driver:** JSON file

### Health Monitoring

```bash
# Check health status
curl http://localhost:3001/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "database": "connected",
  "version": "0.1.0"
}
```

### Container Metrics

```bash
# Real-time stats
docker stats

# Specific container
docker stats restoreassist-app
```

---

## Backup & Recovery

### Database Backup

#### Manual Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U postgres restoreassist > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backup_*.sql
```

#### Automated Backup Script

Create `backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/restoreassist_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR

docker-compose exec -T postgres pg_dump -U postgres restoreassist > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE.gz"
```

Schedule with cron:
```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup.sh
```

### Restore Database

```bash
# Stop application
docker-compose stop app

# Restore from backup
docker-compose exec -T postgres psql -U postgres -d restoreassist < backup_20240101_120000.sql

# Or from compressed backup
gunzip -c backup_20240101_120000.sql.gz | docker-compose exec -T postgres psql -U postgres -d restoreassist

# Start application
docker-compose start app
```

### Volume Backup

```bash
# Backup volume to tar
docker run --rm -v restoreassist_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_data_backup.tar.gz -C /data .

# Restore volume from tar
docker run --rm -v restoreassist_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_data_backup.tar.gz -C /data
```

---

## Additional Resources

### Docker Documentation
- [Docker Overview](https://docs.docker.com/get-started/overview/)
- [Docker Compose](https://docs.docker.com/compose/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)

### Next.js Resources
- [Next.js Docker Documentation](https://nextjs.org/docs/deployment#docker-image)
- [Next.js Standalone Output](https://nextjs.org/docs/advanced-features/output-file-tracing)

### Prisma Resources
- [Prisma Docker Guide](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-docker)
- [Prisma Migrations](https://www.prisma.io/docs/concepts/components/prisma-migrate)

---

## Support

### Getting Help

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs: `npm run docker:logs`
3. Check container status: `docker-compose ps`
4. Verify configuration: `.env.docker.local`
5. Test health endpoint: `curl http://localhost:3001/api/health`

### Common Commands Reference

```bash
# Start everything
npm run docker:up

# Stop everything
npm run docker:down

# View logs
npm run docker:logs

# Restart services
npm run docker:restart

# Clean slate (removes data)
npm run docker:clean && npm run docker:up

# Rebuild and restart
npm run docker:build && npm run docker:up

# Database backup
docker-compose exec postgres pg_dump -U postgres restoreassist > backup.sql

# Health check
curl http://localhost:3001/api/health
```

---

## License

RestoreAssist - All rights reserved

---

**Happy Dockerizing!** 🐳
