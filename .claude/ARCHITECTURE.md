# Architecture — RestoreAssist

## System Overview

RestoreAssist is a full-stack compliance platform for Australian water damage restoration companies. The web app handles inspection management, IICRC-compliant report generation (AI-powered), client portals, invoicing, equipment tracking, and integration syncing with accounting/job management platforms (Xero, QuickBooks, MYOB, ServiceM8, Ascora).

The platform runs as a Next.js App Router application deployed on DigitalOcean App Platform, with Vercel used for PR preview deployments. PostgreSQL (Supabase-hosted) is the primary datastore via Prisma ORM. Authentication uses NextAuth.js with Google OAuth + Firebase for mobile auth flows.

A Capacitor-based mobile app wraps the web app in a native WebView for Android/iOS (server-hosted — loads restoreassist.com.au directly). A separate React Native/Expo scaffold exists in `mobile/` for future native field capture features.

## Component Map

```
restoreassist/
├── app/                          # Next.js App Router
│   ├── api/                      # ~60 API route groups
│   │   ├── inspections/          # Core inspection CRUD + submit + classification
│   │   ├── reports/              # Report generation + download
│   │   ├── invoices/             # Invoice CRUD + templates + payments
│   │   ├── integrations/         # OAuth + sync for 5 platforms
│   │   ├── cron/                 # Bearer-token-gated cron endpoints
│   │   ├── analytics/            # Dashboard analytics endpoints
│   │   └── auth/                 # NextAuth + Google + Firebase flows
│   ├── dashboard/                # Authenticated dashboard (inspections, reports, invoices, etc.)
│   ├── portal/                   # Client-facing portal (read-only report access)
│   └── (marketing)/              # Public pages: about, pricing, blog, features, etc.
├── lib/                          # Business logic layer
│   ├── nir-*.ts                  # NIR (National Inspection Report) engine modules
│   ├── integrations/             # Platform-specific sync clients (Xero, QBO, MYOB, SM8, Ascora)
│   ├── content-pipeline/         # Autonomous video production pipeline (HeyGen + YouTube)
│   ├── cron/                     # Cron job handlers (content, analytics, cleanup)
│   ├── agents/                   # AI agent definitions and workflow engine
│   ├── ai/                       # AI routing layer (Gemma client + task-based model router)
│   ├── evidence/                 # Evidence class definitions, workflow engine, submission gate
│   └── interview/                # Technician interview question engine
├── components/                   # React components (shadcn/ui + custom)
│   ├── ui/                       # shadcn/ui primitives (do not modify directly)
│   └── *.tsx                     # Domain components (viewers, forms, dashboards)
├── prisma/
│   └── schema.prisma             # 102 models — single source of truth for data
├── android/                      # Capacitor Android native project
├── ios/                          # Capacitor iOS native project
├── mobile/                       # Expo/React Native scaffold (field capture — future)
├── e2e/                          # Playwright e2e test specs
├── .github/workflows/            # CI: PR quality gates, Android AAB builds, DO deploy
└── .do/app.yaml                  # DigitalOcean App Platform config
```

## Module Boundaries

### Inspection Engine (`lib/nir-*.ts`)

- **Purpose:** IICRC S500/S520/S700 compliant classification, scope determination, building code triggers
- **Owns:** Classification results, scope items, evidence gates, jurisdictional rules
- **Depends on:** Prisma (Inspection, MoistureReading, EnvironmentalData models)
- **Public API:** `classifyIICRC()`, `determineScopeItems()`, `checkBuildingCodeTriggers()`

### Integration Layer (`lib/integrations/`)

- **Purpose:** Bidirectional sync with external accounting/job platforms
- **Owns:** OAuth flows, sync queue, circuit breaker, rate limiting
- **Depends on:** Prisma (Integration, IntegrationSyncLog), NIR engine for report data
- **Public API:** `nirSyncOrchestrator.syncReport()`, platform-specific clients
- **Pattern:** All syncs are fire-and-forget. Failures retry via dead-letter queue.

