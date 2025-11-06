const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedTestData() {
  try {
    console.log('🔄 Starting test data seeding...');
    console.log('📍 Database URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');

    // Create test user
    console.log('\n📝 Creating test user...');
    const hashedPassword = await bcrypt.hash('Test123!', 10);

    const user = await prisma.user.upsert({
      where: { email: 'test@restoreassist.com' },
      update: {
        password: hashedPassword,
        name: 'Test User',
        role: 'USER',
        hasCompletedOnboarding: true,
        subscriptionStatus: 'ACTIVE',
        creditsRemaining: 100
      },
      create: {
        email: 'test@restoreassist.com',
        name: 'Test User',
        password: hashedPassword,
        role: 'USER',
        hasCompletedOnboarding: true,
        subscriptionStatus: 'ACTIVE',
        creditsRemaining: 100
      },
    });

    console.log('✅ Test user created/updated successfully!');
    console.log('   Email: test@restoreassist.com');
    console.log('   Password: Test123!');
    console.log('   User ID:', user.id);
    console.log('   Role:', user.role);

    // Create test client associated with the user
    console.log('\n📝 Creating test client...');

    const client = await prisma.client.upsert({
      where: {
        id: 'test-insurance-client-1' // Using a stable ID for upsert
      },
      update: {
        name: 'Test Insurance Company',
        email: 'test@insurancecompany.com',
        phone: '+61 2 9876 5432',
        address: '123 Collins Street, Melbourne VIC 3000',
        company: 'Test Insurance Company',
        contactPerson: 'John Smith',
        notes: 'Test client for development',
        status: 'ACTIVE',
        userId: user.id
      },
      create: {
        id: 'test-insurance-client-1',
        name: 'Test Insurance Company',
        email: 'test@insurancecompany.com',
        phone: '+61 2 9876 5432',
        address: '123 Collins Street, Melbourne VIC 3000',
        company: 'Test Insurance Company',
        contactPerson: 'John Smith',
        notes: 'Test client for development',
        status: 'ACTIVE',
        userId: user.id
      }
    });

    console.log('✅ Test client created/updated successfully!');
    console.log('   Client Name:', client.name);
    console.log('   Client Email:', client.email);
    console.log('   Client ID:', client.id);
    console.log('   Associated User ID:', client.userId);

    // Verify the data
    console.log('\n🔍 Verifying test data...');

    const userCount = await prisma.user.count({
      where: { email: 'test@restoreassist.com' }
    });

    const clientCount = await prisma.client.count({
      where: { userId: user.id }
    });

    console.log(`   Found ${userCount} test user(s)`);
    console.log(`   Found ${clientCount} client(s) for test user`);

    console.log('\n✨ Test data seeding completed successfully!');
    console.log('\n🚀 You can now log in at: http://localhost:3001/login');
    console.log('   Email: test@restoreassist.com');
    console.log('   Password: Test123!');

    // Write success marker file
    const fs = require('fs');
    fs.writeFileSync('D:\\RestoreAssist\\db-connection-fixed.txt',
      `Database connection fixed and test data seeded at ${new Date().toISOString()}\n` +
      `User ID: ${user.id}\n` +
      `Client ID: ${client.id}\n`
    );
    console.log('\n✅ Created db-connection-fixed.txt marker file');

  } catch (error) {
    console.error('\n❌ Error seeding test data:', error.message);
    console.error('   Full error:', error);

    if (error.message.includes('Authentication failed') ||
        error.message.includes('P1000') ||
        error.message.includes('P1001')) {
      console.error('\n⚠️  Database connection failed!');
      console.error('   Please check your DATABASE_URL in .env');
      console.error('   Current URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedTestData().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});