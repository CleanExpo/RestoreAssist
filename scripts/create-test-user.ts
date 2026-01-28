import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@local.dev';
  const password = 'password';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Use raw SQL to avoid schema mismatch issues
  const result = await prisma.$executeRaw`
    INSERT INTO "User" (id, email, name, password, role, "emailVerified", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      ${email},
      'Test Admin',
      ${hashedPassword},
      'ADMIN',
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (email)
    DO UPDATE SET password = ${hashedPassword}
    RETURNING email;
  `;

  console.log('✅ User created/updated successfully!');
  console.log('📧 Email:', email);
  console.log('🔑 Password:', password);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
