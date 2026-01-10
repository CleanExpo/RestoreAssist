const { execSync } = require("child_process")

// Try to run the migration deploy with a specific connection string
const env = {
  ...process.env,
  DIRECT_URL:
    "postgresql://postgres:SHev3MgZxkQyf2px@db.oxeiaavuspvpvanzcrjc.supabase.co:5432/postgres?sslmode=require",
}

console.log("Testing database connection and checking migration status...")
try {
  const output = execSync("npx prisma migrate status", {
    cwd: "D:\\RestoreAssist",
    env,
    encoding: "utf-8",
    stdio: "pipe",
  })
  console.log("Migration status output:")
  console.log(output)
} catch (error) {
  console.error("Error:", error.message)
  if (error.stdout) console.error("stdout:", error.stdout.toString())
  if (error.stderr) console.error("stderr:", error.stderr.toString())
}
