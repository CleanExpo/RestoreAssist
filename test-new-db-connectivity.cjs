const { PrismaClient } = require('@prisma/client');

// Test connection formats
const connectionFormats = [
  {
    name: 'Direct connection (port 5432)',
    url: 'postgresql://postgres:l9EtTU9JsvJCpMNL@db.udooysjajglluvuxkijp.supabase.co:5432/postgres'
  },
  {
    name: 'Pooled connection (port 6543)',
    url: 'postgresql://postgres:l9EtTU9JsvJCpMNL@db.udooysjajglluvuxkijp.supabase.co:6543/postgres'
  },
  {
    name: 'Direct with SSL required',
    url: 'postgresql://postgres:l9EtTU9JsvJCpMNL@db.udooysjajglluvuxkijp.supabase.co:5432/postgres?sslmode=require'
  },
  {
    name: 'Direct with SSL and timeout',
    url: 'postgresql://postgres:l9EtTU9JsvJCpMNL@db.udooysjajglluvuxkijp.supabase.co:5432/postgres?sslmode=require&connect_timeout=10'
  },
  {
    name: 'Pooled with SSL required',
    url: 'postgresql://postgres:l9EtTU9JsvJCpMNL@db.udooysjajglluvuxkijp.supabase.co:6543/postgres?sslmode=require'
  },
  {
    name: 'Pooler format (aws-0, port 5432)',
    url: 'postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
  },
  {
    name: 'Pooler format (aws-0, port 6543)',
    url: 'postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres'
  },
  {
    name: 'Pooler format (aws-1, port 5432)',
    url: 'postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres'
  },
  {
    name: 'Direct with pgbouncer mode',
    url: 'postgresql://postgres:l9EtTU9JsvJCpMNL@db.udooysjajglluvuxkijp.supabase.co:6543/postgres?pgbouncer=true'
  },
  {
    name: 'Transaction mode pooler',
    url: 'postgresql://postgres.udooysjajglluvuxkijp:l9EtTU9JsvJCpMNL@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
  }
];

async function testConnection(name, url) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url.replace(/:[^:@]+@/, ':****@')}`); // Hide password in logs
  console.log('='.repeat(80));

  const startTime = Date.now();
  let prisma;

  try {
    // Create Prisma client with this connection URL
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: url
        }
      },
      log: ['error', 'warn']
    });

    console.log('⏳ Attempting connection...');

    // Test connection with a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test, version() as pg_version`;

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('✅ CONNECTION SUCCESSFUL!');
    console.log(`⏱️  Connection time: ${duration}ms`);
    console.log('📊 Query result:', result);

    // Try to get more info about the database
    try {
      const dbInfo = await prisma.$queryRaw`
        SELECT
          current_database() as database_name,
          current_user as current_user,
          inet_server_addr() as server_ip,
          inet_server_port() as server_port
      `;
      console.log('🔍 Database info:', dbInfo);
    } catch (infoError) {
      console.log('⚠️  Could not fetch additional database info:', infoError.message);
    }

    return { success: true, duration, name, url };

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('❌ CONNECTION FAILED');
    console.log(`⏱️  Failed after: ${duration}ms`);
    console.log('❌ Error code:', error.code);
    console.log('❌ Error message:', error.message);

    if (error.message.includes('timeout')) {
      console.log('⚠️  This appears to be a timeout issue');
    }
    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.log('⚠️  DNS resolution failed - host might be unreachable');
    }
    if (error.message.includes('ECONNREFUSED')) {
      console.log('⚠️  Connection refused - port might be closed or service not running');
    }
    if (error.message.includes('authentication')) {
      console.log('⚠️  Authentication issue - credentials might be incorrect');
    }

    return { success: false, duration, name, url, error: error.message };

  } finally {
    if (prisma) {
      await prisma.$disconnect();
      console.log('🔌 Disconnected');
    }
  }
}

async function runAllTests() {
  console.log('\n' + '🔬'.repeat(40));
  console.log('SUPABASE DATABASE CONNECTIVITY TEST SUITE');
  console.log('Database: udooysjajglluvuxkijp');
  console.log('🔬'.repeat(40));

  const results = [];

  for (const config of connectionFormats) {
    const result = await testConnection(config.name, config.url);
    results.push(result);

    // Wait a bit between tests to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n\n' + '📊'.repeat(40));
  console.log('TEST SUMMARY');
  console.log('📊'.repeat(40));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful connections: ${successful.length}/${results.length}`);

  if (successful.length > 0) {
    console.log('\n🎉 WORKING CONNECTION FORMATS:');
    successful.forEach(r => {
      console.log(`  ✓ ${r.name} (${r.duration}ms)`);
      console.log(`    ${r.url.replace(/:[^:@]+@/, ':****@')}`);
    });

    // Recommend the fastest successful connection
    const fastest = successful.reduce((prev, current) =>
      (prev.duration < current.duration) ? prev : current
    );
    console.log(`\n⚡ RECOMMENDED: ${fastest.name} (${fastest.duration}ms)`);
    console.log(`   Use this URL in your .env file:`);
    console.log(`   DATABASE_URL="${fastest.url}"`);
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed connections: ${failed.length}/${results.length}`);
    console.log('\n🔍 FAILURE ANALYSIS:');

    // Group failures by error type
    const timeouts = failed.filter(r => r.error.includes('timeout'));
    const dnsErrors = failed.filter(r => r.error.includes('ENOTFOUND') || r.error.includes('getaddrinfo'));
    const refused = failed.filter(r => r.error.includes('ECONNREFUSED'));
    const authErrors = failed.filter(r => r.error.includes('authentication'));
    const otherErrors = failed.filter(r =>
      !r.error.includes('timeout') &&
      !r.error.includes('ENOTFOUND') &&
      !r.error.includes('getaddrinfo') &&
      !r.error.includes('ECONNREFUSED') &&
      !r.error.includes('authentication')
    );

    if (timeouts.length > 0) {
      console.log(`  ⏱️  Timeouts: ${timeouts.length}`);
    }
    if (dnsErrors.length > 0) {
      console.log(`  🌐 DNS resolution failures: ${dnsErrors.length}`);
    }
    if (refused.length > 0) {
      console.log(`  🚫 Connection refused: ${refused.length}`);
    }
    if (authErrors.length > 0) {
      console.log(`  🔐 Authentication errors: ${authErrors.length}`);
    }
    if (otherErrors.length > 0) {
      console.log(`  ❓ Other errors: ${otherErrors.length}`);
      otherErrors.forEach(r => {
        console.log(`     - ${r.name}: ${r.error.substring(0, 100)}`);
      });
    }
  }

  if (successful.length === 0) {
    console.log('\n\n⚠️  NO WORKING CONNECTIONS FOUND');
    console.log('\nPossible issues:');
    console.log('  1. Database might not be fully provisioned yet');
    console.log('  2. Network/firewall might be blocking connections');
    console.log('  3. Credentials might be incorrect');
    console.log('  4. Database might be paused or unavailable');
    console.log('\nNext steps:');
    console.log('  - Check Supabase dashboard for database status');
    console.log('  - Verify credentials in Supabase settings');
    console.log('  - Check if database pooler is enabled');
    console.log('  - Try connecting from Supabase SQL editor first');
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test completed at:', new Date().toISOString());
  console.log('='.repeat(80) + '\n');
}

// Run the tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
