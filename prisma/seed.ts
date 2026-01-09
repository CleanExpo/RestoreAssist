/**
 * Prisma Seed Script
 *
 * This is the entry point for `prisma db seed`
 * It will run the regulatory documents seeding script
 */

import { execSync } from 'child_process'

try {
  console.log('Running regulatory documents seeding...')
  execSync('npx ts-node scripts/seed-regulatory-documents.ts', {
    stdio: 'inherit',
  })
} catch (error) {
  console.error('Seeding failed:', error)
  process.exit(1)
}
