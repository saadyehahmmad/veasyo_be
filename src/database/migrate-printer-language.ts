import { pool } from './db';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Run the printer language migration specifically
 */
async function runPrinterLanguageMigration() {
  const client = await pool.connect();

  try {
    logger.info('Running printer language migration...');

    const migrationPath = path.join(__dirname, 'migrations', 'add_printer_language_migration.sql');

    if (!fs.existsSync(migrationPath)) {
      throw new Error('Migration file not found: add_printer_language_migration.sql');
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    logger.info('Executing printer language migration...');

    await client.query('BEGIN');

    // Split SQL into individual statements and execute them
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        logger.info(`Executing: ${statement.substring(0, 50)}...`);
        await client.query(statement);
      }
    }

    await client.query('COMMIT');
    logger.info('✅ Printer language migration completed successfully!');

    // Verify the migration worked
    const result = await client.query(`
      SELECT COUNT(*) as updated_tenants
      FROM tenants
      WHERE settings->'integrations'->'printer'->>'language' = 'both'
    `);

    logger.info(`Updated ${result.rows[0].updated_tenants} tenants with language field`);

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Printer language migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runPrinterLanguageMigration()
    .then(() => {
      logger.info('Printer language migration finished');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Printer language migration failed:', error);
      process.exit(1);
    });
}

export { runPrinterLanguageMigration };