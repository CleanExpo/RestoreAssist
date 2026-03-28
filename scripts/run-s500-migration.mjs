/**
 * Apply the S500:2025 compliance migration to Supabase
 * Uses Prisma.$executeRawUnsafe to bypass cross-schema FK introspection error
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

const sqlPath = join(__dirname, '..', 'prisma', 'migrations', '20260328000000_add_s500_compliance', 'migration.sql')
const fullSql = readFileSync(sqlPath, 'utf-8')

const MIGRATION_NAME = '20260328000000_add_s500_compliance'

function removeLineComments(sql) {
  return sql.split('\n')
    .map(line => {
      const commentIdx = line.indexOf('--')
      if (commentIdx === -1) return line
      return line.substring(0, commentIdx)
    })
    .join('\n')
}

function splitStatements(sql) {
  const cleaned = removeLineComments(sql)
  const statements = []
  let current = ''
  let inDollarQuote = false

  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '$' && cleaned[i+1] === '$') {
      inDollarQuote = !inDollarQuote
      current += '$$'
      i++
      continue
    }
    if (!inDollarQuote && cleaned[i] === ';') {
      const stmt = current.trim()
      if (stmt.length > 5) statements.push(stmt)
      current = ''
    } else {
      current += cleaned[i]
    }
  }
  const last = current.trim()
  if (last.length > 5) statements.push(last)
  return statements
}

async function run() {
  console.log('Connecting to Supabase via Prisma...')

  // Check if already applied
  try {
    const existing = await prisma.$queryRaw`
      SELECT id FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} LIMIT 1
    `
    if (Array.isArray(existing) && existing.length > 0) {
      console.log(`Migration '${MIGRATION_NAME}' already recorded in _prisma_migrations — skipping SQL execution.`)
      await prisma.$disconnect()
      return
    }
  } catch (e) {
    console.log('Could not check migration table:', e.message)
  }

  const statements = splitStatements(fullSql)
  console.log(`Found ${statements.length} SQL statements to execute\n`)

  let passed = 0, failed = 0
  const errors = []

  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, ' ').substring(0, 80)
    try {
      await prisma.$executeRawUnsafe(stmt)
      process.stdout.write('.')
      passed++
    } catch (err) {
      const msg = err.message || ''
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate_object') ||
        msg.includes('column') && msg.includes('already') ||
        (msg.includes('does not exist') && stmt.includes('DROP'))
      ) {
        process.stdout.write('~')
        passed++
      } else {
        process.stdout.write('✗')
        failed++
        errors.push({ stmt: preview, error: msg.split('\n')[0] })
      }
    }
  }

  console.log('\n')
  console.log(`✅ Passed/Skipped: ${passed}  ❌ Failed: ${failed}`)

  if (errors.length > 0) {
    console.log('\nFailures:')
    for (const e of errors) {
      console.log(`  • ${e.stmt}`)
      console.log(`    → ${e.error}`)
    }
  } else {
    console.log('\n🎉 S500 migration applied successfully!')

    // Record in _prisma_migrations
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        SELECT
          gen_random_uuid()::text,
          'S500-compliance-manual',
          NOW(),
          '${MIGRATION_NAME}',
          NULL,
          NULL,
          NOW(),
          1
        WHERE NOT EXISTS (
          SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION_NAME}'
        )
      `)
      console.log('✅ Migration recorded in _prisma_migrations')
    } catch (e) {
      console.log('⚠️  Could not record migration (non-fatal):', e.message)
    }
  }

  await prisma.$disconnect()
}

run().catch(async e => {
  console.error('Fatal:', e.message)
  await prisma.$disconnect()
  process.exit(1)
})
