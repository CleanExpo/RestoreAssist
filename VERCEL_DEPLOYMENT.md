# Vercel Deployment Guide - RestoreAssist

## Backend Deployment (Express.js Serverless)

### Vercel Project Settings

**Framework Preset**: Other (Express.js is handled by custom vercel.json)

**Build Command**:
```bash
npm run build && npm run vercel:prepare
```

**Output Directory**:
```
dist
```

**Install Command**:
```bash
npm install
```

**Root Directory**:
```
packages/backend
```

### Required Environment Variables

Set these in your Vercel project settings (Settings → Environment Variables):

#### Core Application
```bash
NODE_ENV=production
PORT=3001
JWT_SECRET=your-production-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-production-refresh-secret-min-32-chars
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
```

#### Database (PostgreSQL)
```bash
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

#### Anthropic AI
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

#### Stripe (Payment Processing)
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...
STRIPE_PRICE_ID_ANNUAL=price_...
```

#### SendGrid (Email Notifications)
```bash
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@restoreassist.com
SENDGRID_FROM_NAME=RestoreAssist
```

#### Sentry (Error Monitoring)
```bash
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

#### Google OAuth (Optional)
```bash
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=https://restoreassist.app/api/trial-auth/google-callback
```

#### Google Drive Integration (Optional)
```bash
GOOGLE_DRIVE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-...
GOOGLE_DRIVE_REDIRECT_URI=https://restoreassist.app/api/integrations/google-drive/callback
```

#### ServiceM8 Integration (Optional)
```bash
SERVICEM8_API_KEY=your-servicem8-api-key
SERVICEM8_DOMAIN=your-servicem8-domain
```

---

## Frontend Deployment (Vite + React)

### Vercel Project Settings

**Framework Preset**: Vite

**Build Command**:
```bash
npm run build
```

**Output Directory**:
```
dist
```

**Install Command**:
```bash
npm install
```

**Root Directory**:
```
packages/frontend
```

### Required Environment Variables

```bash
VITE_API_BASE_URL=https://restore-assist-backend.vercel.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

---

## Deployment Checklist

### Before First Deployment

- [ ] Create Vercel account and link GitHub repository
- [ ] Create two Vercel projects:
  - `restore-assist-backend` (Express.js API)
  - `restore-assist-frontend` (Vite React app)
- [ ] Set up PostgreSQL database (Vercel Postgres, Supabase, or AWS RDS)
- [ ] Run database migrations
- [ ] Configure all environment variables in Vercel dashboard
- [ ] Set up custom domains (if applicable)

### Backend-Specific Setup

1. **Database Migration**:
   ```bash
   # Connect to your production database
   psql $DATABASE_URL -f packages/backend/src/db/migrations/001_create_subscriptions.sql
   psql $DATABASE_URL -f packages/backend/src/db/migrations/002_fix_subscription_constraint.sql
   ```

2. **Stripe Products Setup**:
   ```bash
   # Run locally with production env vars
   npm run stripe:setup
   ```

3. **Stripe Webhooks**:
   - Go to Stripe Dashboard → Webhooks
   - Add endpoint: `https://restore-assist-backend.vercel.app/api/stripe/webhooks`
   - Select events:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET` env var

4. **Google OAuth Setup** (if using):
   - Go to Google Cloud Console → Credentials
   - Update Authorized redirect URIs:
     - `https://restoreassist.app/api/trial-auth/google-callback`
     - `https://restore-assist-backend.vercel.app/api/trial-auth/google-callback`

### Frontend-Specific Setup

1. **API Connection**:
   - Ensure `VITE_API_BASE_URL` points to your backend Vercel URL
   - Test API connectivity after deployment

2. **CORS Configuration**:
   - Verify `ALLOWED_ORIGINS` in backend includes your frontend domain

---

## Troubleshooting

### "No Output Directory named 'public' found"
✅ **FIXED** - Updated vercel.json to use `@vercel/node` builder and point to `dist/index.js`

### Build Fails with TypeScript Errors
- Run `npm run build` locally to identify errors
- All TypeScript errors should be fixed (as of commit 58a256a)

### Environment Variables Not Working
- Ensure variables are set for all environments (Production, Preview, Development)
- Redeploy after adding/changing environment variables

### Database Connection Fails
- Check `DATABASE_URL` format includes `?sslmode=require` for production
- Verify database allows connections from Vercel IPs
- Test connection string locally first

### Stripe Webhooks Failing
- Verify webhook secret matches Stripe dashboard
- Check webhook endpoint is accessible: `curl https://your-backend.vercel.app/api/stripe/webhooks`
- Review webhook logs in Stripe dashboard

### CORS Errors
- Verify `ALLOWED_ORIGINS` includes your frontend domain
- Check frontend is sending requests to correct API URL
- Ensure headers include `Authorisation` (British spelling as per your preference)

---

## Post-Deployment Verification

### Backend Health Checks

```bash
# General health
curl https://restore-assist-backend.vercel.app/api/health

# Admin health (requires auth)
curl https://restore-assist-backend.vercel.app/api/admin/health \
  -H "Authorisation: Bearer YOUR_TOKEN"

# Test authentication
curl -X POST https://restore-assist-backend.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@restoreassist.com","password":"admin123"}'
```

### Frontend Checks

- [ ] Landing page loads
- [ ] Login/logout works
- [ ] Report generation works
- [ ] Stripe checkout flow works
- [ ] Email notifications sent (check SendGrid dashboard)
- [ ] Error tracking works (check Sentry dashboard)

---

## Performance Optimization

### Backend
- Serverless functions have 10s max duration (configured in vercel.json)
- Consider upgrading to Pro for 60s max duration if needed
- Use connection pooling for database (Prisma handles this)

### Frontend
- Vite automatically optimizes bundle
- Consider enabling Vercel Analytics
- Enable Vercel Speed Insights for performance monitoring

---

## Monitoring

### Sentry Error Tracking
- Production errors: https://sentry.io/your-org/restoreassist-backend/
- Configure alerts for critical errors
- Review error trends weekly

### Stripe Dashboard
- Monitor subscription metrics
- Review failed payments
- Check webhook delivery status

### SendGrid Dashboard
- Monitor email delivery rates
- Review bounce/spam reports
- Check email engagement metrics

---

## Rollback Procedure

If deployment fails:

1. **Via Vercel Dashboard**:
   - Go to Deployments tab
   - Find last working deployment
   - Click "..." → "Promote to Production"

2. **Via Git**:
   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Emergency Hotfix**:
   ```bash
   # Create hotfix branch
   git checkout -b hotfix/critical-issue

   # Make fix
   # ...

   # Commit and push
   git commit -m "Hotfix: description"
   git push origin hotfix/critical-issue

   # Vercel will auto-deploy from this branch
   ```

---

## Support Contacts

- **Vercel Support**: support@vercel.com
- **Stripe Support**: https://support.stripe.com
- **SendGrid Support**: https://support.sendgrid.com
- **Sentry Support**: https://sentry.io/support

---

**Last Updated**: 2025-10-21
**Vercel Configuration Version**: 2
**Backend Framework**: Express.js (Node.js 20.x)
**Frontend Framework**: Vite + React + TypeScript
