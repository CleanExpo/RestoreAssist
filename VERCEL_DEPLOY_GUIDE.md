# Vercel Backend Deployment Guide

## URGENT: Deploy backend to production NOW

### Method 1: Vercel CLI (From backend directory)

```bash
cd packages/backend
vercel --prod
```

**If you get git author error:**
```bash
# Link the project properly first
vercel link

# Then deploy
vercel --prod
```

---

## Method 2: Vercel Dashboard (RECOMMENDED - More Reliable)

### Step-by-Step Instructions:

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/unite-group
   - Find project: `restore-assist-backend`

2. **Go to Settings**
   - Click on the project
   - Click "Settings" tab

3. **Configure Root Directory**
   - Go to "General" section
   - Find "Root Directory" setting
   - Set to: `packages/backend`
   - Click "Save"

4. **Configure Build Settings**
   - Stay in Settings → General
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   - Node.js Version: `20.x`

5. **Set Environment Variables**
   - Go to Settings → "Environment Variables"
   - Add all required variables from `.env`:
     - `DATABASE_URL` (Supabase connection string)
     - `JWT_SECRET`
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET`
     - `STRIPE_SECRET_KEY`
     - `STRIPE_WEBHOOK_SECRET`
     - `ALLOWED_ORIGINS` (include production frontend URL)
     - `SENTRY_DSN` (if using Sentry)
     - Any other environment variables your backend needs

6. **Trigger Manual Deployment**
   - Go to "Deployments" tab
   - Click "Redeploy" on the latest deployment
   - OR go to Settings → Git → click "Deploy"

7. **Verify Deployment**
   - Wait for build to complete (~2-5 minutes)
   - Check deployment logs for errors
   - Visit: `https://backend-e03gm60ws-unite-group.vercel.app/api/health`
   - Should return: `{"status":"ok",...}`

---

## What Was Fixed

### Files Updated:
1. **`packages/backend/vercel.json`** - Proper Vercel configuration
2. **`packages/backend/api/index.js`** - Serverless function entry point

### Configuration Details:

**vercel.json:**
```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "outputDirectory": "dist",
  "framework": null,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api/index.js"
    }
  ]
}
```

**api/index.js:**
- Loads compiled Express app from `dist/index.js`
- Exports as Vercel serverless function
- Handles errors gracefully

---

## Troubleshooting

### Error: "vercel.json should be in root directory"
✅ **FIXED** - vercel.json is now in `packages/backend/vercel.json`

### Error: "Git author must have access to team"
**Solution:** Use Vercel Dashboard method instead of CLI

### Error: Build fails with missing dependencies
**Solution:** Check that all dependencies in package.json are correct

### Error: Runtime error "Cannot find module"
**Solution:** Ensure `dist/` folder is built correctly and api/index.js loads it properly

### Error: CORS issues in production
**Solution:** Add production frontend URL to ALLOWED_ORIGINS environment variable:
```
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://restore-assist.com
```

---

## Post-Deployment Checklist

- [ ] Health endpoint works: `/api/health`
- [ ] CORS configured with production frontend URL
- [ ] All environment variables set in Vercel
- [ ] Database connection working
- [ ] Stripe webhooks configured (if using)
- [ ] Test authentication endpoints
- [ ] Monitor logs for errors
- [ ] Update frontend API_BASE_URL to production backend URL

---

## Backend URL
Production: `https://backend-e03gm60ws-unite-group.vercel.app`

Test with:
```bash
curl https://backend-e03gm60ws-unite-group.vercel.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-23T...",
  "message": "CORS is configured correctly"
}
```

---

## Next Steps After Deployment

1. **Update Frontend Environment Variables**
   ```env
   VITE_API_BASE_URL=https://backend-e03gm60ws-unite-group.vercel.app
   ```

2. **Test Critical Endpoints**
   - `/api/health` - Health check
   - `/api/auth/google-login` - Google OAuth
   - `/api/stripe/webhook` - Stripe webhooks
   - `/api/reports` - Report generation

3. **Monitor Logs**
   - Vercel Dashboard → Deployments → Click deployment → "Logs"
   - Watch for errors or warnings

4. **Set Up Custom Domain (Optional)**
   - Vercel Dashboard → Settings → Domains
   - Add custom domain like `api.restore-assist.com`

---

## Emergency Rollback

If deployment breaks production:

1. Go to Vercel Dashboard → Deployments
2. Find last working deployment
3. Click "..." menu → "Promote to Production"
4. Takes effect immediately

---

**DEPLOY NOW USING VERCEL DASHBOARD METHOD ABOVE**
