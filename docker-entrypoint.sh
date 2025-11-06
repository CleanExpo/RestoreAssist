#!/bin/sh
set -e

echo "🐳 Starting RestoreAssist Docker Container..."
echo "Environment: $NODE_ENV"
echo "Port: $PORT"

# Wait for database to be ready
echo "Waiting for PostgreSQL to be ready..."
until nc -z postgres 5432 2>/dev/null; do
  echo "Waiting for database connection..."
  sleep 2
done

echo "✅ Database is ready!"

# Run Prisma migrations
echo "Running Prisma migrations..."
npx prisma migrate deploy || {
  echo "⚠️  Warning: Prisma migrations failed. This is expected if the database already has the schema."
}

echo "🚀 Starting Next.js application..."
exec node server.js
