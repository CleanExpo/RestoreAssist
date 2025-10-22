# CORS Configuration Guide for Production

## Issue Fixed
The backend was blocking requests from the frontend domain (`https://restoreassist.app`) due to missing CORS configuration.

## Solution Implemented

### 1. Enhanced CORS Configuration
Updated the backend CORS middleware in `packages/backend/src/index.ts` to:
- Support dynamic origin validation
- Automatically allow production domains (`restoreassist.app`, `www.restoreassist.app`)
- Support all Vercel preview deployments (`*.vercel.app`)
- Read additional origins from `ALLOWED_ORIGINS` environment variable
- Include proper preflight handling for OPTIONS requests

### 2. Allowed Origins
The following origins are now automatically allowed:
- `https://restoreassist.app` (production)
- `https://www.restoreassist.app` (production with www)
- `https://*.vercel.app` (all Vercel preview deployments)
- `http://localhost:5173` (local frontend dev)
- `http://localhost:3000` (alternative local frontend)
- `http://localhost:5174` (alternative local frontend)
- Any additional origins specified in `ALLOWED_ORIGINS` environment variable

## Setting Up Vercel Environment Variables

### Backend Configuration (Required)

1. Go to your Vercel project dashboard for the backend
2. Navigate to Settings → Environment Variables
3. Add the following environment variable (optional, as production domains are now hardcoded):

```
Name: ALLOWED_ORIGINS
Value: https://restoreassist.app,https://www.restoreassist.app
```

**Note**: The production domains are now hardcoded in the CORS configuration, so this environment variable is optional. You only need to set it if you want to add additional custom domains.

### Other Required Backend Environment Variables

Make sure these are also set in Vercel for the backend:

```
JWT_SECRET=<generate using: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
JWT_REFRESH_SECRET=<generate another unique value using the same command>
ANTHROPIC_API_KEY=<your Anthropic API key>
NODE_ENV=production
```

### Optional Backend Environment Variables

```
GOOGLE_CLIENT_ID=<for Google OAuth>
GOOGLE_CLIENT_SECRET=<for Google OAuth>
STRIPE_SECRET_KEY=<for payment processing>
STRIPE_WEBHOOK_SECRET=<for Stripe webhooks>
DATABASE_URL=<if using external database>
SENTRY_DSN=<for error monitoring>
```

## Testing the Fix

### 1. Check CORS Headers
After deployment, test the CORS configuration:

```bash
curl -I -X OPTIONS https://your-backend-url.vercel.app/api/health \
  -H "Origin: https://restoreassist.app" \
  -H "Access-Control-Request-Method: GET"
```

You should see these headers in the response:
- `Access-Control-Allow-Origin: https://restoreassist.app`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`

### 2. Test Frontend-Backend Communication
1. Open https://restoreassist.app in your browser
2. Open the browser's Developer Console (F12)
3. Check the Network tab for any CORS errors
4. The application should now load without CORS blocking errors

## Troubleshooting

### If CORS errors persist:

1. **Verify backend deployment**: Ensure the latest code is deployed to Vercel
2. **Check environment variables**: Confirm they're set in Vercel dashboard
3. **Clear browser cache**: Force refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. **Check backend logs**: Look for any CORS rejection warnings in Vercel logs
5. **Test with curl**: Use the curl command above to verify CORS headers

### Common Issues:

- **Missing headers**: Ensure the backend is returning proper CORS headers
- **Credentials issue**: Frontend must include `credentials: 'include'` in fetch requests
- **Wrong backend URL**: Verify the frontend is pointing to the correct backend URL

## Frontend Configuration

Ensure your frontend is configured to send credentials with requests:

```javascript
// In your API client configuration
fetch(url, {
  method: 'GET',
  credentials: 'include', // Important for CORS with credentials
  headers: {
    'Content-Type': 'application/json',
  }
})
```

## Security Notes

- CORS is a browser security feature, not an API security mechanism
- Always validate and authenticate requests on the backend
- Use proper authentication tokens (JWT) for API security
- CORS configuration allows cross-origin requests but doesn't replace proper auth

## Changes Made

- **File**: `packages/backend/src/index.ts`
- **Changes**:
  - Implemented dynamic CORS origin validation
  - Added hardcoded support for production domains
  - Enhanced preflight request handling
  - Added logging for rejected origins
  - Improved CORS options configuration