/**
 * Run pending migrations directly against Supabase using Prisma client
 * Bypasses prisma migrate dev (which fails due to auth.users cross-schema FK)
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

const sqlPath = join(__dirname, '..', 'prisma', 'migrations', 'pending_migrations_combined.sql')
const fullSql = readFileSync(sqlPath, 'utf-8')

// Remove single-line comments to avoid `;` inside comments breaking the parser
function removeLineComments(sql) {
  return sql.split('\n')
    .map(line => {
      const commentIdx = line.indexOf('--')
      if (commentIdx === -1) return line
      return line.substring(0, commentIdx)
    })
    .join('\n')
}

// Split SQL into individual statements, respecting $$ dollar-quote blocks
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
      // Idempotent — skip if already exists or already done
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate_object') ||
        (msg.includes('does not exist') && (stmt.includes('DROP')))
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
    console.log('\n🎉 All pending migrations applied successfully!')
  }

  await prisma.$disconnect()
}

run().catch(async e => {
  console.error('Fatal:', e.message)
  await prisma.$disconnect()
  process.exit(1)
})
