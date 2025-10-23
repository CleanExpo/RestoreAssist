import 'dotenv/config';
import { db } from '../db/connection';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  try {
    console.log('🔄 Running email/password authentication migration...');

    const migrationPath = path.join(__dirname, '../migrations/002_add_email_password_auth.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Run migration
    await db.none(sql);

    console.log('✅ Migration completed successfully!');
    console.log('📝 Added password_hash column to users table');
    console.log('📝 Made google_id nullable for email/password users');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
