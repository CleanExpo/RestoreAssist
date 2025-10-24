const { Client } = require('pg');

async function testConnection() {
  const client = new Client({
    host: 'localhost',
    port: 5433,
    database: 'restoreassist',
    user: 'restoreassist',
    password: 'dev_password_change_me'
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    const result = await client.query('SELECT NOW() as time, current_database() as db');
    console.log('✅ Connection successful!');
    console.log('Database:', result.rows[0].db);
    console.log('Server time:', result.rows[0].time);

    await client.end();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();