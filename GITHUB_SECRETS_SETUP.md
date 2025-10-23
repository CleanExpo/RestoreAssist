# GitHub Secrets Setup Guide

## Required GitHub Secrets

To enable automated deployments via GitHub Actions, configure the following secrets:

**Location:** Repository → Settings → Secrets and variables → Actions → New repository secret

## Core Deployment Secrets

### Vercel Authentication

```bash
# Get from: https://vercel.com/account/tokens
VERCEL_TOKEN=<your-vercel-api-token>

# Get from Vercel CLI: vercel project ls
# Or from Vercel Dashboard → Project Settings
VERCEL_ORG_ID=<your-vercel-org-id>
VERCEL_PROJECT_ID=<backend-project-id>

# For separate frontend deployment (if using)
VERCEL_ORG_ID_FRONTEND=<frontend-org-id>
VERCEL_PROJECT_ID_FRONTEND=<frontend-project-id>
```

### Deployment URLs (for health checks)

```bash
BACKEND_URL=https://restoreassist.app
FRONTEND_URL=https://restoreassist.app
```

## Backend Environment Secrets

### Critical (Required)

```bash
# Anthropic API for AI report generation
ANTHROPIC_API_KEY=sk-ant-api03-...

# JWT Authentication
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
JWT_SECRET=<base64-encoded-secret>
JWT_REFRESH_SECRET=<base64-encoded-secret>

# Stripe Payment Processing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CORS Configuration
ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
```

### Important (Recommended)

```bash
# Google OAuth
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Error Tracking
SENTRY_DSN=https://...@sentry.io/...

# Database
USE_POSTGRES=false
```

## Frontend Environment Secrets

### Critical (Required)

```bash
# API Configuration
VITE_API_URL=/api
VITE_API_URL_PROD=/api

# Google OAuth
VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com

# Stripe Configuration
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_STRIPE_PRICE_FREE_TRIAL=price_1SK6CHBY5KEPMwxdjZxT8CKH
VITE_STRIPE_PRICE_MONTHLY=price_1SK6GPBY5KEPMwxd43EBhwXx
VITE_STRIPE_PRICE_YEARLY=price_1SK6I7BY5KEPMwxdC451vfBk
```

### Optional

```bash
# Error Tracking
VITE_SENTRY_DSN=https://...@sentry.io/...
```

## Quick Setup Commands

### 1. Get Vercel Credentials

```bash
# Login to Vercel
vercel login

# Link to project
cd /d/RestoreAssist
vercel link

# Get project details
vercel project ls
```

### 2. Generate JWT Secrets

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate JWT_REFRESH_SECRET (must be different!)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Get Stripe Configuration

1. Go to: https://dashboard.stripe.com/apikeys
2. Copy Live mode publishable key → `VITE_STRIPE_PUBLISHABLE_KEY`
3. Copy Live mode secret key → `STRIPE_SECRET_KEY`
4. Go to: https://dashboard.stripe.com/webhooks
5. Create webhook: `https://restoreassist.app/api/stripe/webhook`
6. Copy signing secret → `STRIPE_WEBHOOK_SECRET`

### 4. Get Google OAuth Configuration

1. Go to: https://console.cloud.google.com/apis/credentials
2. Select your project
3. Find OAuth 2.0 Client ID
4. Copy Client ID → `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`
5. Copy Client Secret → `GOOGLE_CLIENT_SECRET`

### 5. Get Sentry DSN

1. Go to: https://sentry.io/settings/projects/
2. Select your project
3. Copy DSN → `SENTRY_DSN` (backend) and `VITE_SENTRY_DSN` (frontend)

## Adding Secrets to GitHub

### Via Web Interface

1. Go to: https://github.com/unite-group/RestoreAssist/settings/secrets/actions
2. Click "New repository secret"
3. Enter name and value
4. Click "Add secret"
5. Repeat for all secrets

### Via GitHub CLI

```bash
# Install GitHub CLI
# macOS: brew install gh
# Windows: choco install gh

# Login
gh auth login

# Set secrets
gh secret set VERCEL_TOKEN
gh secret set VERCEL_ORG_ID
gh secret set VERCEL_PROJECT_ID
gh secret set ANTHROPIC_API_KEY
gh secret set JWT_SECRET
gh secret set JWT_REFRESH_SECRET
gh secret set STRIPE_SECRET_KEY
gh secret set STRIPE_WEBHOOK_SECRET
# ... continue for all secrets
```

## Verifying Setup

### Check Secrets are Set

```bash
# List all secrets (values are hidden)
gh secret list
```

### Test Deployment Workflow

1. Push a commit to a feature branch
2. Create a pull request
3. Check GitHub Actions tab
4. Verify workflow runs without "Secret not found" errors

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use environment-specific secrets** (prod vs staging)
3. **Rotate secrets regularly** (every 90 days)
4. **Audit secret access** in GitHub
5. **Use scoped tokens** (minimum required permissions)
6. **Enable secret scanning** in GitHub
7. **Review secret usage** in workflow logs

## Troubleshooting

### Secret Not Found Error

**Error:** `Error: Secret ANTHROPIC_API_KEY not found`

**Solution:**
1. Verify secret name matches exactly (case-sensitive)
2. Check secret is added to correct repository
3. Verify workflow has access to secrets

### Secret Value Not Working

**Error:** `401 Unauthorized` or `Invalid credentials`

**Solution:**
1. Verify secret value is correct (no extra spaces)
2. Check secret hasn't expired
3. Regenerate secret from provider (Stripe, Google, etc.)
4. Update secret in GitHub

### Workflow Can't Access Secrets

**Error:** `Secrets are not available for pull requests from forks`

**Solution:**
- This is expected for fork PRs (security feature)
- Maintainers must run workflows manually for fork PRs
- Or: approve fork to have workflow access

## Maintenance

### Regular Tasks

- [ ] **Monthly:** Review and audit secret access logs
- [ ] **Quarterly:** Rotate all secrets (JWT, API keys)
- [ ] **As needed:** Update Stripe webhook secrets when URL changes
- [ ] **As needed:** Regenerate OAuth credentials if compromised

### Emergency Procedures

**If secrets are compromised:**

1. **Immediately rotate** the compromised secret:
   - Regenerate in provider (Stripe, Google, Vercel, etc.)
   - Update in GitHub secrets
   - Update in Vercel environment variables

2. **Review access logs** to determine impact

3. **Notify team** of the incident

4. **Update documentation** with lessons learned

## Checklist

Before first deployment:

- [ ] All Vercel secrets configured
- [ ] All backend environment secrets configured
- [ ] All frontend environment secrets configured
- [ ] JWT secrets generated and unique
- [ ] Stripe webhook configured and tested
- [ ] Google OAuth redirect URIs configured
- [ ] Sentry projects created and DSNs added
- [ ] Secrets verified with `gh secret list`
- [ ] Test workflow run completed successfully
- [ ] Team notified of deployment credentials

---

**Last Updated:** 2025-10-23
**Setup Time:** ~30 minutes
**Next Review:** After first production deployment
