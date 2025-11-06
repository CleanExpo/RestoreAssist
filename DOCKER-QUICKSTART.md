# Docker Quick Start Guide

Get RestoreAssist running with Docker in 5 minutes.

## Prerequisites

- Docker Desktop installed and running
- Node.js 20.x (for npm scripts)

## Quick Setup

### 1. Validate Configuration

```bash
npm run docker:validate
```

### 2. Configure Environment

```bash
# Copy environment template
copy .env.docker .env.docker.local

# Edit with your values
notepad .env.docker.local
```

**Required Settings:**
- `POSTGRES_PASSWORD` - Set a secure database password
- `NEXTAUTH_SECRET` - Generate with: `openssl rand -base64 32`
- `JWT_SECRET` - Generate with: `openssl rand -base64 32`
- `JWT_REFRESH_SECRET` - Generate with: `openssl rand -base64 32`
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` - Your AI API key

### 3. Build and Start

```bash
# Build Docker images
npm run docker:build

# Start all services
npm run docker:up

# View logs
npm run docker:logs
```

### 4. Access Application

- **App:** http://localhost:3001
- **Health:** http://localhost:3001/api/health

## Common Commands

```bash
# Start services
npm run docker:up

# Stop services
npm run docker:down

# View logs
npm run docker:logs

# Restart
npm run docker:restart

# Clean restart (removes data)
npm run docker:clean

# Rebuild
npm run docker:build
```

## One-Line Startup (Windows)

```bash
docker-start.bat
```

## One-Line Startup (Linux/Mac)

```bash
chmod +x docker-start.sh
./docker-start.sh
```

## Troubleshooting

### Port Already in Use

```bash
# Change port in .env.docker.local
APP_PORT=3002
```

### Database Connection Failed

```bash
# Check services are running
docker-compose ps

# View database logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Application Not Responding

```bash
# Check health
curl http://localhost:3001/api/health

# View logs
npm run docker:logs

# Restart app
docker-compose restart app
```

### Build Failed

```bash
# Clean rebuild
docker-compose build --no-cache
npm run docker:build
```

## Database Operations

```bash
# Access database
docker-compose exec postgres psql -U postgres -d restoreassist

# Run migrations
npm run docker:prisma-migrate

# Open Prisma Studio
npm run docker:prisma-studio

# Backup database
docker-compose exec postgres pg_dump -U postgres restoreassist > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres -d restoreassist < backup.sql
```

## Need More Help?

See the full documentation: [README-DOCKER.md](./README-DOCKER.md)

## Production Deployment

```bash
# Use production configuration
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f

# Check health
curl http://localhost:3001/api/health
```

---

**Ready to go!** For detailed documentation, see [README-DOCKER.md](./README-DOCKER.md)
