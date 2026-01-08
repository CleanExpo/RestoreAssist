# Local Setup Guide - RestoreAssist

**Framework**: Next.js 15 (Fullstack)
**Database**: Prisma + PostgreSQL
**Language**: TypeScript
**Package Manager**: npm

---

## Overview

RestoreAssist is a **Next.js 15 fullstack application** with:

- 30+ Next.js API routes (all business logic in `app/api/`)
- Prisma ORM as the sole database layer
- NextAuth for session-based authentication
- Stripe integration for payment processing
- Supabase PostgreSQL for data persistence
- React Server Components and Client Components

**NOT a microservices architecture** - all backend logic runs in Next.js API routes, not separate servers.

---

## Prerequisites

### Required Software

- **Node.js**: 20.x or later (check with `node --version`)
- **npm**: 10.x or later (check with `npm --version`)
- **PostgreSQL**: 16.x (local or Docker)
- **Git**: Latest version

### Recommended Tools

- **VSCode**: Latest version with extensions (ESLint, Prettier, TypeScript)
- **Docker**: For running PostgreSQL locally without system install
- **Postman/Thunder Client**: For API testing (optional)

---

## Quick Start (10 minutes)

### 1. Clone Repository

```bash
git clone https://github.com/[your-org]/RestoreAssist.git
cd RestoreAssist
```

### 2. Install Dependencies

```bash
npm install
```

If you encounter peer dependency warnings, this is expected (next-auth requires specific versions).

### 3. Set Up Database

#### Option A: PostgreSQL Local (Direct Install)

```bash
# macOS with Homebrew
brew install postgresql@16
brew services start postgresql@16

# Windows: Download installer from https://www.postgresql.org/download/windows/

# Linux: Follow distribution-specific instructions
sudo apt-get install postgresql-16
sudo systemctl start postgresql
```

#### Option B: PostgreSQL in Docker (Recommended)

```bash
docker run --name restoreassist-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=restoreassist \
  -p 5432:5432 \
  -d postgres:16-alpine
```

### 4. Create `.env.local`

```bash
# Database (Supabase-like connection)
DATABASE_URL="postgresql://postgres:password@localhost:5432/restoreassist"
DIRECT_URL="postgresql://postgres:password@localhost:5432/restoreassist"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Stripe (test keys from dashboard.stripe.com)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxx"
STRIPE_SECRET_KEY="sk_test_xxx"
STRIPE_WEBHOOK_SECRET="whsec_test_xxx"

# Email (if testing email features)
EMAIL_SERVER_USER="your-email@gmail.com"
EMAIL_SERVER_PASSWORD="app-password"
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT="587"
EMAIL_FROM="noreply@restoreassist.app"
```

### 5. Generate NEXTAUTH_SECRET

```bash
# macOS/Linux
openssl rand -base64 32

# Windows (in PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
```

### 6. Run Migrations & Start Dev Server

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (creates tables)
npx prisma migrate dev --name init

# Start development server
npm run dev
```

Visit **http://localhost:3000** - you should see the homepage.

---

## Project Structure

```
RestoreAssist/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (30+ endpoints)
│   │   ├── auth/[...nextauth].ts # NextAuth endpoints
│   │   ├── clients/              # Client CRUD operations
│   │   ├── reports/              # Report generation
│   │   ├── estimates/            # Cost estimation
│   │   ├── scopes/               # Project scopes
│   │   ├── stripe/               # Payment webhooks
│   │   ├── health/               # Health checks
│   │   └── ...                   # 20+ more routes
│   ├── dashboard/                # Protected dashboard pages
│   ├── pricing/                  # Public pricing page
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Homepage
├── components/                   # React components
│   ├── ReportComposer.tsx        # Report builder UI
│   ├── Dashboard.tsx             # Dashboard layout
│   └── ...                       # 40+ components
├── lib/                          # Utilities & config
│   ├── auth.ts                   # NextAuth config
│   ├── prisma.ts                 # Prisma client singleton
│   ├── api-client.ts             # Fetch wrapper
│   └── ...                       # Helpers, hooks, etc.
├── prisma/                       # Database (Prisma)
│   ├── schema.prisma             # Database schema (19+ models)
│   └── migrations/               # Migration history
├── public/                       # Static assets
├── .env.local                    # Local env vars (GITIGNORED)
├── .env.example                  # Template for env vars
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── next.config.js                # Next.js config
├── vercel.json                   # Vercel deployment config
└── CLAUDE.md                     # Project guidelines
```

---

## Common Commands

### Development

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Build for production
npm run start            # Start production server locally
npm run lint             # Run ESLint
npm run type-check       # TypeScript type checking
```

### Database (Prisma)

```bash
npx prisma generate     # Generate Prisma client (after schema changes)
npx prisma migrate dev   # Create and run migration
npx prisma migrate reset # Drop DB and re-run all migrations (DEV ONLY)
npx prisma studio       # Open database GUI at http://localhost:5555
npx prisma db seed      # Seed database with sample data
```

### API Testing

```bash
# Test API endpoints with curl
curl http://localhost:3000/api/clients
curl -X POST http://localhost:3000/api/clients \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp"}'
```

---

## Troubleshooting

### Port Already in Use

```bash
# Specify different port
npm run dev -- -p 3001

# Linux/macOS: Find process on port 3000
lsof -i :3000

# Windows (PowerShell)
Get-Process | Where-Object {$_.Port -eq 3000}
```

### Database Connection Failed

**Error**: `P1000: Authentication failed`

**Checklist**:

1. Is PostgreSQL running?
   - psql -U postgres should connect
   - Docker: docker ps should show container running
2. Is DATABASE_URL correct?
   - Check username/password/host/port
3. Does database exist?
   - Create it: createdb -U postgres restoreassist
4. Need to reinitialize?
   - Run: npx prisma migrate dev --name init

### Prisma Client Not Generated

**Error**: `Cannot find module '@prisma/client'`

**Fix**:

```bash
npx prisma generate
npm install
```

### NextAuth Session Not Working

**Error**: Session is null in `useSession()`

**Checklist**:

1. Is NEXTAUTH_URL set correctly? (must match your URL)
2. Is NEXTAUTH_SECRET valid? (32+ character random string)
3. Browser cookies enabled?
4. Are you accessing via exact URL (http vs https)?

### TypeScript Errors

```bash
# Clear TypeScript cache and rebuild
rm -rf .next node_modules/.cache
npm run type-check
```

---

## Environment Variables Reference

| Variable        | Description                             | Example                             | Required |
| --------------- | --------------------------------------- | ----------------------------------- | -------- |
| DATABASE_URL    | Prisma database connection (pooled)     | postgresql://user:pass@host:6543/db | Yes      |
| DIRECT_URL      | Direct database connection (migrations) | postgresql://user:pass@host:5432/db | Yes      |
| NEXTAUTH_URL    | Your app's public URL                   | http://localhost:3000               | Yes      |
| NEXTAUTH_SECRET | Secret for session encryption           | 32+ character random                | Yes      |

---

**Last Updated**: 2026-01-08
**Version**: 1.0
