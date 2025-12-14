# Database Backup Script for Windows PowerShell
# This script creates a backup of the PostgreSQL database
# Usage: .\backup-database.ps1 [backup_directory]

param(
    [string]$BackupDir = "C:\backups\waiter-saas"
)

# Configuration
$Date = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "backup_$Date.sql.gz"
$RetentionDays = 30

# Database configuration from environment or defaults
$DbHost = if ($env:DATABASE_HOST) { $env:DATABASE_HOST } else { "postgres" }
$DbPort = if ($env:DATABASE_PORT) { $env:DATABASE_PORT } else { "5432" }
$DbUser = if ($env:DATABASE_USER) { $env:DATABASE_USER } else { "postgres" }
$DbName = if ($env:DATABASE_NAME) { $env:DATABASE_NAME } else { "waiter_saas" }
$DbPassword = if ($env:DATABASE_PASSWORD) { $env:DATABASE_PASSWORD } else { "postgres" }

# Create backup directory if it doesn't exist
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host "Starting database backup..."
Write-Host "Database: $DbName"
Write-Host "Host: $DbHost:$DbPort"
Write-Host "Backup file: $BackupFile"

# Create backup using docker-compose or pg_dump
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    # Running in Docker environment
    docker-compose exec -T postgres pg_dump -U $DbUser $DbName | gzip > $BackupFile
} elseif (Get-Command pg_dump -ErrorAction SilentlyContinue) {
    # Running directly (not in Docker)
    $env:PGPASSWORD = $DbPassword
    pg_dump -h $DbHost -p $DbPort -U $DbUser $DbName | gzip > $BackupFile
} else {
    Write-Host "❌ Error: Neither docker-compose nor pg_dump found"
    exit 1
}

# Check if backup was successful
if (Test-Path $BackupFile -PathType Leaf) {
    $BackupSize = (Get-Item $BackupFile).Length / 1MB
    Write-Host "✅ Backup completed successfully!"
    Write-Host "   File: $BackupFile"
    Write-Host "   Size: $([math]::Round($BackupSize, 2)) MB"
    
    # Clean up old backups
    Write-Host "Cleaning up backups older than $RetentionDays days..."
    $CutoffDate = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -Path $BackupDir -Filter "backup_*.sql.gz" | 
        Where-Object { $_.LastWriteTime -lt $CutoffDate } | 
        Remove-Item -Force
    
    # List remaining backups
    $BackupCount = (Get-ChildItem -Path $BackupDir -Filter "backup_*.sql.gz").Count
    Write-Host "✅ Cleanup completed"
    Write-Host "Total backups: $BackupCount"
} else {
    Write-Host "❌ Backup failed!"
    exit 1
}

