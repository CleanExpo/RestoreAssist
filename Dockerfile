# ================================
# RestoreAssist Production Dockerfile
# ================================
# Multi-stage build for Next.js 15.0.3 application
# with Prisma ORM and PostgreSQL support
# Optimized for minimal size and maximum security

# ================================
# Stage 1: Dependencies
# ================================
FROM node:20-alpine AS deps

# Install system dependencies for Prisma and native modules
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    ca-certificates

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (needed for build)
# Using npm install due to package-lock sync issues
RUN npm install && \
    npm cache clean --force

# ================================
# Stage 2: Builder
# ================================
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    python3 \
    make \
    g++

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copy application source
COPY . .

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV SKIP_ENV_VALIDATION=1

# Set dummy environment variables for build
# These will be replaced at runtime
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXTAUTH_SECRET="build-time-secret-min-32-chars-long-placeholder"
ENV NEXTAUTH_URL="http://localhost:3001"
ENV JWT_SECRET="build-jwt-secret"
ENV JWT_REFRESH_SECRET="build-refresh-secret"
ENV STRIPE_SECRET_KEY="sk_test_placeholder"
ENV ANTHROPIC_API_KEY="sk-ant-placeholder"
ENV OPENAI_API_KEY="sk-placeholder"

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js with standalone output for Docker optimization
# The standalone build includes only necessary files
RUN npm run build && \
    npm prune --production

# ================================
# Stage 3: Runner (Production)
# ================================
FROM node:20-alpine AS runner

# Install minimal runtime dependencies
RUN apk add --no-cache \
    openssl \
    ca-certificates \
    curl \
    dumb-init \
    netcat-openbsd && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy Next.js standalone output from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma files
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy package.json for version info
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3001

# Health check with proper error handling
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Use dumb-init for proper signal handling and start application
# Note: Prisma migrations are handled by docker-compose command
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
