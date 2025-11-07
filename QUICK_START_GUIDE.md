# RestoreAssist Quick Start Guide

## For New Claude Code Sessions

**ALWAYS start with:**
```
Read rules.md and CLAUDE.md first. Then describe the key constraints and how you'll follow them.
```

---

## Current Status

**🟡 Ready for Deployment - Waiting for Database Credentials**

All build issues resolved. Only blocker: Database authentication.

---

## Immediate Next Steps

### 1. Fix Database Credentials
```bash
# User needs to:
# - Verify which Supabase project to use (old or new)
# - Provide valid database password
# - Confirm project is not paused

# Test credentials locally first:
node test-db-credentials.js

# Update Vercel environment:
vercel env rm DATABASE_URL production
printf "postgresql://postgres.[PROJECT]:[PASSWORD]@..." | vercel env add DATABASE_URL production
```

### 2. Deploy to Production
```bash
vercel deploy --prod
```

### 3. Run Autonomous Tests
```bash
node testing/orchestrator.js
```

---

## Quick Commands

### Development
```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm run lint             # Run linter
```

### Database
```bash
npx prisma generate      # Generate client
npx prisma migrate dev   # Run migrations locally
npx prisma studio        # Open database GUI
```

### Testing
```bash
node testing/orchestrator.js  # Run all test agents
```

### Deployment
```bash
vercel deploy --prod     # Deploy to production
vercel env ls            # List environment variables
vercel env pull          # Pull env vars locally
```

---

## Critical Rules

### Dependency Versions (LOCKED)
- ❌ DO NOT upgrade Next.js to 16.x
- ❌ DO NOT upgrade React to 19.x
- ❌ DO NOT upgrade nodemailer to 7.x
- ✅ Keep Next.js at 15.0.0, React at 18.2.0, nodemailer at 6.9.0

### Package Manager
- ✅ USE npm ONLY
- ❌ NO pnpm or yarn
- ✅ Delete pnpm-lock.yaml if present
- ✅ Keep .npmrc with legacy-peer-deps=true

### Environment Variables
- ✅ Use `printf` not `echo` for CLI
- ❌ NO secrets in vercel.json
- ✅ All secrets via Vercel dashboard/CLI

---

## File Structure

```
RestoreAssist/
├── rules.md                    # Enforcement rules (READ FIRST)
├── CLAUDE.md                   # Project documentation
├── DEPLOYMENT_STATUS_REPORT.md # Current status
├── QUICK_START_GUIDE.md        # This file
├── testing/                    # Autonomous testing system
│   ├── orchestrator.js         # Test coordinator
│   ├── agents/                 # 5 specialized agents
│   ├── config/                 # Test configuration
│   └── reports/                # Test results
├── app/                        # Next.js App Router
├── components/                 # React components
├── prisma/                     # Database schema
└── public/                     # Static assets
```

---

## Common Issues

### Database Connection Failed
**Error**: P1000 Authentication failed
**Fix**: Verify credentials in Supabase dashboard, check for newlines

### Build Dependency Conflicts
**Error**: peer dependency conflicts
**Fix**: Ensure .npmrc has legacy-peer-deps=true

### Vercel Deployment Rejected
**Error**: Invalid vercel.json
**Fix**: No `env` section, no `runtime` property

---

## Documentation

- **rules.md** - Read this FIRST every session
- **CLAUDE.md** - Complete project documentation
- **DEPLOYMENT_STATUS_REPORT.md** - Detailed status
- **QUICK_START_GUIDE.md** - This quick reference

---

## Testing System

**5 Specialized Agents**:
1. Frontend Agent - UI testing (Playwright MCP ready)
2. API Agent - Endpoint testing
3. Security Agent - Vulnerability scanning
4. Database Agent - Connection health
5. Performance Agent - Load times

**Run All**: `node testing/orchestrator.js`
**Configure**: Edit `testing/config/test-config.json`

---

## Support Links

- Vercel: https://vercel.com/unite-group/restoreassist-unified
- Supabase: https://app.supabase.com
- GitHub: https://github.com/CleanExpo/RestoreAssist
- Production: https://restoreassist.app

---

**Last Updated**: 2025-11-07
**Status**: 🟡 Pending database credentials
**Confidence**: High (all build issues resolved)
