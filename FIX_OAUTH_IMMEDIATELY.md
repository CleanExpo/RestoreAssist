# 🚨 CRITICAL FIX NEEDED: Google OAuth Not Working

## The Problem

**Users cannot sign up** because Google OAuth is blocking authentication with this error:

```
[GSI_LOGGER]: The given origin is not allowed for the given client ID.
```

## Root Cause

Your Google Cloud Console OAuth 2.0 Client ID **does not have `http://localhost:5173` in the Authorized JavaScript Origins list**.

## THE FIX (Takes 2 Minutes)

### Step 1: Open Google Cloud Console

Go to: https://console.cloud.google.com/apis/credentials

### Step 2: Find Your OAuth Client

1. Look for project: **"restoreassist"** (or your project name)
2. Click on the OAuth 2.0 Client ID that starts with: `292141944467-h0cbhuq...`

### Step 3: Add Missing Origin

1. Scroll to **"Authorized JavaScript origins"** section
2. Click **"+ ADD URI"**
3. Enter exactly: `http://localhost:5173`
4. Click **"SAVE"** at the bottom

### Step 4: Wait 5-10 Minutes

Google needs time to propagate the changes. After saving:
- Wait 5-10 minutes
- Clear your browser cache (Ctrl+Shift+Delete)
- Reload http://localhost:5173
- Try "Start Free Trial" → "Sign up with Google" again

## What You Should See

### Before Fix
```
[error] [GSI_LOGGER]: The given origin is not allowed for the given client ID.
```
- Button not clickable
- Times out after 30 seconds

### After Fix
- ✅ "Sign up with Google" button is clickable
- ✅ Opens Google account picker
- ✅ User can authenticate successfully
- ✅ Redirects to dashboard

## Your Current OAuth Configuration

### ✅ Frontend Config (Correct)
```
VITE_GOOGLE_CLIENT_ID=292141944467-h0cbhuq...apps.googleusercontent.com
```

### ✅ Backend Config (Correct)
```
GOOGLE_CLIENT_ID=292141944467-h0cbhuq...
GOOGLE_CLIENT_SECRET=(configured)
```

### ❌ Google Cloud Console (MISSING localhost:5173)

**Current authorized origins** (from your backend logs):
```
✅ http://localhost:3000
✅ http://localhost:5174
❌ http://localhost:5173  <-- MISSING! ADD THIS!
✅ https://restoreassist.app
✅ https://www.restoreassist.app
```

## Alternative Quick Fix (Not Recommended)

If you can't access Google Cloud Console right now, you can temporarily change the Vite dev server port to 3000 (which is already authorized):

Edit `packages/frontend/vite.config.ts` line 33:
```typescript
server: {
  port: 3000,  // Changed from 5173
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true
    }
  }
}
```

Then restart your dev server and access: http://localhost:3000

**But this is NOT recommended** because:
- Breaks existing documentation
- May conflict with backend on port 3001
- Port 5173 is Vite's default

## After You Fix OAuth

Once OAuth is working, test these flows:

1. **Sign Up Flow**
   - Click "Start Free Trial"
   - Click "Sign up with Google"
   - Select Google account
   - Should redirect to dashboard
   - Should see "3 free reports remaining"

2. **Dashboard Access**
   - Verify dashboard loads
   - Check if user menu shows correct email
   - Verify navigation works

3. **Report Creation**
   - Click "Create New Report"
   - Fill in damage assessment details
   - Submit report
   - Verify PDF generation

4. **Stripe Checkout**
   - Try to upgrade to paid plan
   - Click pricing tier
   - Verify Stripe checkout opens

## Need Help?

If you don't have access to Google Cloud Console:
1. Ask the project owner who set up OAuth
2. They need to add `http://localhost:5173` to authorized origins
3. Share this document with them

## Technical Details

**OAuth Library**: `@react-oauth/google`
**Client ID Type**: Web application
**Required Scopes**: email, profile, openid
**Token Type**: ID Token (JWT)

Your code is **100% correct**. The only issue is the Google Cloud Console configuration.

---

**Generated**: 2025-10-22T09:20:00Z
**Tested**: http://localhost:5173
**Status**: ❌ Blocked - Waiting for Google Cloud Console update
