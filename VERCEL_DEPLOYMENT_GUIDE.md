# Vercel Deployment Guide - RestoreAssist

## Overview

RestoreAssist uses a **unified monorepo deployment** to Vercel with the following structure:

```
restoreassist.app
├── /api/*          → Backend API (serverless functions)
└── /*              → Frontend SPA (static files)
```

This eliminates CORS issues and simplifies deployment by serving both frontend and backend from the same domain.

## Prerequisites

1. **Vercel Account**: [Create account](https://vercel.com/signup)
2. **Vercel CLI**: `npm install -g vercel`
3. **GitHub Repository**: Connected to Vercel
4. **Domain**: `restoreassist.app` (configured in Vercel)

## Project Structure

```
RestoreAssist/
├── packages/
│   ├── backend/           # Express API (transpiled to dist/)
│   │   ├── api/index.js   # Vercel serverless handler (per-package)
│   │   ├── dist/          # Compiled TypeScript
│   │   └── vercel.json    # Backend-specific config
│   └── frontend/          # React/Vite SPA
│       ├── dist/          # Built static files
│       └── vercel.json    # Frontend-specific config
├── api/
│   └── index.js           # Root API handler (for unified deployment)
└── vercel.json            # Root Vercel config (unified deployment)
```

## Deployment Options

### Option 1: Unified Deployment (Recommended)

**Advantages:**
- Single domain for frontend and backend
- No CORS configuration needed
- Simpler deployment pipeline
- Consistent URL structure

**Configuration:**
- Root `vercel.json` handles routing
- `/api/*` → Backend serverless functions
- `/*` → Frontend static files

### Option 2: Separate Deployments

**Advantages:**
- Independent scaling
- Separate environment variables
- Team-specific access control

**Configuration:**
- Backend: `restore-assist-backend.vercel.app`
- Frontend: `restoreassist.app`
- Requires CORS configuration

## Step-by-Step Deployment

### 1. Initial Vercel Setup

```bash
# Login to Vercel
vercel login

# Link project (run from root directory)
cd /d/RestoreAssist
vercel link

# Select/create project: restoreassist
# Link to existing project or create new
```

### 2. Configure Environment Variables

#### Backend Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

**Critical (Required):**
```bash
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-api03-...
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
JWT_REFRESH_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
```

**Important (Recommended):**
```bash
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
SENTRY_DSN=https://...@sentry.io/...
USE_POSTGRES=false
```

**Optional:**
```bash
SERVICEM8_API_KEY=...
SERVICEM8_DOMAIN=...
SMTP_HOST=smtp.gmail.com
SMTP_USER=...
SMTP_PASS=...
```

#### Frontend Variables

**Critical (Required):**
```bash
VITE_API_URL=/api
VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_STRIPE_PRICE_FREE_TRIAL=price_1SK6CHBY5KEPMwxdjZxT8CKH
VITE_STRIPE_PRICE_MONTHLY=price_1SK6GPBY5KEPMwxd43EBhwXx
VITE_STRIPE_PRICE_YEARLY=price_1SK6I7BY5KEPMwxdC451vfBk
```

**Optional:**
```bash
VITE_SENTRY_DSN=https://...@sentry.io/...
```

### 3. Configure GitHub Secrets

Add these to GitHub → Settings → Secrets and variables → Actions:

```bash
# Vercel Authentication
VERCEL_TOKEN=<your-vercel-token>
VERCEL_ORG_ID=<your-org-id>
VERCEL_PROJECT_ID=<your-project-id>

# For separate frontend deployment (if using Option 2)
VERCEL_ORG_ID_FRONTEND=<frontend-org-id>
VERCEL_PROJECT_ID_FRONTEND=<frontend-project-id>

# Deployment URLs (for health checks)
BACKEND_URL=https://restoreassist.app
FRONTEND_URL=https://restoreassist.app

# All environment variables (same as Vercel dashboard)
ANTHROPIC_API_KEY=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
ALLOWED_ORIGINS=...
VITE_API_URL=/api
VITE_GOOGLE_CLIENT_ID=...
VITE_STRIPE_PUBLISHABLE_KEY=...
VITE_STRIPE_PRICE_FREE_TRIAL=...
VITE_STRIPE_PRICE_MONTHLY=...
VITE_STRIPE_PRICE_YEARLY=...
```

### 4. Build and Deploy

#### Manual Deployment (Development)

```bash
# Build both packages
npm run build

# Preview deployment
vercel

# Production deployment
vercel --prod
```

#### Automated Deployment (Production)

```bash
# Push to main branch triggers deployment
git push origin main

# Monitor deployment
# GitHub Actions: https://github.com/unite-group/RestoreAssist/actions
# Vercel Dashboard: https://vercel.com/unite-group/restoreassist
```

### 5. Verify Deployment

#### Health Checks

```bash
# Backend health
curl https://restoreassist.app/api/health

# Expected response:
# {"status":"healthy","timestamp":"...","environment":"production","uptime":...}

# CORS test
curl -H "Origin: https://restoreassist.app" https://restoreassist.app/api/cors-test

# Routes debug (if enabled)
curl https://restoreassist.app/api/debug/routes
```

#### Frontend Checks

```bash
# Frontend loads
curl -I https://restoreassist.app

# Expected: HTTP/2 200

# Check for errors in browser console
# Open: https://restoreassist.app
# Check: No console errors, app loads correctly
```

#### Integration Tests

1. **Google OAuth Login**
   - Go to: https://restoreassist.app
   - Click "Start Free Trial"
   - Test Google OAuth flow

2. **Stripe Checkout**
   - Complete OAuth login
   - Select a plan
   - Verify Stripe checkout redirect
   - Test payment flow

3. **API Endpoints**
   - Test authenticated API calls
   - Verify JWT tokens work
   - Check report generation

## Troubleshooting

### Build Failures

**Symptom:** Build fails with TypeScript errors

**Solution:**
```bash
# Clear caches
npm run clean  # If script exists
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

**Symptom:** Build fails with missing dependencies

**Solution:**
```bash
# Install all dependencies
npm ci

# Verify workspaces
npm run build --workspaces
```

### Deployment Failures

**Symptom:** Vercel deployment fails with "Function too large"

**Solution:**
- Check build output size
- Optimize dependencies
- Use external dependencies in `package.json`
- Increase function size limit in Vercel dashboard

**Symptom:** Environment variables not loading

**Solution:**
```bash
# Verify variables are set
vercel env pull .env.vercel.local

# Check variables in Vercel dashboard
# Ensure "Production" environment is selected

# Redeploy to pick up new variables
vercel --prod --force
```

### Runtime Errors

**Symptom:** 500 Internal Server Error

**Solution:**
1. Check Vercel function logs
2. Check Sentry error tracking
3. Verify all required environment variables are set
4. Check API route paths match

**Symptom:** CORS errors in browser

**Solution:**
1. Verify `ALLOWED_ORIGINS` environment variable
2. Check frontend is using `/api` for API calls
3. Verify unified deployment (not separate domains)

**Symptom:** Stripe webhook not working

**Solution:**
1. Update webhook URL in Stripe dashboard: `https://restoreassist.app/api/stripe/webhook`
2. Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
3. Test webhook with Stripe CLI: `stripe listen --forward-to https://restoreassist.app/api/stripe/webhook`

### Performance Issues

**Symptom:** Slow API responses

**Solution:**
- Check Vercel function logs for cold start times
- Optimize bundle size
- Consider using Vercel Edge Functions
- Implement caching for frequently accessed data

**Symptom:** Frontend loads slowly

**Solution:**
- Check bundle size: `npm run build` (look for size warnings)
- Optimize images and assets
- Enable CDN caching in Vercel
- Use code splitting for large components

## Monitoring and Alerts

### Vercel Analytics

Enable in Vercel Dashboard:
- Go to project → Analytics
- Enable Web Analytics
- View real-time metrics

### Sentry Error Tracking

Already configured:
- Frontend: `@sentry/react`
- Backend: `@sentry/node`
- View errors: https://sentry.io

### Uptime Monitoring

Recommended tools:
- **UptimeRobot**: Free, monitors `/api/health`
- **Pingdom**: Advanced monitoring
- **Better Uptime**: Status page + monitoring

### Log Monitoring

- Vercel provides function logs
- For advanced logging, consider:
  - **Logtail**: Structured logging
  - **Datadog**: Full observability
  - **New Relic**: APM + logging

## Domain Configuration

### Custom Domain Setup

1. **Add domain in Vercel:**
   - Go to project → Settings → Domains
   - Add `restoreassist.app` and `www.restoreassist.app`

2. **Configure DNS:**
   - Add CNAME record: `www` → `cname.vercel-dns.com`
   - Add A record: `@` → Vercel IP addresses

3. **SSL Certificate:**
   - Automatically provisioned by Vercel
   - Force HTTPS in Vercel settings

### Environment-Specific Domains

- **Production:** `restoreassist.app`
- **Preview:** `*.vercel.app` (auto-generated per PR)
- **Development:** `localhost:5173`

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  pre-deployment-tests:
    # Run all tests

  build-artifacts:
    # Build and validate

  deploy-backend:
    # Deploy backend

  deploy-frontend:
    # Deploy frontend

  post-deployment-tests:
    # Smoke tests

  deployment-summary:
    # Report status
```

### Deployment Stages

1. **Pre-Deployment:**
   - Unit tests
   - Integration tests
   - E2E tests
   - Build verification

2. **Deployment:**
   - Build artifacts
   - Deploy to Vercel
   - Update environment

3. **Post-Deployment:**
   - Health checks
   - Smoke tests
   - Notify team

## Rollback Procedure

### Quick Rollback

```bash
# List recent deployments
vercel ls

# Rollback to previous deployment
vercel rollback <deployment-url>
```

### GitHub Rollback

1. Identify last good commit: `git log --oneline`
2. Revert to that commit: `git revert <commit-hash>`
3. Push to main: `git push origin main`
4. Wait for automatic deployment

### Manual Rollback

1. Go to Vercel dashboard
2. Navigate to Deployments
3. Find last successful deployment
4. Click "Promote to Production"

## Best Practices

1. **Never commit secrets** - Use environment variables
2. **Test in preview** - Test PRs before merging to main
3. **Monitor errors** - Check Sentry daily
4. **Review logs** - Check Vercel function logs regularly
5. **Automate everything** - Use GitHub Actions for deployments
6. **Document changes** - Update CHANGELOG.md
7. **Version APIs** - Use API versioning for breaking changes
8. **Cache strategically** - Cache static assets and API responses
9. **Optimize bundles** - Keep frontend bundle size under 500KB
10. **Health checks** - Monitor `/api/health` endpoint

## Support

- **Vercel Documentation:** https://vercel.com/docs
- **GitHub Issues:** https://github.com/unite-group/RestoreAssist/issues
- **Team Support:** Contact development team

## Checklist

Before deploying to production:

- [ ] All tests passing
- [ ] Environment variables configured in Vercel
- [ ] GitHub secrets configured
- [ ] Domain configured and verified
- [ ] SSL certificate active
- [ ] Health checks passing
- [ ] Monitoring enabled (Sentry, Vercel Analytics)
- [ ] Uptime monitoring configured
- [ ] Stripe webhooks configured
- [ ] Google OAuth configured
- [ ] Error tracking tested
- [ ] Performance optimized
- [ ] Documentation updated
- [ ] Team notified

---

**Last Updated:** 2025-10-23
**Deployment Status:** Ready for Production
**Next Review:** After first production deployment
