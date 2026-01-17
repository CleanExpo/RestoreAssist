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

## Firebase Configuration (DEPRECATED - No Longer Used)

> **Note:** As of January 2026, Firebase authentication has been removed in favour of NextAuth's native Google OAuth provider. The following environment variables are no longer required and can be safely removed from your environment.

**Deprecated Variables (can be removed):**
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_SERVICE_ACCOUNT_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `NEXT_PUBLIC_FIREBASE_CONFIG`

**Google OAuth now uses NextAuth's native provider with:**
- `GOOGLE_CLIENT_ID` (see Google APIs section)
- `GOOGLE_CLIENT_SECRET` (see Google APIs section)

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

## External Integrations (Jan 2026)

## Infrastructure (DigitalOcean)

**DIGITALOCEAN_ACCESS_TOKEN**
- DigitalOcean Personal Access Token (PAT) for server-side API access
- SENSITIVE - Keep secret, never expose to the browser
- Used by: DigitalOcean API routes (e.g. `/api/digitalocean/account`)
- Alternative names supported: `DO_API_TOKEN`, `DIGITALOCEAN_TOKEN`

### DigitalOcean Spaces (S3-compatible object storage)

**UPLOAD_PROVIDER**
- Set to `spaces` to store uploads in DigitalOcean Spaces (recommended for production/serverless)
- Values: `spaces` (currently supported)

**LOGO_UPLOAD_PROVIDER**
- Overrides where `/api/upload/logo` stores files
- Values: `spaces` or `cloudinary` (default: `cloudinary`)

**DIGITALOCEAN_SPACES_REGION**
- Spaces region slug (e.g. `sgp1`, `nyc3`)

**DIGITALOCEAN_SPACES_BUCKET**
- Bucket name (e.g. `restoreassist-prod`)

**DIGITALOCEAN_SPACES_KEY**
- Spaces access key
- SENSITIVE - Keep secret, never expose

**DIGITALOCEAN_SPACES_SECRET**
- Spaces secret key
- SENSITIVE - Keep secret, never expose

**DIGITALOCEAN_SPACES_ENDPOINT** (optional)
- Override S3 endpoint (defaults to `https://{region}.digitaloceanspaces.com`)

**DIGITALOCEAN_SPACES_CDN_DOMAIN** (optional)
- If you enable Spaces CDN, set this to return CDN URLs
- Example: `restoreassist-prod.sgp1.cdn.digitaloceanspaces.com`

### OAuth Token Encryption

**INTEGRATION_ENCRYPTION_KEY**
- AES-256-GCM encryption key for storing OAuth tokens
- Must be exactly 32 bytes (64 hex characters)
- Generate: `openssl rand -hex 32`
- SENSITIVE - Keep secret, never expose
- Required for: Encrypting access/refresh tokens at rest
- If not set, uses a development-only default (not recommended for production)

### Xero Integration

**XERO_CLIENT_ID**
- OAuth 2.0 Client ID for Xero
- Find in: Xero Developer Portal → My Apps → Your App → OAuth 2.0 credentials
- Required for: Xero OAuth flow

**XERO_CLIENT_SECRET**
- OAuth 2.0 Client Secret for Xero
- SENSITIVE - Keep secret
- Find in: Xero Developer Portal → My Apps → Your App → OAuth 2.0 credentials
- Required for: Xero OAuth flow

### QuickBooks Integration

**QUICKBOOKS_CLIENT_ID**
- OAuth 2.0 Client ID for QuickBooks
- Find in: Intuit Developer Portal → Your App → Keys & OAuth
- Required for: QuickBooks OAuth flow

**QUICKBOOKS_CLIENT_SECRET**
- OAuth 2.0 Client Secret for QuickBooks
- SENSITIVE - Keep secret
- Find in: Intuit Developer Portal → Your App → Keys & OAuth
- Required for: QuickBooks OAuth flow

**QUICKBOOKS_SANDBOX**
- Set to 'true' to use sandbox API (testing)
- Values: 'true' or 'false' (default: 'false')
- Optional - defaults to production API

### MYOB Integration

**MYOB_CLIENT_ID**
- OAuth 2.0 Client ID for MYOB AccountRight
- Find in: MYOB Developer Portal → My Apps → API Keys
- Required for: MYOB OAuth flow and API authentication

**MYOB_CLIENT_SECRET**
- OAuth 2.0 Client Secret for MYOB AccountRight
- SENSITIVE - Keep secret
- Find in: MYOB Developer Portal → My Apps → API Keys
- Required for: MYOB OAuth flow

### ServiceM8 Integration

**SERVICEM8_CLIENT_ID**
- OAuth 2.0 Client ID for ServiceM8
- Find in: ServiceM8 Developer Portal → API Credentials
- Required for: ServiceM8 OAuth flow

**SERVICEM8_CLIENT_SECRET**
- OAuth 2.0 Client Secret for ServiceM8
- SENSITIVE - Keep secret
- Find in: ServiceM8 Developer Portal → API Credentials
- Required for: ServiceM8 OAuth flow

### Ascora Integration

**Note:** Ascora uses API Key authentication instead of OAuth

Ascora API keys are stored per-user in the database (encrypted). Users enter their API key through the integrations UI. No environment variables required for Ascora.

### Setting Integration Variables in Vercel

