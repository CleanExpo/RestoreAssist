# Environment Variables Reference

Complete guide to all environment variables required for RestoreAssist.

## Critical Variables (Required)

### Database (Supabase)
**DATABASE_URL**
- Pooled connection string for application queries
- Format: `postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
- Port: 6543 (pooled)
- Required for: Application startup

**DIRECT_URL**
- Direct connection string for database migrations
- Format: `postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres`
- Port: 5432 (direct)
- Required for: Prisma migrations (production deployments)

### Authentication (NextAuth)
**NEXTAUTH_URL**
- Base URL for NextAuth callbacks
- Production: `https://restoreassist.app`
- Development: `http://localhost:3000`
- Required for: OAuth redirects, session validation

**NEXTAUTH_SECRET**
- Secret key for signing tokens and encrypting data
- Minimum: 32+ random characters
- Generate: `openssl rand -base64 32`
- Required for: Session encryption, CSRF protection

## Supabase Configuration

**SUPABASE_URL**
- Your Supabase project URL
- Format: `https://[project-id].supabase.co`
- Find in: Supabase Dashboard → Settings → API

**SUPABASE_ANON_KEY**
- Public anonymous key for client-side operations
- Safe to expose in client-side code
- Find in: Supabase Dashboard → Settings → API

**SUPABASE_SERVICE_ROLE_KEY**
- Private service role key for server-side operations
- SENSITIVE - Keep secret, never expose
- Find in: Supabase Dashboard → Settings → API

## Payment Processing (Stripe)

**STRIPE_SECRET_KEY**
- Secret API key for Stripe operations
- Format: `sk_live_...` (production) or `sk_test_...` (testing)
- SENSITIVE - Keep secret, never expose
- Required for: Payment processing, webhooks

**STRIPE_WEBHOOK_SECRET**
- Secret for verifying webhook signatures
- Format: `whsec_...`
- Find in: Stripe Dashboard → Webhooks
- Required for: Webhook verification

**NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY**
- Public key for Stripe.js client-side operations
- Format: `pk_live_...` (production) or `pk_test_...` (testing)
- Safe to expose in client-side code
- Required for: Payment forms, embedded elements

## Email Configuration (Nodemailer)

**EMAIL_SERVER_HOST**
- SMTP server hostname
- Example: `smtp.gmail.com`, `smtp.sendgrid.net`
- Required for: Email sending

**EMAIL_SERVER_PORT**
- SMTP server port
- Common: 587 (TLS), 465 (SSL), 25 (unencrypted)
- Default: 587
- Required for: Email sending

**EMAIL_SERVER_USER**
- SMTP username/email address
- Example: `noreply@example.com`
- SENSITIVE - Keep secret
- Required for: Email authentication

**EMAIL_SERVER_PASSWORD**
- SMTP password or API key
- SENSITIVE - Keep secret
- Required for: Email authentication

**EMAIL_FROM**
- Sender email address for outgoing emails
- Format: `noreply@restoreassist.app` or `Support <support@restoreassist.app>`
- Required for: Email headers

## AI Services

**ANTHROPIC_API_KEY**
- Claude API key for LLM features
- Format: `sk-ant-...`
- SENSITIVE - Keep secret
- Required for: Chatbot, AI analysis features

**GOOGLE_API_KEY**
- Google Generative AI API key
- SENSITIVE - Keep secret
- Required for: Gemini integration (if enabled)

**OPENAI_API_KEY**
- OpenAI API key for GPT models
- Format: `sk-...`
- SENSITIVE - Keep secret
- Required for: OpenAI integration (if enabled)

## Firebase Configuration

**FIREBASE_PROJECT_ID**
- Your Firebase project ID
- Find in: Firebase Console → Project Settings

**FIREBASE_PRIVATE_KEY**
- Service account private key
- SENSITIVE - Keep secret
- Find in: Firebase Console → Service Accounts → Generate New Private Key

**FIREBASE_CLIENT_EMAIL**
- Service account email
- Format: `firebase-adminsdk-[id]@[project].iam.gserviceaccount.com`
- Find in: Firebase Console → Service Accounts

**NEXT_PUBLIC_FIREBASE_CONFIG**
- Client-side Firebase configuration (JSON)
- Contains: apiKey, authDomain, projectId, etc.
- Safe to expose (public credentials only)
- Find in: Firebase Console → Project Settings → Your apps

## Google APIs

**GOOGLE_CLIENT_ID**
- OAuth 2.0 Client ID for Google Sign-In
- Format: `[id].apps.googleusercontent.com`
- Find in: Google Cloud Console → OAuth 2.0 Credentials

**GOOGLE_CLIENT_SECRET**
- OAuth 2.0 Client Secret
- SENSITIVE - Keep secret
- Find in: Google Cloud Console → OAuth 2.0 Credentials

**GOOGLE_REDIRECT_URI**
- Redirect URI for OAuth callback
- Production: `https://restoreassist.app/api/auth/google-signin/callback`
- Development: `http://localhost:3000/api/auth/google-signin/callback`

## Cloudinary Configuration

**NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME**
- Your Cloudinary cloud name
- Safe to expose (public)
- Find in: Cloudinary Dashboard → Account → Cloud Name

**CLOUDINARY_API_KEY**
- Cloudinary API key
- SENSITIVE - Keep secret
- Find in: Cloudinary Dashboard → Settings → API Keys

**CLOUDINARY_API_SECRET**
- Cloudinary API secret
- SENSITIVE - Keep secret
- Find in: Cloudinary Dashboard → Settings → API Keys

## Regulatory Citations Feature (Jan 2026)

### Feature Flag Control

**ENABLE_REGULATORY_CITATIONS**
- Controls visibility and functionality of regulatory citations feature
- Values: `'true'` or `'false'` (string, case-sensitive)
- Default: `'false'` (feature hidden from all users)
- Required for: Regulatory citations, building codes, state regulations
- Set in: Vercel Environment Variables (production and preview)

**Behavior Matrix:**
| Value | Toggle Visible | Retrieval Active | Notes |
|-------|---|---|---|
| `'false'` | ❌ No | ❌ No | Feature completely hidden; existing behavior preserved |
| `'true'` | ✅ Yes | ✅ Yes (if user opts in) | Feature available to users |

**Setting in Vercel:**
```bash
# Set to false first (default, safe)
printf "false" | vercel env add ENABLE_REGULATORY_CITATIONS production

# Transition to true when ready for rollout
printf "true" | vercel env add ENABLE_REGULATORY_CITATIONS production
```

### Cron Job Authentication

**CRON_SECRET**
- Secret key for authenticating Vercel cron jobs
- Minimum: 32+ random characters
- Generate: `openssl rand -base64 32`
- SENSITIVE - Keep secret
- Required for: Monthly regulatory document updates
- Set in: Vercel Environment Variables (production only)

**Purpose:** Protects `/api/cron/update-regulations` endpoint from unauthorized access

**Vercel Setup:**
```bash
# Generate strong random secret
SECRET=$(openssl rand -base64 32)

# Add to Vercel production environment
printf "$SECRET" | vercel env add CRON_SECRET production
```

**Cron Job Details:**
- Endpoint: `/api/cron/update-regulations`
- Schedule: Monthly (1st of month at 00:00 UTC)
- Configuration: `vercel.json`
- Purpose: Check and update regulatory documents from government sources

### Google Drive Configuration (Optional)

**REGULATORY_DRIVE_FOLDER_ID**
- Google Drive folder ID for storing regulatory documents
- Format: Long alphanumeric ID (e.g., `1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p`)
- Optional - can be set up later
- Safe to expose (folder is private to service account)
- Find: Right-click folder in Drive → Get link → Extract ID from URL

**Purpose:** Stores extracted regulatory documents for fallback access

**Note:** Not required for feature to work; regulatory documents are cached in database and updated monthly via cron job.

## Setting Environment Variables

### Local Development
Create `.env.local` file in project root:
```bash
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=your-secret-here
STRIPE_SECRET_KEY=sk_test_...
# ... other variables
```

### Vercel Production
Use Vercel Dashboard:
```bash
vercel env add VARIABLE_NAME production
```

Or via CLI (no newlines):
```bash
printf "value-without-newline" | vercel env add VARIABLE_NAME production
```

### Environment-Specific Files
- `.env.local` - Local development (gitignored)
- `.env.development` - Development environment
- `.env.production` - Production environment
- `.env.test` - Test environment

## Validating Variables

Check which variables are set:
```bash
vercel env ls
```

Pull production variables locally:
```bash
vercel env pull
```

Check if all required variables are present:
```bash
npm run env:check  # If configured
```

## Common Issues

### Missing DATABASE_URL
**Error**: `P1000: Authentication failed`
**Fix**: Verify URL is correct, no extra whitespace, correct project ID

### Newlines in Variables
**Error**: `connection refused` or `authentication failed`
**Fix**: Use `printf` not `echo`, Vercel adds trailing newlines with echo

### Stripe Webhook Failures
**Error**: Webhook signature verification failed
**Fix**: Verify STRIPE_WEBHOOK_SECRET matches endpoint in Stripe Dashboard

### Email Not Sending
**Error**: `Error: connect ECONNREFUSED`
**Fix**: Verify SMTP host/port, check EMAIL_SERVER_PASSWORD, may need app-specific password

## Rotating Credentials

When updating sensitive variables:
```bash
# Remove old variable
vercel env rm VARIABLE_NAME production

# Add new variable
printf "new-value" | vercel env add VARIABLE_NAME production

# Redeploy
vercel deploy --prod
```

## Security Best Practices

1. **NEVER commit `.env` files** to git (should be in `.gitignore`)
2. **NEVER log sensitive variables** in console or error messages
3. **NEVER expose secrets in client-side code** (except NEXT_PUBLIC_* variables)
4. **NEVER share credentials** via email or chat
5. **Rotate credentials regularly** (quarterly recommended)
6. **Use strong secrets** (32+ random characters for NEXTAUTH_SECRET)
7. **Keep production secrets separate** from development
8. **Monitor credential usage** in dashboards (Stripe, Google, Firebase)

---

**Last Updated**: 2026-01-08
