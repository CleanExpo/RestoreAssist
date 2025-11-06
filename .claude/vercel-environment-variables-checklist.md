# Vercel Environment Variables Checklist

## How to Verify in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Check that each variable below is configured for **Production**, **Preview**, and **Development** environments

---

## 🔴 CRITICAL (Application will NOT work without these)

### Database
- [ ] `DATABASE_URL` - PostgreSQL connection string (should be from Vercel Postgres or external provider)
  - Format: `postgresql://user:password@host:5432/database?sslmode=require`
  - **MUST be configured in Vercel**

### Authentication & Security
- [ ] `NEXTAUTH_SECRET` - Secret for NextAuth session encryption
  - Generate: `openssl rand -base64 32`
  - **CRITICAL for production security**

- [ ] `NEXTAUTH_URL` - Production URL
  - Value: `https://restoreassist.app` (or your actual domain)

### Stripe (Payment Processing)
- [ ] `STRIPE_SECRET_KEY` - Stripe secret key
  - Format: `sk_live_...` for production
  - **DO NOT use test keys in production**

- [ ] `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
  - Format: `pk_live_...` for production

- [ ] `STRIPE_WEBHOOK_SECRET` - Webhook signing secret
  - Format: `whsec_...`
  - Get from Stripe Dashboard → Webhooks

- [ ] `STRIPE_PRICE_ID_MONTHLY` - Monthly subscription price ID
  - Format: `price_...`

- [ ] `STRIPE_PRICE_ID_YEARLY` - Yearly subscription price ID
  - Format: `price_...`

---

## 🟡 REQUIRED (Core features will not work without these)

### Google OAuth (if using Google login)
- [ ] `GOOGLE_CLIENT_ID` - Google OAuth client ID
  - Format: `xxxxx.apps.googleusercontent.com`

- [ ] `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
  - Get from Google Cloud Console

### Email (for notifications and password reset)
- [ ] `SMTP_HOST` - SMTP server hostname
  - Example: `smtp.gmail.com`

- [ ] `SMTP_PORT` - SMTP port
  - Usually: `587` (TLS) or `465` (SSL)

- [ ] `SMTP_SECURE` - Use SSL/TLS
  - Value: `false` for port 587, `true` for port 465

- [ ] `SMTP_USER` - SMTP username/email

- [ ] `SMTP_PASS` - SMTP password or app-specific password

- [ ] `EMAIL_FROM` - From email address
  - Format: `RestoreAssist <noreply@restoreassist.app>`

### AI Services (Optional - users bring their own keys)
- [ ] `ANTHROPIC_API_KEY` - Platform default (optional, users can provide their own)
  - Format: `sk-ant-api03-...`
  - **NOTE**: With BYOK model, this is optional for admin features only

---

## 🟢 OPTIONAL (Nice to have, but not critical)

### Error Monitoring (Sentry)
- [ ] `SENTRY_DSN` - Sentry error tracking DSN
  - Recommended for production monitoring

- [ ] `SENTRY_TRACES_SAMPLE_RATE` - Performance monitoring
  - Default: `0.1` (10%)

### Analytics
- [ ] `GA_TRACKING_ID` - Google Analytics tracking ID
  - Format: `G-XXXXXXXXXX`

- [ ] `MIXPANEL_TOKEN` - Mixpanel analytics token

### Storage (AWS S3)
- [ ] `AWS_ACCESS_KEY_ID` - AWS access key
- [ ] `AWS_SECRET_ACCESS_KEY` - AWS secret key
- [ ] `AWS_REGION` - AWS region (e.g., `us-east-1`)
- [ ] `S3_BUCKET_NAME` - S3 bucket name
- [ ] `CDN_URL` - CDN URL (if using CloudFront)

### External Integrations
- [ ] `SERVICEM8_API_KEY` - ServiceM8 integration (if enabled)
- [ ] `SERVICEM8_DOMAIN` - ServiceM8 domain
- [ ] `GOOGLE_DRIVE_CLIENT_ID` - Google Drive integration
- [ ] `GOOGLE_DRIVE_CLIENT_SECRET` - Google Drive secret
- [ ] `ASCORA_API_KEY` - Ascora CRM integration
- [ ] `ASCORA_ACCOUNT_ID` - Ascora account ID

### Feature Flags (Optional, have defaults)
- [ ] `ENABLE_TRIAL_MODE` - Default: `true`
- [ ] `ENABLE_SERVICEM8` - Default: `false`
- [ ] `ENABLE_GOOGLE_DRIVE` - Default: `false`
- [ ] `ENABLE_ASCORA` - Default: `false`
- [ ] `ENABLE_EMAIL_NOTIFICATIONS` - Default: `true`

### Rate Limiting (Has defaults)
- [ ] `RATE_LIMIT_WINDOW_MS` - Default: `900000` (15 min)
- [ ] `RATE_LIMIT_MAX_REQUESTS` - Default: `100`

---

## ⚙️ Vercel Automatic Variables

