/**
 * Test User Verification Script
 * Verifies if test@restoreassist.com exists in the database
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function verifyTestUser() {
  console.log('\n=== Test User Verification ===\n');

  try {
    // Check if user exists
    console.log('1. Checking if test user exists...');
    const user = await prisma.user.findUnique({
      where: { email: 'test@restoreassist.com' },
      include: {
        accounts: true,
        sessions: true
      }
    });

    if (!user) {
      console.log('❌ Test user NOT found in database');
      console.log('\n2. Creating test user...');

      const hashedPassword = await bcrypt.hash('Test123!@#', 10);

      const newUser = await prisma.user.create({
        data: {
          email: 'test@restoreassist.com',
          name: 'Test User',
          password: hashedPassword,
          emailVerified: new Date(),
          role: 'USER'
        }
      });

      console.log('✓ Test user created:', {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      });
    } else {
      console.log('✓ Test user found:', {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        hasPassword: !!user.password,
        accountsCount: user.accounts.length,
        sessionsCount: user.sessions.length
      });

      // Verify password
      if (user.password) {
        console.log('\n2. Verifying password...');
        const passwordValid = await bcrypt.compare('Test123!@#', user.password);
        console.log(passwordValid ? '✓ Password is valid' : '❌ Password is invalid');

        if (!passwordValid) {
          console.log('\n3. Updating password...');
          const hashedPassword = await bcrypt.hash('Test123!@#', 10);
          await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
          });
          console.log('✓ Password updated');
        }
      } else {
        console.log('\n⚠ User has no password, setting one...');
        const hashedPassword = await bcrypt.hash('Test123!@#', 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword }
        });
        console.log('✓ Password set');
      }
    }

    // Check all users
    console.log('\n4. All users in database:');
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true
      }
    });

    console.table(allUsers);

    console.log('\n=== Test User Ready ===');
    console.log('Email: test@restoreassist.com');
    console.log('Password: Test123!@#');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyTestUser();
