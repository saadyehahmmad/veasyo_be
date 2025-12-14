#!/bin/bash
# Database Restore Script
# This script restores a PostgreSQL database from a backup file
# Usage: ./restore-database.sh <backup_file> [--confirm]

set -e  # Exit on error

# Check if backup file is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <backup_file> [--confirm]"
  echo "Example: $0 /backups/waiter-saas/backup_20240101_120000.sql.gz --confirm"
  exit 1
fi

BACKUP_FILE="$1"
CONFIRM="$2"

# Database configuration from environment or defaults
DB_HOST="${DATABASE_HOST:-postgres}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-postgres}"
DB_NAME="${DATABASE_NAME:-waiter_saas}"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Check if file is compressed
if [[ "$BACKUP_FILE" == *.gz ]]; then
  DECOMPRESS="gunzip -c"
else
  DECOMPRESS="cat"
fi

# Safety confirmation
if [ "$CONFIRM" != "--confirm" ]; then
  echo "⚠️  WARNING: This will overwrite the database: $DB_NAME"
  echo "   Backup file: $BACKUP_FILE"
  echo ""
  echo "   This operation cannot be undone!"
  echo ""
  read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation
  if [ "$confirmation" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
  fi
fi

echo "Starting database restore..."
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "Backup file: $BACKUP_FILE"

# Create backup of current database before restore (safety measure)
CURRENT_BACKUP="/tmp/pre-restore-backup_$(date +%Y%m%d_%H%M%S).sql.gz"
echo "Creating safety backup of current database..."
if command -v docker-compose &> /dev/null; then
  docker-compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$CURRENT_BACKUP"
else
  PGPASSWORD="${DATABASE_PASSWORD:-postgres}" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" | gzip > "$CURRENT_BACKUP"
fi
echo "✅ Safety backup created: $CURRENT_BACKUP"

# Restore database
echo "Restoring database..."
if command -v docker-compose &> /dev/null; then
  # Running in Docker environment
  $DECOMPRESS "$BACKUP_FILE" | docker-compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME"
else
  # Running directly (not in Docker)
  $DECOMPRESS "$BACKUP_FILE" | PGPASSWORD="${DATABASE_PASSWORD:-postgres}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
fi

echo "✅ Database restore completed successfully!"
echo "   Safety backup: $CURRENT_BACKUP"

