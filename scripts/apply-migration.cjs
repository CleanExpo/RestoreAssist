const { execSync } = require("child_process")

// Use the correct production Supabase project credentials
const env = {
  ...process.env,
  DIRECT_URL:
    "postgresql://postgres:sTGCFxQ6QYYq0Fz8@db.stielawqvxnzd7c.supabase.co:5432/postgres?sslmode=require",
}

console.log("Applying migration to production database (stielawqvxnzd7c)...")
try {
  const output = execSync("npx prisma migrate deploy", {
    cwd: "D:\\RestoreAssist",
    env,
    encoding: "utf-8",
    stdio: "pipe",
  })
  console.log("Migration successful!")
  console.log(output)
} catch (error) {
  console.error("Error applying migration:")
  console.error(error.message)
  if (error.stdout) console.log("stdout:", error.stdout.toString())
  if (error.stderr) console.log("stderr:", error.stderr.toString())
}
