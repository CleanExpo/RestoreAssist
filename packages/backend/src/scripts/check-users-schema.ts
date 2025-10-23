import 'dotenv/config';
import { db } from '../db/connection';

async function checkSchema() {
  try {
    console.log('🔍 Checking users table schema...\n');

    const columns = await db.any(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('Users table columns:');
    console.table(columns);

    const hasPasswordHash = columns.some((col: any) => col.column_name === 'password_hash');

    if (hasPasswordHash) {
      console.log('\n✅ password_hash column EXISTS');
    } else {
      console.log('\n❌ password_hash column MISSING');
      console.log('\nTo fix, run: npm run migrate:email-auth');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSchema();