### Content Pipeline (`lib/content-pipeline/`)

- **Purpose:** Autonomous video generation for YouTube channel
- **Owns:** Topic selection, script generation, HeyGen video submission, YouTube upload
- **Depends on:** Prisma (ContentJob, ContentPost), Anthropic API, HeyGen API, YouTube API
- **Triggered by:** Cron endpoints (`/api/cron/generate-content`, `/api/cron/poll-heygen`, `/api/cron/distribute-content`)

### Invoicing (`app/api/invoices/`)

- **Purpose:** Full invoice lifecycle — create, send, payment tracking, credit notes
- **Owns:** Invoice, InvoiceLineItem, InvoicePayment, CreditNote, InvoiceTemplate models
- **Depends on:** Stripe (payment processing), Integration layer (accounting sync)

## Data Model (Key Entities)

| Entity                    | Storage             | Notes                                                                             |
| ------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| User / Account / Session  | PostgreSQL (Prisma) | NextAuth.js managed                                                               |
| Inspection                | PostgreSQL          | Core entity — has MoistureReadings, EnvironmentalData, AffectedAreas, ScopeItems  |
| Report                    | PostgreSQL          | Generated from Inspection via AI; has PDF download                                |
| Invoice                   | PostgreSQL          | Linked to Report; has LineItems, Payments, CreditNotes                            |
| Integration               | PostgreSQL          | OAuth tokens for Xero/QBO/MYOB/SM8/Ascora                                         |
| ContentJob/ContentPost    | PostgreSQL          | Video pipeline state machine                                                      |
| CostLibrary/CostItem      | PostgreSQL          | Per-org pricing reference data                                                    |
| EvidenceItem/CustodyEvent | PostgreSQL          | Sprint G — evidence capture workflow, chain of custody per inspection             |
| InsurerProfile            | PostgreSQL          | Sprint H — per-insurer evidence/reporting requirements (6 AU insurers pre-seeded) |

## Third-Party Integrations

| Service          | Purpose                                                          | Auth                              |
| ---------------- | ---------------------------------------------------------------- | --------------------------------- |
| Stripe           | Payments + subscriptions                                         | API key                           |
| Anthropic Claude | AI report generation                                             | API key                           |
| Google Gemini    | Alternative AI provider                                          | API key                           |
| HeyGen           | Avatar video rendering                                           | API key                           |
| YouTube          | Video distribution                                               | OAuth2                            |
| Xero             | Accounting sync                                                  | OAuth2                            |
| QuickBooks       | Accounting sync                                                  | OAuth2                            |
| MYOB             | Accounting sync                                                  | OAuth2                            |
| ServiceM8        | Job management sync                                              | OAuth2                            |
| Ascora           | Job management sync                                              | OAuth2                            |
| Cloudinary       | Image hosting                                                    | API key                           |
| Firebase         | Mobile auth + Google sign-in                                     | Service account                   |
| Supabase         | PostgreSQL hosting                                               | Connection string                 |
| Gemma-4-31B-IT   | Self-hosted VLM for basic AI tasks (evidence, contents manifest) | API key (GEMMA_API_KEY, optional) |

## Design Decisions

| Decision                                 | Rationale                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Server-hosted WebView (Capacitor)        | Avoids maintaining two codebases; SSR API routes stay intact; single deployment     |
| Fire-and-forget integration sync         | User-facing operations must never be blocked by third-party failures                |
| 120+ Prisma models in single schema      | Monolith-first approach; domain boundaries enforced by file structure, not services |
| `ignoreBuildErrors: true` in next.config | Large codebase with some TS strictness gaps; CI uses separate type-check step       |
| pnpm over npm                            | Faster installs, strict dependency resolution, workspace support                    |
| DigitalOcean over Vercel for prod        | Server Actions stability, WebSocket support, predictable pricing                    |
