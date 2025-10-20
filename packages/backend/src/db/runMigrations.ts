import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

import { db } from './connection';
import * as fs from 'fs';

/**
 * Run all pending database migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    console.log('🔄 Starting database migrations...');

    // Create migrations tracking table if it doesn't exist
    await db.none(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️  No migrations directory found');
      return;
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${migrationFiles.length} migration file(s)`);

    // Execute each migration
    for (const file of migrationFiles) {
      const version = file.replace('.sql', '');

      // Check if migration already executed
      const executed = await db.oneOrNone(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [version]
      );

      if (executed) {
        console.log(`⏭️  Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`▶️  Executing ${file}...`);

      // Read and execute migration SQL
      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf-8');

      await db.none(sql);

      // Record migration as executed
      await db.none(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      );

      console.log(`✅ Completed ${file}`);
    }

    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback the last migration (for development)
 */
export async function rollbackLastMigration(): Promise<void> {
  try {
    const lastMigration = await db.oneOrNone(
      'SELECT version FROM schema_migrations ORDER BY executed_at DESC LIMIT 1'
    );

    if (!lastMigration) {
      console.log('No migrations to rollback');
      return;
    }

    console.log(`🔄 Rolling back migration: ${lastMigration.version}`);

    // Delete migration record
    await db.none(
      'DELETE FROM schema_migrations WHERE version = $1',
      [lastMigration.version]
    );

    console.log(`✅ Rolled back ${lastMigration.version}`);
    console.log('⚠️  Note: This only removes the migration record. Manual cleanup may be needed.');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'rollback') {
    rollbackLastMigration()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    runMigrations()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}
