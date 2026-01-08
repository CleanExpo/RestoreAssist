# RestoreAssist System Architecture

**Deployment Model**: Monolithic Next.js 15 application
**Backend**: Next.js API Routes (30+ endpoints)
**Frontend**: React 18 with Server Components
**Database**: Prisma ORM + PostgreSQL
**Deployment Platform**: Vercel (Sydney region)

---

## Architecture Overview

RestoreAssist is a **monolithic Next.js 15 fullstack application**, NOT microservices.

All business logic runs in Next.js API routes, all data persists in PostgreSQL via Prisma ORM, and all deployments target Vercel in the Sydney region.

### High-Level Components

- **Browser/Client**: React 18 components, NextAuth session, client-side state
- **Next.js Server**: App Router pages, 30+ API routes, NextAuth, business logic utilities
- **Database**: Prisma ORM + PostgreSQL 16 (Supabase) with 19+ models

---

## Technology Stack

### Frontend (Client)

- Framework: Next.js 15 (App Router)
- UI Library: React 18.2
- Styling: Tailwind CSS
- State: React Context + Hooks
- HTTP: Fetch API

### Backend (Server)

- Runtime: Next.js 15 on Node.js
- API: RESTful (JSON)
- Validation: TypeScript + Zod/Yup
- Auth: NextAuth 4.24
- Payments: Stripe SDK
- Email: Nodemailer (SMTP)

### Database

- ORM: Prisma 6.19
- Database: PostgreSQL 16 (Supabase)
- Connection Pool: PgBouncer
- Migrations: Prisma migrations
- Backup: Supabase automatic daily

### Infrastructure

- Hosting: Vercel (Edge Network)
- Region: Sydney (syd1)
- Deployment: Git push to main
- Functions: Serverless (30-second timeout)

---

## Application Architecture

### Project Structure

```
RestoreAssist/
├── app/api/                      # 30+ REST API endpoints
│   ├── clients/                  # Client CRUD
│   ├── reports/                  # Report operations
│   ├── estimates/                # Cost estimates
│   ├── scopes/                   # Project scopes
│   ├── stripe/webhooks/          # Payment webhooks
│   ├── auth/[...nextauth].ts     # NextAuth handler
│   └── ...                       # 20+ more routes
├── app/dashboard/                # Protected dashboard pages
├── components/                   # React components (40+)
├── lib/                          # Utilities & config
│   ├── auth.ts                   # NextAuth config
│   ├── prisma.ts                 # Prisma singleton
│   ├── api-client.ts             # Fetch wrapper
│   └── ...
├── prisma/                       # Database
│   ├── schema.prisma             # 19+ models
│   └── migrations/               # 19+ migrations
└── public/                       # Static assets
```

### Database Models (19+)

Key models:

- User (authentication)
- Client (business entities)
- Report (inspection reports)
- Estimate (cost estimates)
- Scope (project scopes)
- Subscription (billing)
- Invoice (payment tracking)
- Equipment (tool inventory)
- ... and 11+ more

---

## API Architecture

### REST Endpoints

All endpoints return JSON with consistent format:

```json
Success: {"success": true, "data": {...}}
Error: {"success": false, "error": "message"}
```

### Authentication Flow

1. User logs in (POST /api/auth/signin)
2. NextAuth creates session (JWT cookie)
3. Subsequent requests include cookie
4. API routes call getServerSession() to validate
5. Return filtered data per user

---

## Security Model

### Authentication

- NextAuth session-based (secure HttpOnly cookies)
- Every API route validates session
- User ID extracted from session

### Authorization

- Row-level security at API level
- Each user only sees their own data
- Stripe PCI-DSS compliant for payments

### Data Protection

- Zod validation on all inputs
- Environment variables in Vercel (never in code)
- Database connections pooled via PgBouncer

---

## Deployment

### Local

```bash
npm run dev  # localhost:3000
```

### Production

```
1. Push to main branch
2. Vercel triggers build
3. npm install
4. npx prisma generate
5. npm run build
6. Database migrations
7. Deploy to https://restoreassist.app
```

---

**Last Updated**: 2026-01-08
**Version**: 1.0