These are automatically set by Vercel - **DO NOT manually configure**:
- ✅ `VERCEL` - Automatically `1` when deployed on Vercel
- ✅ `VERCEL_ENV` - Automatically set to `production`, `preview`, or `development`
- ✅ `VERCEL_URL` - Automatically set to deployment URL
- ✅ `VERCEL_GIT_COMMIT_SHA` - Git commit hash

---

## 🔧 Configuration Instructions

### Step 1: Access Vercel Environment Variables
```bash
# Go to: https://vercel.com/[your-account]/[project-name]/settings/environment-variables
```

### Step 2: Add Variables by Environment
For each variable:
1. Click "Add New"
2. Enter variable name (e.g., `DATABASE_URL`)
3. Enter variable value
4. Select environments:
   - ✅ Production (for live site)
   - ✅ Preview (for PR previews - can use different values)
   - ✅ Development (for `vercel dev` - can use different values)
5. Click "Save"

### Step 3: Verify Database Configuration
The most critical is `DATABASE_URL`. In Vercel:
1. If using **Vercel Postgres**:
   - Go to Storage tab
   - Connect Postgres database
   - Environment variables are automatically added

2. If using **external PostgreSQL**:
   - Add `DATABASE_URL` manually
   - Ensure SSL is enabled: `?sslmode=require`
   - Test connection before deploying

### Step 4: Update Production URLs
Make sure these match your actual domain:
- `NEXTAUTH_URL` = `https://restoreassist.app` (not localhost!)
- `GOOGLE_REDIRECT_URI` = `https://restoreassist.app/api/auth/callback/google`
- `ALLOWED_ORIGINS` = `https://restoreassist.app,https://www.restoreassist.app`

### Step 5: Redeploy
After adding/changing environment variables:
```bash
# Variables are only applied on new deployments
# Trigger a new deployment:
git commit --allow-empty -m "Trigger deployment"
git push
```

---

## 🚨 Common Issues

### 1. Database Connection Fails
**Symptom**: "Can't reach database" errors
**Fix**:
- Verify `DATABASE_URL` includes `?sslmode=require`
- Check database is accessible from Vercel's IP ranges
- Test connection: `npx prisma db push`

### 2. Authentication Not Working
**Symptom**: Users can't log in, session errors
**Fix**:
- Verify `NEXTAUTH_SECRET` is set and matches between deployments
- Verify `NEXTAUTH_URL` is production URL (not localhost)
- Check Google OAuth redirect URIs match

### 3. Stripe Webhooks Failing
**Symptom**: Payments complete but don't update database
**Fix**:
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Check webhook endpoint: `https://restoreassist.app/api/webhooks/stripe`
- Ensure webhook is configured for production, not test mode

### 4. Variables Not Taking Effect
**Symptom**: Changes to environment variables don't work
**Fix**:
- Redeploy the application
- Check correct environment (Production/Preview/Development)
- Variables are cached - may need to clear Next.js cache

---

## ✅ Validation Checklist

Before going live:
- [ ] All CRITICAL variables configured in Production
- [ ] `DATABASE_URL` tested and migrations run
- [ ] `NEXTAUTH_SECRET` is unique and secure (not from .env.example)
- [ ] All Stripe keys are LIVE mode (not test mode)
- [ ] `NEXTAUTH_URL` points to production domain
- [ ] Google OAuth redirect URIs updated for production
- [ ] Stripe webhook endpoint configured
- [ ] Email SMTP credentials tested
- [ ] Test signup/login flow in production
- [ ] Test payment flow in production
- [ ] Monitor Vercel logs for any missing variable errors

---

## 📋 Quick Copy Checklist for Vercel

### Minimum Required for MVP:
```
✅ DATABASE_URL
✅ NEXTAUTH_SECRET
✅ NEXTAUTH_URL
✅ STRIPE_SECRET_KEY
✅ STRIPE_PUBLISHABLE_KEY
✅ STRIPE_WEBHOOK_SECRET
✅ STRIPE_PRICE_ID_MONTHLY
✅ STRIPE_PRICE_ID_YEARLY
✅ GOOGLE_CLIENT_ID (if using Google OAuth)
✅ GOOGLE_CLIENT_SECRET (if using Google OAuth)
✅ SMTP_HOST
✅ SMTP_PORT
✅ SMTP_USER
✅ SMTP_PASS
✅ EMAIL_FROM
```

### Recommended for Production:
```
✅ SENTRY_DSN (error monitoring)
✅ GA_TRACKING_ID (analytics)
✅ AWS credentials (file uploads)
```

---

## 🔍 How to Check What's Already Configured

Since you can't access Vercel from here, manually check:

1. **Via Vercel Dashboard**:
   - Settings → Environment Variables
   - Review each variable listed above

2. **Via Vercel CLI** (if installed):
```bash
vercel env ls
vercel env pull .env.production
```

3. **Check Deployment Logs**:
   - Look for "Missing environment variable" errors
   - These will show which variables are not configured

---

## 📞 Need Help?

If you find missing variables or have issues:
1. Check which environment: Production, Preview, or Development
2. Verify the variable name matches exactly (case-sensitive)
3. Check for trailing spaces in values
4. Redeploy after adding variables
5. Monitor deployment logs for errors
