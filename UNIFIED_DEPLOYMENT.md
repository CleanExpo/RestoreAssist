# Unified Monorepo Deployment

This branch merges frontend and backend into a **single Vercel deployment** at `https://restoreassist.app`.

## Benefits

✅ **No more CORS issues** - Same-origin API calls
✅ **Single deployment** - One domain, one project
✅ **Simpler configuration** - No cross-domain cookie issues
✅ **Faster** - No extra DNS/TLS overhead for API calls
✅ **Easier debugging** - All logs in one place

## Architecture

```
https://restoreassist.app/
├── /                    → Frontend (React/Vite)
├── /assets/*            → Static assets
└── /api/*               → Backend API (Express)
```

## Key Changes

### 1. Root vercel.json
Created unified deployment configuration that serves both:
- Frontend: Static build from `packages/frontend/dist`
- Backend: Serverless functions from `packages/backend/api`

### 2. Same-Origin API Calls
Updated `packages/frontend/.env.production`:
```env
# OLD (cross-origin, CORS required):
VITE_API_URL=https://backend-e03gm60ws-unite-group.vercel.app/api

# NEW (same-origin, no CORS needed):
VITE_API_URL=/api
```

### 3. Build Script
Added `vercel-build` script to root `package.json` that builds both packages.

## Required Vercel Environment Variables

Set these in Vercel dashboard for the unified project:

### Backend Variables
```
NODE_ENV=production
JWT_SECRET=<your-secret>
JWT_REFRESH_SECRET=<your-secret>
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-secret>
GOOGLE_REDIRECT_URI=https://restoreassist.app/api/auth/google/callback
STRIPE_SECRET_KEY=<your-key>
STRIPE_WEBHOOK_SECRET=<your-secret>
SENDGRID_API_KEY=<your-key>
EMAIL_FROM=RestoreAssist <noreply@restoreassist.app>
SENTRY_DSN=<your-dsn>
SENTRY_AUTH_TOKEN=<your-token>
```

### Frontend Variables (Build-time)
```
VITE_API_URL=/api
VITE_GOOGLE_CLIENT_ID=<your-client-id>
VITE_STRIPE_PUBLISHABLE_KEY=<your-key>
VITE_STRIPE_PRODUCT_FREE_TRIAL=<product-id>
VITE_STRIPE_PRODUCT_MONTHLY=<product-id>
VITE_STRIPE_PRODUCT_YEARLY=<product-id>
VITE_STRIPE_PRICE_FREE_TRIAL=<price-id>
VITE_STRIPE_PRICE_MONTHLY=<price-id>
VITE_STRIPE_PRICE_YEARLY=<price-id>
VITE_SENTRY_DSN=<your-dsn>
```

## Deployment Steps

1. **Create new Vercel project** (or reconfigure existing)
   - Import from GitHub repository root
   - Framework Preset: Other
   - Build Command: `npm run vercel-build`
   - Output Directory: Leave blank (handled by vercel.json)

2. **Set environment variables** (see above)

3. **Deploy**
   ```bash
   git push origin merge-frontend-backend
   ```

4. **Point domain** to new deployment
   - Remove old frontend project
   - Remove old backend project
   - Point `restoreassist.app` to this unified project

## Testing

After deployment:

```bash
# Test backend health
curl https://restoreassist.app/api/health

# Test frontend loads
curl https://restoreassist.app

# Test in browser
open https://restoreassist.app
```

## Rollback Plan

If issues occur:
1. Switch Vercel domain back to old projects
2. Revert frontend env: `VITE_API_URL=https://backend-e03gm60ws-unite-group.vercel.app/api`
3. Cherry-pick CORS fixes from main branch

## Migration Checklist

- [ ] Create new Vercel project for unified deployment
- [ ] Set all environment variables in Vercel
- [ ] Deploy and test on preview URL
- [ ] Update Google OAuth authorized origins to include new URL
- [ ] Update Stripe webhook URLs if needed
- [ ] Point production domain to new deployment
- [ ] Delete old frontend project
- [ ] Delete old backend project
- [ ] Update DNS if needed
- [ ] Monitor for errors in Sentry

## Notes

- No changes to application code logic
- Only deployment configuration changed
- Backend CORS config still works for local development
- All existing features remain functional
