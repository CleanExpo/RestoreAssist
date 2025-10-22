# Vercel Deployment Configuration Fix

**Issue**: CSP blocking backend API calls
**Solution**: Updated CSP + Environment variables

---

## Changes Made

### 1. Fixed Content Security Policy (CSP)

**Updated Files:**
- `packages/frontend/index.html` (line 7)
- `packages/frontend/docker/nginx.conf` (line 21)

**Added to connect-src:**
- `https://*.vercel.app` - Allows all Vercel backend URLs

**Before:**
```
connect-src 'self' https://api.stripe.com https://accounts.google.com https://*.sentry.io https://*.ingest.sentry.io http://localhost:3001
```

**After:**
```
connect-src 'self' https://api.stripe.com https://accounts.google.com https://*.sentry.io https://*.ingest.sentry.io https://*.vercel.app http://localhost:3001
```

---

## Vercel Environment Variables Required

### Frontend (Vercel Project Settings)

Navigate to: **Project Settings → Environment Variables**

```bash
# Required
VITE_API_URL=https://backend-e03gm60ws-unite-group.vercel.app
VITE_GOOGLE_CLIENT_ID=292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Optional
VITE_SENTRY_DSN=https://...@sentry.io/...
```

### Backend (Vercel Project Settings)

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Auth
JWT_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>
GOOGLE_CLIENT_ID=292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
OPENAI_API_KEY=sk-...
SENTRY_DSN=https://...@sentry.io/...
USE_POSTGRES=true

# CORS
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://restoreassist.app
```

---

## Deployment Steps

### 1. Deploy Backend First

```bash
cd packages/backend
vercel --prod
```

Get Backend URL: `https://backend-e03gm60ws-unite-group.vercel.app`

### 2. Update Frontend Environment

In Vercel Dashboard:
1. Go to Frontend Project → Settings → Environment Variables
2. Add: `VITE_API_URL=<backend-url>`
3. Save and redeploy

### 3. Deploy Frontend

```bash
cd packages/frontend
vercel --prod
```

### 4. Update Google OAuth

In Google Cloud Console:
1. Add Vercel URLs to Authorized JavaScript origins
2. Add redirect URIs

---

## Verify Deployment

### Test API Connection

```javascript
fetch('https://backend-e03gm60ws-unite-group.vercel.app/api/auth/config')
  .then(r => r.json())
  .then(console.log)
```

Should return config without CSP error.

---

## Production Checklist

- [x] CSP updated to allow Vercel backend
- [ ] Backend deployed to Vercel
- [ ] Backend URL added to frontend VITE_API_URL
- [ ] Frontend redeployed with new env var
- [ ] Google OAuth origins updated
- [ ] Test OAuth flow on production

---

**Status**: CSP fixes ready - redeploy frontend to apply changes
