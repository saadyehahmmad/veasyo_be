#!/bin/bash
# List Database Backups
# This script lists all available database backups
# Usage: ./list-backups.sh [backup_directory]

BACKUP_DIR="${1:-/backups/waiter-saas}"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Backup directory not found: $BACKUP_DIR"
  exit 1
fi

echo "Database Backups in: $BACKUP_DIR"
echo "=================================="
echo ""

# List backups with details
BACKUP_COUNT=0
TOTAL_SIZE=0

for backup in "$BACKUP_DIR"/backup_*.sql.gz; do
  if [ -f "$backup" ]; then
    BACKUP_COUNT=$((BACKUP_COUNT + 1))
    FILENAME=$(basename "$backup")
    SIZE=$(du -h "$backup" | cut -f1)
    DATE=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$backup" 2>/dev/null || stat -c "%y" "$backup" 2>/dev/null | cut -d'.' -f1)
    SIZE_BYTES=$(stat -f "%z" "$backup" 2>/dev/null || stat -c "%s" "$backup" 2>/dev/null)
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE_BYTES))
    
    printf "%-30s %10s %19s\n" "$FILENAME" "$SIZE" "$DATE"
  fi
done

if [ $BACKUP_COUNT -eq 0 ]; then
  echo "No backups found."
else
  echo ""
  echo "Total backups: $BACKUP_COUNT"
  TOTAL_SIZE_MB=$((TOTAL_SIZE / 1024 / 1024))
  echo "Total size: ${TOTAL_SIZE_MB}MB"
fi

