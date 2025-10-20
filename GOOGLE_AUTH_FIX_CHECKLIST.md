# Google Authentication Fix Checklist

**Generated**: October 20, 2025
**Test Date**: 2025-10-20T02:42:59Z
**Status**: 🔴 BROKEN - Requires immediate fixes

---

## Issues Identified via Playwright Testing

### Critical Errors (Console Logs)

```
❌ [GSI_LOGGER]: The given origin is not allowed for the given client ID.
❌ [GSI_LOGGER]: Provider's accounts list is empty.
❌ [GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token.
❌ Multiple 403 Forbidden errors
```

### Root Cause Analysis

**Primary Issue**: **Origin Mismatch**
- Frontend is running on: `http://localhost:5174`
- Google OAuth expects: `http://localhost:5173`
- **Why**: Port 5173 was in use, Vite automatically used port 5174
- **Impact**: Google OAuth rejects authentication requests from unrecognized origins

---

## Comprehensive Fix Checklist

### ✅ Step 1: Add Missing Origin to Google Cloud Console

**Action Required**: Add `http://localhost:5174` to Authorized JavaScript origins

**How to do this**:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click Edit on OAuth Client: `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
3. In **"Authorized JavaScript origins"** section, click **"+ ADD URI"**
4. Add: `http://localhost:5174`
5. Click **Save**

**Why needed**: The frontend server auto-selected port 5174 because 5173 was occupied

---

### ✅ Step 2: Verify Complete JavaScript Origins List

After Step 1, your **Authorized JavaScript origins** should include:

```
✅ http://localhost:5173  (original dev port)
✅ http://localhost:5174  (current dev port - NEW)
✅ http://localhost:3000  (alternative dev port)
✅ https://restoreassist.app  (production)
✅ https://www.restoreassist.app  (production with www)
✅ https://restore-assist-frontend.vercel.app  (Vercel preview)
```

**Total**: 6 JavaScript origins

---

### ✅ Step 3: Verify Redirect URIs Configuration

Your **Authorized redirect URIs** should include:

```
✅ http://localhost:3001/api/integrations/google-drive/callback
✅ https://restore-assist-backend.vercel.app/api/integrations/google-drive/callback
```

**Optional** (can keep or remove):
- `http://localhost:5173` (duplicate of origin, not needed)
- `http://localhost:3000` (duplicate of origin, not needed)
- `https://restoreassist.app/` (duplicate of origin, not needed)

**Note**: Do NOT add `postmessage` - it causes validation errors

---

### ✅ Step 4: Fix Port Conflict (Optional - For Clean Development)

**Current Situation**: Multiple servers running, causing port conflicts

**Option A: Keep Current Setup** (Easiest)
- Frontend runs on port 5174 (works after Google Cloud Console fix)
- No code changes needed
- Just add port 5174 to Google Cloud Console

**Option B: Fix Port Conflicts** (Cleaner)
1. Kill all node processes:
   ```bash
   tasklist | findstr node
   taskkill /F /IM node.exe
   ```

2. Start fresh:
   ```bash
   # Terminal 1 - Backend
   cd packages/backend
   npm run dev

   # Terminal 2 - Frontend
   cd packages/frontend
   npm run dev
   ```

3. Frontend should use port 5173
4. Use existing Google OAuth configuration

**Recommendation**: Use Option A for now (add 5174 to Google Cloud Console)

---

### ✅ Step 5: Wait for Google Propagation

After saving changes in Google Cloud Console:
- ⏱️ **Wait 5-15 minutes** for Google's systems to propagate changes globally
- ☕ Grab a coffee, take a break
- ❌ **DO NOT test immediately** - you'll get false errors

**Timer**: Set a 10-minute timer

---

### ✅ Step 6: Clear Browser Cache & Test

After waiting 10 minutes:

1. **Clear browser cache**:
   - Chrome: Ctrl+Shift+Delete → Check "Cached images and files" → Clear
   - Or use Incognito/Private window

2. **Navigate to**: http://localhost:5174

3. **Click**: "Sign up with Google" button

4. **Expected behavior**:
   - ✅ Google popup appears
   - ✅ Sign in with your Google account
   - ✅ Popup closes automatically
   - ✅ You're logged in / redirected to dashboard
   - ✅ No errors in console (F12 → Console tab)

5. **Check localStorage** (F12 → Application → Local Storage):
   ```
   ✅ accessToken: (JWT token)
   ✅ refreshToken: (JWT token)
   ✅ sessionToken: (UUID)
   ```

---

## Error Resolution Guide

### Error: "The given origin is not allowed for the given client ID"

**Symptom**: Google OAuth popup doesn't appear, console shows origin error

**Fix**:
1. ✅ Add `http://localhost:5174` to Google Cloud Console JavaScript origins
2. ⏱️ Wait 10-15 minutes for propagation
3. 🧹 Clear browser cache
4. 🔄 Refresh page and try again

---

### Error: "Provider's accounts list is empty"

**Symptom**: No Google accounts appear in popup

**Fix**:
1. ✅ Verify JavaScript origins include your frontend URL
2. 🔄 Sign out of all Google accounts in browser
3. 🔄 Refresh page and sign in again

---

### Error: 403 Forbidden from Google APIs

**Symptom**: Multiple 403 errors in console

**Root Cause**: Origin not authorized in Google Cloud Console

