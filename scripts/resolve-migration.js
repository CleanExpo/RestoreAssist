/**
 * Script to resolve failed migration on Digital Ocean
 * Run this before deployment if migration is stuck
 * 
 * Usage: node scripts/resolve-migration.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function resolveMigration() {
  try {
    console.log('Checking migration status...')
    
    // Mark the failed migration as rolled back so it can be retried
    // This allows the idempotent migration to run again
    await prisma.$executeRawUnsafe(`
      UPDATE "_prisma_migrations" 
      SET finished_at = NULL, 
          rolled_back_at = NOW(),
          logs = 'Manually rolled back to allow retry'
      WHERE migration_name = '20251215150840_chnage_the_schema'
      AND finished_at IS NULL
    `)
    
    console.log('✅ Migration marked as rolled back. It will be retried on next deployment.')
    console.log('The migration is now idempotent and will complete successfully.')
    
  } catch (error) {
    console.error('Error resolving migration:', error)
    console.log('\nIf the migration is not in _prisma_migrations table, it may have been partially applied.')
    console.log('The idempotent migration should handle this automatically.')
  } finally {
    await prisma.$disconnect()
  }
}

resolveMigration()

