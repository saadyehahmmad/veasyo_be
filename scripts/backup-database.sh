#!/bin/bash
# Database Backup Script
# This script creates a backup of the PostgreSQL database
# Usage: ./backup-database.sh [backup_directory]

set -e  # Exit on error

# Configuration
BACKUP_DIR="${1:-/backups/waiter-saas}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sql.gz"
RETENTION_DAYS=30

# Database configuration from environment or defaults
DB_HOST="${DATABASE_HOST:-postgres}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-postgres}"
DB_NAME="${DATABASE_NAME:-waiter_saas}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting database backup..."
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "Backup file: $BACKUP_FILE"

# Create backup using pg_dump
# Using docker-compose exec if running in Docker, otherwise direct pg_dump
if command -v docker-compose &> /dev/null; then
  # Running in Docker environment
  docker-compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
else
  # Running directly (not in Docker)
  PGPASSWORD="${DATABASE_PASSWORD:-postgres}" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
fi

# Check if backup was successful
if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup completed successfully!"
  echo "   File: $BACKUP_FILE"
  echo "   Size: $BACKUP_SIZE"
  
  # Clean up old backups (keep only last RETENTION_DAYS days)
  echo "Cleaning up backups older than $RETENTION_DAYS days..."
  find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
  echo "✅ Cleanup completed"
  
  # List remaining backups
  BACKUP_COUNT=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f | wc -l)
  echo "Total backups: $BACKUP_COUNT"
else
  echo "❌ Backup failed!"
  exit 1
fi