**Fix**:
1. ✅ Add missing origin (http://localhost:5174)
2. ⏱️ Wait for propagation
3. 🧹 Clear cache and test

---

### Error: CORS Error

**Symptom**: `Access to fetch ... blocked by CORS policy`

**Fix**:
1. ✅ Check backend `.env.local`:
   ```
   ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
   ```

2. 🔄 Restart backend server:
   ```bash
   cd packages/backend
   # Stop with Ctrl+C
   npm run dev
   ```

---

## Testing Checklist

### Local Development Testing

After completing all fixes:

- [ ] Open http://localhost:5174 in browser
- [ ] Open DevTools (F12) → Console tab
- [ ] Click "Sign up with Google" button
- [ ] Verify Google popup appears (not a new tab)
- [ ] Sign in with Google account
- [ ] Verify popup closes automatically
- [ ] Check console for errors (should be none)
- [ ] Verify you're redirected/logged in
- [ ] Check localStorage has tokens
- [ ] Test logging out
- [ ] Test logging back in

### Console Log Verification

After successful login, console should show:
```
✅ [vite] connected.
✅ No [GSI_LOGGER] errors
✅ No 403 errors
✅ No origin errors
```

---

## Configuration Summary

### Frontend Environment (`.env`)
```bash
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
```

### Backend Environment (`.env.local`)
```bash
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
```

### Google Cloud Console Settings

**OAuth 2.0 Client ID**: `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`

**Authorized JavaScript origins** (6 total):
- http://localhost:5173
- http://localhost:5174 ⭐ **ADD THIS**
- http://localhost:3000
- https://restoreassist.app
- https://www.restoreassist.app
- https://restore-assist-frontend.vercel.app

**Authorized redirect URIs** (2 required):
- http://localhost:3001/api/integrations/google-drive/callback
- https://restore-assist-backend.vercel.app/api/integrations/google-drive/callback

---

## Production Deployment Checklist

Before deploying to production:

### Frontend Vercel Configuration
- [ ] Environment variable: `VITE_API_URL=https://restore-assist-backend.vercel.app`
- [ ] Environment variable: `VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
- [ ] Deploy to Vercel
- [ ] Test at https://restore-assist-frontend.vercel.app

### Backend Vercel Configuration
- [ ] Environment variable: `GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
- [ ] Environment variable: `GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET`
- [ ] Environment variable: `ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app,https://restore-assist-frontend.vercel.app`
- [ ] Deploy to Vercel
- [ ] Test backend health: https://restore-assist-backend.vercel.app/api/health

### Domain Configuration
- [ ] Test at https://restoreassist.app
- [ ] Test at https://www.restoreassist.app
- [ ] Verify SSL certificates active
- [ ] Test Google Sign In on production domain

---

## Success Criteria

✅ **Local Development**:
- Google Sign In button appears
- Clicking button opens Google popup
- Sign in completes without errors
- User is authenticated
- Tokens stored in localStorage
- No console errors

✅ **Production**:
- All local development criteria
- Works on restoreassist.app
- Works on www.restoreassist.app
- Works on Vercel preview URLs
- SSL/HTTPS working correctly

---

## Troubleshooting Commands

### Check running Node processes
```bash
tasklist | findstr node
```

### Kill all Node processes (Windows)
```bash
taskkill /F /IM node.exe
```

### Check what's using port 3001
```bash
netstat -ano | findstr :3001
```

### Kill specific process by PID
```bash
taskkill /F /PID <PID>
```

### Start backend
```bash
cd packages/backend
npm run dev
```

### Start frontend
```bash
cd packages/frontend
npm run dev
```

### Test backend health
```bash
curl http://localhost:3001/api/health
```

### Test Google OAuth endpoint
```bash
curl http://localhost:3001/api/trial-auth/health
```

---

## Next Steps After Fix

Once Google Sign In is working:

1. **Test Free Trial Flow**:
   - Sign in with Google
   - Activate free trial
   - Generate a report
   - Verify 3 reports limit

2. **Test Subscription Flow**:
   - Navigate to pricing page
   - Test Stripe integration
   - Verify subscription activation

3. **Implement Google Drive Integration**:
   - Expand OAuth scopes (as per previous research)
   - Implement photo upload feature
   - Test Drive API integration

---

## Support & References

**Google Cloud Console**: https://console.cloud.google.com/apis/credentials
**OAuth Client ID**: YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
**Frontend (local)**: http://localhost:5174
**Backend (local)**: http://localhost:3001
**Backend Health**: http://localhost:3001/api/health

**Documentation**:
- Previous research: Google Drive API Integration (in chat history)
- Google OAuth 2.0: https://developers.google.com/identity/protocols/oauth2
- @react-oauth/google: https://www.npmjs.com/package/@react-oauth/google

---

**Status**: 🟡 Awaiting Google Cloud Console fix
**Priority**: 🔴 HIGH - Blocks user authentication
**Estimated Fix Time**: 5 minutes (configuration) + 10 minutes (propagation)
**Last Updated**: October 20, 2025 at 2:43 AM AEDT

---

## Immediate Action Required

🎯 **DO THIS NOW**:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click Edit on your OAuth Client
3. Add `http://localhost:5174` to Authorized JavaScript origins
4. Click Save
5. Wait 10 minutes
6. Test Google Sign In at http://localhost:5174

**After this fix, Google Sign In will work locally!** 🎉
