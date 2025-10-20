# Vercel Environment Variables Setup

## Required Environment Variables for restore-assist-backend

These environment variables must be set in the Vercel dashboard for the backend to function:

### 1. Core Configuration (REQUIRED)

```bash
# Node Environment
NODE_ENV=production

# Anthropic API (REQUIRED for AI report generation)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# JWT Authentication (REQUIRED)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# CORS (REQUIRED - update with your frontend domain)
ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
```

### 2. Stripe Integration (REQUIRED for subscriptions)

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key

# Stripe Product IDs
STRIPE_PRODUCT_FREE_TRIAL=prod_TGdTtgqCXY34na
STRIPE_PRODUCT_MONTHLY=prod_TGdXM0eZiBxmfW
STRIPE_PRODUCT_YEARLY=prod_TGdZP6UNZ8ONMh

# Stripe Price IDs
STRIPE_PRICE_FREE_TRIAL=price_1SK6CHBY5KEPMwxdjZxT8CKH
STRIPE_PRICE_MONTHLY=price_1SK6GPBY5KEPMwxd43EBhwXx
STRIPE_PRICE_YEARLY=price_1SK6I7BY5KEPMwxdC451vfBk

# Stripe Webhook Secret
STRIPE_WEBHOOK_SECRET=whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa
```

### 3. Database Configuration (Optional - for subscription tracking)

```bash
# PostgreSQL/Supabase (set to false to use in-memory storage)
USE_POSTGRES=false

# If USE_POSTGRES=true, configure these:
# SUPABASE_URL=your_supabase_project_url
# SUPABASE_ANON_KEY=your_supabase_anon_key
# SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 4. Optional Integrations

```bash
# Google OAuth (for user authentication)
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret

# ServiceM8 CRM Integration
# SERVICEM8_API_KEY=your_servicem8_api_key
# SERVICEM8_DOMAIN=your_company_domain

# Google Drive Integration
# GOOGLE_DRIVE_CLIENT_ID=your_google_client_id
# GOOGLE_DRIVE_CLIENT_SECRET=your_google_client_secret
```

## How to Add Environment Variables in Vercel

1. Go to: https://vercel.com/unite-group/restore-assist-backend
2. Click on **Settings** tab
3. Click on **Environment Variables** in the sidebar
4. Add each variable:
   - **Key**: Variable name (e.g., `ANTHROPIC_API_KEY`)
   - **Value**: Your actual value
   - **Environment**: Select **Production**, **Preview**, and **Development**
5. Click **Save**
6. After adding all variables, trigger a new deployment:
   - Go to **Deployments** tab
   - Click the three dots on the latest deployment
   - Select **Redeploy**

## Verifying Setup

After redeployment, check:
- Health endpoint: https://restore-assist-backend.vercel.app/api/health
- Should return: `{"status":"healthy","timestamp":"...","environment":"production"}`

## Minimum Required Variables for Basic Operation

If you want to get it running quickly, set at minimum:

```bash
NODE_ENV=production
ANTHROPIC_API_KEY=your_key_here
JWT_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
ALLOWED_ORIGINS=https://restoreassist.app
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
USE_POSTGRES=false
```

This will enable core functionality without optional integrations.
