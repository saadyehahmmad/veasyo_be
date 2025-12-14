#!/bin/bash
# Setup Automated Backup Cron Job
# This script sets up a cron job for automated database backups
# Usage: ./setup-backup-cron.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-database.sh"
BACKUP_DIR="${BACKUP_DIR:-/backups/waiter-saas}"

# Check if backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "❌ Error: Backup script not found: $BACKUP_SCRIPT"
  exit 1
fi

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Cron job entry (daily at 2 AM)
CRON_JOB="0 2 * * * $BACKUP_SCRIPT $BACKUP_DIR >> /var/log/waiter-backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
  echo "⚠️  Cron job already exists. Skipping..."
else
  # Add cron job
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  echo "✅ Cron job added successfully!"
  echo "   Schedule: Daily at 2:00 AM"
  echo "   Backup directory: $BACKUP_DIR"
fi

# Show current crontab
echo ""
echo "Current crontab:"
crontab -l

echo ""
echo "✅ Backup cron job setup complete!"
echo ""
echo "To verify backups are running:"
echo "  tail -f /var/log/waiter-backup.log"
echo ""
echo "To list backups:"
echo "  $SCRIPT_DIR/list-backups.sh $BACKUP_DIR"

