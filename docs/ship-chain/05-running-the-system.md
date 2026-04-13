# 05 — Running the System

> **Series:** [Ship Chain](./00-index.md) · Document 5 of 5

This document covers local setup, required environment variables, submitting your first brief, and the smoke test that confirms everything is wired correctly.

---

## Prerequisites

```bash
# Node 20+, pnpm 9+
node --version   # v20.x
pnpm --version   # 9.x

# Clone and install
git clone https://github.com/CleanExpo/RestoreAssist
cd RestoreAssist
pnpm install
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in these values.
The gate check and brief template APIs require the first three.

| Variable             | Required | Purpose                                     |
| -------------------- | -------- | ------------------------------------------- |
| `ANTHROPIC_API_KEY`  | Yes      | Gate check evaluator (Claude Haiku)         |
| `DATABASE_URL`       | Yes      | Prisma — Supabase connection string         |
| `NEXTAUTH_SECRET`    | Yes      | Session auth for all `/api/harness/` routes |
| `TELEGRAM_BOT_TOKEN` | Optional | FLAG/RETRY alerts                           |
| `TELEGRAM_CHAT_ID`   | Optional | FLAG/RETRY alerts                           |

All other variables are listed in `.env.example`.

---

## Database Setup

The `GateCheck` table must exist before you call the evaluator.

```bash
# Generate Prisma client
pnpm prisma:generate

# Apply all pending migrations
pnpm build   # runs migrate deploy internally
# or locally:
npx prisma migrate dev
```

Verify the table exists:

```bash
pnpm db:studio
# Opens Prisma Studio at localhost:5555
# Navigate to GateCheck — should show an empty table
```

---

## Start the Dev Server

```bash
pnpm dev
# Server starts at localhost:3000
```

---

## First Brief: Fetch the Templates

Confirm the brief templates API is working:

```bash
curl -s http://localhost:3000/api/harness/brief-templates \
  -H "Cookie: <your session cookie>" | jq '.data[].tier'
# "basic"
# "detailed"
# "advanced"
```

Or fetch a single tier:

```bash
curl -s "http://localhost:3000/api/harness/brief-templates?tier=basic" \
  -H "Cookie: <your session cookie>" | jq '.data[0].fields[].name'
# "title"
# "description"
# "repo"
```

Source: `app/api/harness/brief-templates/route.ts`

---

## Smoke Test: Run a Gate Check

Submit a minimal evaluation to confirm the evaluator is wired end-to-end:

```bash
curl -s -X POST http://localhost:3000/api/harness/gate-check \
  -H "Content-Type: application/json" \
  -H "Cookie: <your session cookie>" \
  -d '{
    "projectKey": "report-builder",
    "taskDescription": "Generate a one-paragraph summary of a water damage inspection.",
    "taskOutput": "The property at 42 Smith Street sustained category 2 water damage to the kitchen and hallway. Affected area is approximately 18m². Drying equipment deployed: 2× LGR dehumidifiers, 1× air mover. IICRC S500:2025 §8.3 classification confirmed."
  }' | jq '{decision: .data.decision, quality: .data.qualityScore, confidence: .data.confidence}'
```

Expected response shape:

```json
{
  "decision": "AUTO_SHIP",
  "quality": 84,
  "confidence": 76
}
```

If you see `decision: "RETRY"`, check that `ANTHROPIC_API_KEY` is set and valid.
If you see a 401, your session cookie has expired — sign in at `localhost:3000`.
If you see a 402, your test account needs `subscriptionStatus: "TRIAL"` in the DB.

---

## Verify Persistence

After the smoke test, confirm the record was written to the DB:

```bash
curl -s "http://localhost:3000/api/harness/gate-check?projectKey=report-builder&limit=1" \
  -H "Cookie: <your session cookie>" | jq '.data[0]'
```

You should see the record with `id`, `qualityScore`, `confidence`, `decision`, and `createdAt`.

---

## Next Steps

You now understand every layer of the ship chain:

- How briefs are classified into intents
- How the evaluator scores output and routes decisions
- How thresholds are configured per project
- How the retry loop injects lessons from failed attempts

To submit a real brief via the Pi-CEO pipeline, see the `POST /api/harness/brief-templates` endpoint in `app/api/harness/brief-templates/route.ts` and the `AdvancedBrief` template at `.harness/templates/advanced-brief.yaml`.

For questions about the broader pipeline, open a Linear issue in the **Pi - Dev - Ops** project.

---

← Back to **[00 — Index](./00-index.md)**
