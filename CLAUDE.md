# RestoreAssist Project Context

**IMPORTANT**: This document reflects the current production state of RestoreAssist as of January 8, 2026.

---

## Project Overview

**RestoreAssist** is a Next.js 15 web application for data restoration services with comprehensive claim analysis, inspection reporting, and cost estimation capabilities.

- **Production URL**: https://restoreassist.app
- **Framework**: Next.js 15.0.0
- **Language**: TypeScript
- **Deployment**: Vercel (Sydney region)
- **Database**: Supabase PostgreSQL

---

## Tech Stack & Current Versions

### Core Dependencies (Production)

```json
{
  "next": "15.0.0",
  "react": "19.2.0",
  "react-dom": "19.2.0",
  "next-auth": "^4.24.11",
  "nodemailer": "^7.0.10",
  "@prisma/client": "^6.1.0",
  "stripe": "^19.1.0"
}
```

### Key Dependencies

**AI & LLM**:
- `@anthropic-ai/sdk`: ^0.67.0
- `@google/generative-ai`: ^0.21.0
- `openai`: ^4.104.0

**Database & ORM**:
- `@prisma/client`: ^6.1.0
- `@supabase/supabase-js`: ^2.86.0
- `pg`: ^8.16.3

**Frontend UI**:
- `@radix-ui/*`: Latest versions (1.x-2.x)
- `framer-motion`: ^12.23.24
- `lucide-react`: ^0.454.0
- `sonner`: ^1.7.4
- `recharts`: ^3.3.0

**File Processing**:
- `pdf-lib`: ^1.17.1
- `pdf-parse`: ^2.4.5
- `pdfjs-dist`: ^5.4.394
- `jspdf`: ^3.0.4
- `html2canvas`: ^1.4.1
- `mammoth`: ^1.11.0
- `exceljs`: ^4.4.0

**Cloud Services**:
- `firebase`: ^12.7.0
- `firebase-admin`: ^13.6.0
- `cloudinary`: ^2.8.0
- `googleapis`: ^166.0.0

**Payments**:
- `stripe`: ^19.1.0
- `@stripe/stripe-js`: ^8.1.0

**Dev Dependencies**:
- `@types/react`: ^19
- `@types/react-dom`: ^19
- `typescript`: ^5
- `prisma`: ^6.1.0
- `tailwindcss`: ^4.1.9

---

## Key Directory Structure

```
RestoreAssist/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── auth/                 # Authentication endpoints
│   │   ├── claims/               # Claims analysis API
│   │   ├── inspections/          # Inspection data API
│   │   ├── reports/              # Report generation API
│   │   ├── chatbot/              # Chatbot integration
│   │   └── webhooks/             # Stripe webhooks
│   ├── dashboard/                # Protected user dashboard
│   ├── app-assist/               # Claim analysis features
│   ├── forgot-password/          # Password recovery
│   └── page.tsx                  # Homepage
├── components/                   # React components
│   ├── Chatbot.tsx               # AI chatbot UI
│   ├── RestorationInspectionReportViewer.tsx
│   ├── VisualCostEstimationViewer.tsx
│   ├── VisualScopeOfWorksViewer.tsx
│   ├── NIRTechnicianInputForm.tsx
│   ├── OnboardingGuide.tsx
│   └── ...
├── lib/                          # Utilities and services
│   ├── ai-provider.ts            # AI provider abstraction
│   ├── claim-analysis-engine.ts  # Claims analysis logic
│   ├── nir-*.ts                  # NIR-specific algorithms
│   ├── firebase*.ts              # Firebase integration
│   ├── cloudinary.ts             # Image upload service
│   └── ...
├── prisma/                       # Database schema
│   ├── schema.prisma             # Current schema
│   └── migrations/               # Applied migrations
├── skill.md/                     # Skill specifications (documentation)
├── public/                       # Static assets
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
└── next.config.js               # Next.js config
```

---

## Core Commands

