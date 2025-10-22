# Environment Variables - Status Report

## ✅ Frontend Variables (restore-assist-frontend)

All required frontend variables are now set:

| Variable | Status | Environment | Value Type |
|----------|--------|-------------|------------|
| `VITE_API_URL` | ✅ Set | Production, Preview, Development | `/api` |
| `VITE_GOOGLE_CLIENT_ID` | ✅ Set | Production, Preview, Development | Google OAuth Client ID |
| `VITE_STRIPE_PUBLISHABLE_KEY` | ✅ Set | Production, Preview, Development | Stripe Public Key |
| `VITE_STRIPE_PRODUCT_FREE_TRIAL` | ✅ Set | Production | `prod_TGdTtgqCXY34na` |
| `VITE_STRIPE_PRODUCT_MONTHLY` | ✅ Set | Production | `prod_TGdXM0eZiBxmfW` |
| `VITE_STRIPE_PRODUCT_YEARLY` | ✅ Set | Production | `prod_TGdZP6UNZ8ONMh` |
| `VITE_STRIPE_PRICE_FREE_TRIAL` | ✅ Set | Production | `price_1SK6CHBY5KEPMwxdjZxT8CKH` |
| `VITE_STRIPE_PRICE_MONTHLY` | ✅ Set | Production | `price_1SK6GPBY5KEPMwxd43EBhwXx` |
| `VITE_STRIPE_PRICE_YEARLY` | ✅ Set | Production | `price_1SK6I7BY5KEPMwxdC451vfBk` |

## ✅ Backend Variables (restore-assist-backend)

Critical backend variables verified:

| Variable | Status | Value/Notes |
|----------|--------|-------------|
| `NODE_ENV` | ✅ Set | Production |
| `JWT_SECRET` | ✅ Set | Encrypted |
| `JWT_REFRESH_SECRET` | ✅ Set | Encrypted |
| `GOOGLE_CLIENT_ID` | ✅ Set | OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ Set | OAuth Secret |
| `GOOGLE_REDIRECT_URI` | ⚠️ Set | Currently: `localhost` (needs manual update to production) |
| `STRIPE_SECRET_KEY` | ✅ Set | Encrypted |
| `STRIPE_WEBHOOK_SECRET` | ✅ Set | Encrypted |
| `STRIPE_PRODUCT_*` | ✅ Set | All 3 product IDs |
| `STRIPE_PRICE_*` | ✅ Set | All 3 price IDs |
| `SENDGRID_API_KEY` | ✅ Set | Email service key |
| `EMAIL_FROM` | ✅ Set | `RestoreAssist <noreply@restoreassist.app>` |
| `ALLOWED_ORIGINS` | ✅ Set | `https://restoreassist.app,https://www.restoreassist.app` |
| `FRONTEND_URL` | ✅ Set | `https://restoreassist.app` |
| `SUPABASE_*` | ✅ Set | Database credentials |
| `ANTHROPIC_API_KEY` | ✅ Set | For AI features |

## ⚠️ Action Required

### 1. Update Google OAuth Redirect URI

The `GOOGLE_REDIRECT_URI` is currently set to localhost. You need to:

**Option A: Update in Vercel Dashboard**
1. Go to: https://vercel.com/unite-group/restore-assist-backend/settings/environment-variables
2. Find `GOOGLE_REDIRECT_URI`
3. Click Edit
4. Change to: `https://restoreassist.app/api/integrations/google-drive/callback`
5. Save

**Option B: Delete and Re-add via CLI**
```bash
cd packages/backend
vercel env rm GOOGLE_REDIRECT_URI production  # Type 'y' to confirm
echo "https://restoreassist.app/api/integrations/google-drive/callback" | vercel env add GOOGLE_REDIRECT_URI production
```

### 2. Update Google Cloud Console

**IMPORTANT**: Also update the authorized redirect URI in Google Cloud Console:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Select your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   - `https://restoreassist.app/api/integrations/google-drive/callback`
   - `https://restoreassist.app/api/auth/google/callback`
4. Save

## 📋 Optional Variables (Can Add Later)

These are optional but recommended:

### Frontend
- `VITE_SENTRY_DSN` - Error tracking (if using Sentry)
- `VITE_APP_VERSION` - App version for tracking
- `VITE_DEMO_VIDEO_ID` - YouTube video ID for demos

### Backend
- `SENTRY_DSN` - Backend error tracking
- `SENTRY_AUTH_TOKEN` - Sentry upload token
- `SERVICEM8_API_KEY` - ServiceM8 integration (if using)
- `SERVICEM8_DOMAIN` - ServiceM8 domain

## ✅ Summary

**Frontend**: 9/9 required variables set ✅
**Backend**: 48/49 required variables set (1 needs manual update)

**Next Steps**:
1. Update `GOOGLE_REDIRECT_URI` to production URL
2. Update Google Cloud Console redirect URIs
3. Redeploy both projects to pick up new environment variables

## How to Redeploy

After updating environment variables:

```bash
# Trigger redeploy via git
git commit --allow-empty -m "chore: Trigger redeploy for env var updates"
git push origin main
```

Or manually in Vercel Dashboard:
- Go to Deployments
- Click latest → Redeploy

**Environment variables fixed! 🎉**
