import { pool } from './db';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Run database migrations
 */
async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info('Starting database migrations...');

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure consistent order

    logger.info(`Found ${migrationFiles.length} migration files`);

    for (const migrationFile of migrationFiles) {
      const migrationPath = path.join(migrationsDir, migrationFile);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

      logger.info(`Running migration: ${migrationFile}`);

      try {
        await client.query('BEGIN');

        // Split SQL into individual statements and execute them
        const statements = migrationSQL
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
          if (statement.trim()) {
            await client.query(statement);
          }
        }

        await client.query('COMMIT');
        logger.info(`✅ Migration ${migrationFile} completed successfully`);
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`❌ Migration ${migrationFile} failed:`, error);
        throw error;
      }
    }

    logger.info('All migrations completed successfully!');
  } catch (error) {
    logger.error('Migration process failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migration process finished');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration process failed:', error);
      process.exit(1);
    });
}

export { runMigrations };