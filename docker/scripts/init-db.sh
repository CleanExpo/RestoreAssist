#!/bin/bash
# ============================================
# Database Initialization Script
# Run Prisma migrations on container startup
# ============================================

set -e

echo "🔧 Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -U restoreassist; do
  echo "⏳ PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✅ PostgreSQL is ready!"

echo "📦 Running Prisma migrations..."
npx prisma migrate deploy

echo "🌱 Generating Prisma Client..."
npx prisma generate

echo "✅ Database initialization complete!"