```bash
# Token encryption key (REQUIRED for production)
printf "$(openssl rand -hex 32)" | vercel env add INTEGRATION_ENCRYPTION_KEY production

# Xero
printf "your_xero_client_id" | vercel env add XERO_CLIENT_ID production
printf "your_xero_client_secret" | vercel env add XERO_CLIENT_SECRET production

# QuickBooks
printf "your_quickbooks_client_id" | vercel env add QUICKBOOKS_CLIENT_ID production
printf "your_quickbooks_client_secret" | vercel env add QUICKBOOKS_CLIENT_SECRET production

# MYOB
printf "your_myob_client_id" | vercel env add MYOB_CLIENT_ID production
printf "your_myob_client_secret" | vercel env add MYOB_CLIENT_SECRET production

# ServiceM8
printf "your_servicem8_client_id" | vercel env add SERVICEM8_CLIENT_ID production
printf "your_servicem8_client_secret" | vercel env add SERVICEM8_CLIENT_SECRET production
```

### OAuth Callback URLs

Configure these redirect URIs in each provider's developer portal:

| Provider | Redirect URI |
|----------|-------------|
| Xero | `https://restoreassist.app/api/integrations/external/xero/callback` |
| QuickBooks | `https://restoreassist.app/api/integrations/external/quickbooks/callback` |
| MYOB | `https://restoreassist.app/api/integrations/external/myob/callback` |
| ServiceM8 | `https://restoreassist.app/api/integrations/external/servicem8/callback` |

**Development URLs:**
- Replace `https://restoreassist.app` with `http://localhost:3000`

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

## Property Data Integration (Phase 5 - Jan 2026) - Hybrid Approach

### Architecture: Free Scrapers + CoreLogic Fallback

Property lookups use an intelligent hybrid strategy to minimize costs:
1. **Australian Real Estate Scrapers** (FREE): domain.com.au, realestate.com.au, onthehouse.com.au
2. **CoreLogic API Fallback** (PAID): Used only if all scrapers fail or return low-confidence results

**Cost Savings**: ~65-70% reduction in lookup costs. Average cost: $0.70 per lookup (vs. $2.30 without scraping).

### Required: CoreLogic API (Fallback Only)

**CORELOGIC_API_KEY**
- Authentication key for CoreLogic Property Details API (used as fallback)
- Format: Bearer token provided by CoreLogic
- SENSITIVE - Keep secret, never expose
- Required for: Property data lookups when scrapers fail
- Pricing: $2.00 per lookup + 15% markup ($2.30 per API call)
- Find in: CoreLogic Developer Portal → API Keys
- Cost Optimization:
  - 90-day caching prevents duplicate charges for same address
  - ~60-70% of lookups served free from Australian real estate sites
  - Only metered when CoreLogic API actually called

**CORELOGIC_API_URL**
- Base URL for CoreLogic API endpoints (fallback only)
- Production: `https://api.corelogic.com.au/v1`
- Required for: Property detail API fallback
- Find in: CoreLogic API Documentation → Base URL

### Setting CoreLogic Variables in Vercel

```bash
# Development (.env.local)
CORELOGIC_API_KEY=your_api_key_here
CORELOGIC_API_URL=https://api.corelogic.com.au/v1

# Production (Vercel)
printf "your_api_key" | vercel env add CORELOGIC_API_KEY production
printf "https://api.corelogic.com.au/v1" | vercel env add CORELOGIC_API_URL production
```

### Property Lookup Strategy

When user clicks "Lookup Property Data" button:

**Phase 1: Free Scraping (300ms total with rate limiting)**
1. domain.com.au → Search for address → Extract property details
2. realestate.com.au → Search for address → Extract property details
3. onthehouse.com.au → Search for address → Extract property details

**Confidence Scoring**:
- **High**: 5+ property fields populated (year built, bedrooms, bathrooms, materials, area)
- **Medium**: 2-4 property fields populated (bedrooms, bathrooms, year built)
- **Low**: 1 property field populated

**Phase 2: Fallback Decision**
- If any scraper returns **HIGH confidence**: Return immediately, NO CHARGE
- If scrapers return **MEDIUM confidence**: Return scraper data, NO CHARGE
- If scrapers return **LOW confidence** or all fail: Fall back to CoreLogic API, **CHARGE $2.30**

### Property Data Fields

Fetched by scrapers or CoreLogic:
- Year Built (year of construction) - for compliance triggers (asbestos/lead assessment)
- Wall Material (Brick, Timber, Concrete, Brick Veneer)
- Wall Construction (Single Brick, Double Brick, Cavity, Veneer)
- Roof Material (Tiles, Metal, Membrane, Slate)
- Floor Type (Concrete Slab, Suspended Timber, Raised)
- Floor Area (total living area in sqm)
- Bedrooms & Bathrooms
- Land Area (total property size in sqm)
- Stories (building height/levels)

### Caching Behavior

**Database**: PropertyLookup table stores all lookups with metadata

- **Cache Duration**: 90 days from original lookup date
- **Cache Expiration**: Automatic after 90 days
- **Cost on Cache Hit**: $0.00 (free, uses cached data regardless of source)
- **Cost on Scraper Success**: $0.00 (free, no API call needed)
- **Cost on CoreLogic Fallback**: $2.30 (only when all scrapers fail/low confidence)
- **Average Cost**: ~$0.70 per lookup (accounting for 60-70% free scraper hits)

### Data Source Tracking

Each PropertyLookup record tracks:
- `dataSource`: "domain" | "realestate" | "onthehouse" | "corelogic"
- `lookupCost`: 0 for scrapers, 2.30 for CoreLogic
- `confidence`: "high" | "medium" | "low"

**UI Feedback**:
- Free sources show green badge: "✨ Free from domain.com.au"
- CoreLogic shows blue badge: "📊 CoreLogic Database"
- Cache hits show: "✨ Data from cache"

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

**Last Updated**: 2026-01-12