### Development

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Build for production
npm run start            # Start production server locally
npm run lint             # Run ESLint
```

### Database

```bash
npx prisma generate      # Generate Prisma client
npx prisma migrate dev   # Create and run migration
npx prisma migrate deploy # Deploy to production
npx prisma studio       # Open database GUI
```

### Deployment

```bash
vercel deploy --prod     # Deploy to production
vercel env ls           # List environment variables
vercel env pull         # Pull env vars to local
vercel env add VAR_NAME # Add environment variable
```

---

## Environment Variables (Production)

### Database (Supabase)

```bash
DATABASE_URL              # Pooled connection (port 6543)
DIRECT_URL                # Direct connection (port 5432)
```

### Authentication

```bash
NEXTAUTH_URL              # https://restoreassist.app
NEXTAUTH_SECRET           # Random secret (32+ chars)
```

### Supabase

```bash
SUPABASE_URL              # Supabase project URL
SUPABASE_ANON_KEY         # Public anon key
SUPABASE_SERVICE_ROLE_KEY # Private service key (sensitive)
```

### Stripe

```bash
STRIPE_SECRET_KEY         # sk_live_... or sk_test_...
STRIPE_WEBHOOK_SECRET     # whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY # pk_live_... or pk_test_...
```

### Email (Nodemailer)

```bash
EMAIL_SERVER_USER         # SMTP username
EMAIL_SERVER_PASSWORD     # SMTP password
EMAIL_SERVER_HOST         # SMTP host
EMAIL_SERVER_PORT         # SMTP port
EMAIL_FROM                # From address
```

### AI Services

```bash
ANTHROPIC_API_KEY         # Claude API key
GOOGLE_API_KEY            # Google Generative AI key
OPENAI_API_KEY            # OpenAI API key
```

### Firebase

```bash
FIREBASE_PROJECT_ID       # Firebase project ID
FIREBASE_PRIVATE_KEY      # Private key
FIREBASE_CLIENT_EMAIL     # Service account email
NEXT_PUBLIC_FIREBASE_CONFIG # Client config (public)
```

### Cloudinary

```bash
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME # Cloud name
CLOUDINARY_API_KEY        # API key
CLOUDINARY_API_SECRET     # API secret
```

### Google APIs

```bash
GOOGLE_CLIENT_ID          # OAuth client ID
GOOGLE_CLIENT_SECRET      # OAuth secret
GOOGLE_REDIRECT_URI       # Redirect URI
```

---

## Database Schema Highlights

### Core Models

- `User` - User accounts and profiles
- `Account` - OAuth/session accounts
- `Session` - NextAuth sessions
- `Inspection` - Inspection/damage assessment records
- `Report` - Generated inspection reports
- `ClaimAnalysis` - Claims analysis data
- `ChatMessage` - Chatbot conversation history

### Features

- **Multi-tenant support** with organizational boundaries
- **File storage** integration with Cloudinary
- **Claims analysis** with sophisticated gap detection
- **NIR integration** for advanced damage assessment
- **Addon system** for feature purchases
- **Chat history** for persistent chatbot sessions

---

## Recent Major Updates (Jan 2026)

### New Features
- ✅ Chatbot integration with Anthropic Claude
- ✅ Claims analysis engine with gap analysis
- ✅ NIR (Non-Invasive Restoration) workflow
- ✅ Advanced inspection reporting
- ✅ Professional PDF generation
- ✅ Firebase/Google authentication
- ✅ Cloudinary image management
- ✅ Addon/feature purchase system

### Dependencies Updated
- Upgraded React to 19.2.0
- Upgraded nodemailer to 7.0.10
- Updated Prisma to 6.1.0
- Updated all Radix UI components
- Added Firebase integration
- Added Cloudinary integration

---

## Important Notes

### Dependency Compatibility

- **React 19.2.0** is compatible with Next.js 15.0.0
- **nodemailer 7.0.10** works with next-auth 4.24.11
- **@prisma/client 6.1.0** requires corresponding Prisma version
- TypeScript 5.x is required

### Best Practices

1. **Never commit secrets** - Use Vercel dashboard or `vercel env add`
2. **Always test migrations locally** before production
3. **Use `npm install --force`** during build to handle peer dependencies
4. **Test on preview deployment** before pushing to production
5. **Keep environment variables in sync** across all instances

### Git Workflow

- Main branch is production-ready
- Use feature branches for development
- Create PRs for code review before merging
- Squash commits on merge to main

---

## Troubleshooting

### Database Connection Issues

**Symptom**: `P1000: Authentication failed`

**Checks**:
1. Verify password is correct in Supabase
2. Check project ID matches connection string
3. Ensure DATABASE_URL doesn't have extra whitespace
4. Verify IP allowlist allows Vercel IPs
5. Check if database is paused (Supabase auto-pauses)

### Build Failures

**Common issues**:
- Missing environment variables
- Type errors in generated Next.js types
- Missing Prisma migrations
- Peer dependency conflicts

**Solutions**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install --force

# Regenerate Prisma
npx prisma generate

# Check build
npm run build
```

### Deployment Issues

**Vercel rejects deployment**:
- Check vercel.json syntax
- Verify all required env vars are set
- Ensure DATABASE_URL is present
- Check build logs in Vercel dashboard

---

## Contact & Resources

- **Production URL**: https://restoreassist.app
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://app.supabase.com
- **Stripe Dashboard**: https://dashboard.stripe.com
- **Firebase Console**: https://console.firebase.google.com

---

**Last Updated**: January 8, 2026
**Maintained By**: Project Owner
**Version**: 2.0
