const { spawnSync } = require("child_process")
const path = require("path")

// Try to run the migration deploy with a specific connection string
const env = {
  ...process.env,
  DIRECT_URL:
    "postgresql://postgres:SHev3MgZxkQyf2px@db.oxeiaavuspvpvanzcrjc.supabase.co:5432/postgres?sslmode=require",
}

console.log("Testing database connection...")
const result = spawnSync("npx", ["prisma", "migrate", "status"], {
  cwd: "D:\\RestoreAssist",
  env,
  stdio: "inherit",
})

console.log("Exit code:", result.status)
