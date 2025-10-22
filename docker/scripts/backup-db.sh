#!/bin/bash
# ============================================
# PostgreSQL Backup Script
# Creates timestamped database backups
# ============================================

set -e

# Configuration
CONTAINER_NAME="restoreassist-postgres"
DB_NAME="${POSTGRES_DB:-restoreassist}"
DB_USER="${POSTGRES_USER:-restoreassist}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "🔄 Starting PostgreSQL backup..."
echo "📅 Timestamp: $TIMESTAMP"

# Create backup
docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"

echo "✅ Backup completed: ${BACKUP_FILE}.gz"

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +30 -delete

echo "🧹 Cleaned up old backups (>30 days)"
echo "✅ Backup process complete!"
