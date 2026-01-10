const https = require("https")

// Use Supabase REST API to execute the SQL
const supabaseProject = "oxeiaavuspvpvanzcrjc"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94ZWlhYXZ1c3B2cHZhbnpjcmpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDY4MzY3ODAsImV4cCI6MTk2MjQxMjc4MH0.3lJgHkEk1VJe1sL9e5Ey8a1pX2y3Z4a5B6c7D8e9F0"

const sql = `
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hasPremiumInspectionReports" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "User_hasPremiumInspectionReports_idx" ON "User"("hasPremiumInspectionReports");
`

const options = {
  hostname: `${supabaseProject}.supabase.co`,
  port: 443,
  path: "/rest/v1/rpc/query",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  },
}

const req = https.request(options, (res) => {
  let data = ""

  res.on("data", (chunk) => {
    data += chunk
  })

  res.on("end", () => {
    console.log("Response status:", res.statusCode)
    console.log("Response:", data)
    process.exit(res.statusCode === 200 ? 0 : 1)
  })
})

req.on("error", (error) => {
  console.error("Error:", error.message)
  process.exit(1)
})

// Send the SQL
req.write(JSON.stringify({ query: sql }))
req.end()
