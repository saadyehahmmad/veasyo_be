import { pool } from './db';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Split SQL into individual statements, handling PostgreSQL dollar quoting
 */
function splitSQLStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarQuoteStart = '';
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const nextChar = sql[i + 1] || '';

    // Check for start of dollar quote
    if (!inDollarQuote && char === '$' && nextChar === '$') {
      inDollarQuote = true;
      dollarQuoteStart = '$$';
      currentStatement += '$$';
      i += 2;
      continue;
    }

    // Check for end of dollar quote
    if (inDollarQuote && char === '$' && nextChar === '$') {
      inDollarQuote = false;
      dollarQuoteStart = '';
      currentStatement += '$$';
      i += 2;
      continue;
    }

    // If we're in a dollar quote, just add the character
    if (inDollarQuote) {
      currentStatement += char;
      i++;
      continue;
    }

    // Check for semicolon outside of quotes
    if (char === ';') {
      currentStatement += char;
      const trimmed = currentStatement.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
      currentStatement = '';
      i++;
      continue;
    }

    currentStatement += char;
    i++;
  }

  // Add any remaining statement
  const trimmed = currentStatement.trim();
  if (trimmed && !trimmed.startsWith('--')) {
    statements.push(trimmed);
  }

  return statements;
}

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

      // Skip full_migration.sql if tables already exist
      if (migrationFile === 'full_migration.sql') {
        try {
          const result = await client.query("SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
          const tableCount = parseInt(result.rows[0].table_count);
          if (tableCount > 0) {
            logger.info(`Skipping ${migrationFile} - tables already exist (${tableCount} tables found)`);
            continue;
          }
        } catch (error) {
          // If we can't check, proceed with migration
          logger.warn(`Could not check for existing tables, proceeding with ${migrationFile}`);
        }
      }

      try {
        await client.query('BEGIN');

        // Check if the migration contains functions (dollar quoting)
        const hasFunctions = migrationSQL.includes('$$');
        
        if (hasFunctions) {
          // Execute the entire migration as one statement
          logger.info(`Executing entire migration ${migrationFile} as one statement (contains functions)`);
          await client.query(migrationSQL);
        } else {
          // Split SQL into individual statements and execute them
          const statements = splitSQLStatements(migrationSQL);

          for (const statement of statements) {
            if (statement.trim()) {
              await client.query(statement);
            }
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