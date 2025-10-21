# Google OAuth Production Fix Guide

## Issue Summary

**Status**: ⚠️ **CRITICAL** - Blocking production deployment
**Impact**: Users cannot sign in with Google on the production site
**Cause**: Google OAuth credentials not configured for production URLs
**Estimated Fix Time**: 30-45 minutes

---

## Problem Description

When users attempt to sign in with Google on the production site (`https://restoreassist.app`), they receive a FedCM (Federated Credential Management) error:

```
"FederatedCredentialManagementError: origin_not_allowed"
```

This occurs because the Google OAuth Client ID is only authorized for localhost development URLs, not for the production domain.

---

## Solution Steps

### Step 1: Access Google Cloud Console

1. Navigate to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with the account that created the OAuth credentials
3. Select your project (or create one if it doesn't exist)

### Step 2: Navigate to OAuth Configuration

1. In the left sidebar, click **APIs & Services**
2. Click **Credentials**
3. Find your OAuth 2.0 Client ID (currently: `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`)
   - If you don't see it, you may need to create a new one

### Step 3: Update Authorized JavaScript Origins

Click on your OAuth Client ID to edit it, then:

1. Scroll to **Authorized JavaScript origins**
2. Click **+ ADD URI**
3. Add the following origins:

```
https://restoreassist.app
https://www.restoreassist.app
```

**Keep existing localhost origins for development:**
```
http://localhost:5173
http://localhost:3000
```

### Step 4: Update Authorized Redirect URIs

1. Scroll to **Authorized redirect URIs**
2. Click **+ ADD URI**
3. Add the following redirect URIs:

```
https://restoreassist.app
https://restoreassist.app/
https://restoreassist.app/callback
https://www.restoreassist.app
https://www.restoreassist.app/
https://www.restoreassist.app/callback
```

**Keep existing localhost redirects for development:**
```
http://localhost:5173
http://localhost:5173/
http://localhost:5173/callback
http://localhost:3000
http://localhost:3000/
http://localhost:3000/callback
```

### Step 5: Save Changes

1. Click **SAVE** at the bottom of the page
2. Wait 5-10 minutes for changes to propagate across Google's servers
3. **Important**: Changes are not instant! Google needs time to update their systems

### Step 6: Update Environment Variables (If Needed)

If you created a **new** OAuth Client ID:

1. Copy the new Client ID from Google Cloud Console
2. Update the frontend environment variable:

**For Vercel (Production):**
```bash
# Go to Vercel Dashboard → Your Project → Settings → Environment Variables
# Update or add:
VITE_GOOGLE_CLIENT_ID=your-new-client-id-here
```

**For Local Development:**
```bash
# Update packages/frontend/.env
VITE_GOOGLE_CLIENT_ID=your-new-client-id-here
```

3. Redeploy the frontend if you changed the Client ID

### Step 7: Test the Fix

After waiting 5-10 minutes:

1. Open a **private/incognito window** (to clear OAuth cache)
2. Navigate to `https://restoreassist.app`
3. Click "Sign up with Google"
4. Complete the Google sign-in flow
5. Verify you're redirected back to the app successfully

---

## Verification Checklist

- [ ] Accessed Google Cloud Console with correct account
- [ ] Found OAuth 2.0 Client ID in Credentials
- [ ] Added `https://restoreassist.app` to Authorized JavaScript origins
- [ ] Added `https://www.restoreassist.app` to Authorized JavaScript origins
- [ ] Added all production redirect URIs
- [ ] Clicked SAVE in Google Cloud Console
- [ ] Waited 5-10 minutes for propagation
- [ ] Tested sign-in on production site in incognito mode
- [ ] Verified successful sign-in and redirect

---

## Common Issues

### Issue: "Still getting FedCM error after updating"

**Solution**:
- Wait longer (up to 15 minutes for changes to propagate)
- Clear browser cache and cookies
- Use a different browser or incognito mode
- Double-check that you saved the changes in Google Cloud Console

### Issue: "Can't find my OAuth Client ID"

**Solution**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Credentials
3. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
4. Choose **Web application** as Application type
5. Add name: "RestoreAssist Production"
6. Follow steps 3-5 above to configure origins and redirect URIs
7. Update the Client ID in your environment variables

### Issue: "Getting 'redirect_uri_mismatch' error"

**Solution**:
- The redirect URI in your Google Cloud Console doesn't match the one your app is using
- Check browser developer console for the exact URI being used
- Add that exact URI to Authorized redirect URIs in Google Cloud Console
- Common missing URIs: `/`, `/callback`, `/auth/callback`

### Issue: "Users getting consent screen every time"

**Solution**:
- This is expected if your OAuth app is in "Testing" mode
- Go to OAuth consent screen in Google Cloud Console
- Click **PUBLISH APP** to move from Testing to Production
- Note: You may need to submit for verification if using sensitive scopes

---

## Frontend Code Reference

The Google OAuth integration is implemented in:

**File**: `packages/frontend/src/components/LandingPage.tsx`
**Lines**: ~117-125

```typescript
<GoogleLogin
  onSuccess={handleGoogleLogin}
  onError={() => console.error('Google Login Failed')}
  theme="filled_blue"
  size="large"
  text="signup_with"
  shape="pill"
/>
```

**File**: `packages/frontend/src/pages/FreeTrialLanding.tsx`
**Function**: `GoogleOAuthProvider` wrapper with Client ID from `VITE_GOOGLE_CLIENT_ID`

---

## Backend Integration

The backend handles Google OAuth tokens in:

**File**: `packages/backend/src/services/googleAuthService.ts`
**Function**: `handleGoogleLogin(idToken, ipAddress, userAgent)`

This service:
- Verifies the Google ID token
- Creates or updates user accounts
- Generates JWT tokens for session management
- Links users to free trial system

---

## Security Notes

1. **Never commit OAuth secrets**: Client secrets (if using) should be in `.env` files, not committed to git
2. **Client ID is public**: The Client ID (starts with numbers) can be safely exposed in frontend code
3. **Use HTTPS only in production**: Google OAuth requires HTTPS for production URLs
4. **Verify tokens on backend**: Always verify Google ID tokens server-side for security

---

## Rollback Plan

If OAuth changes cause issues:

1. **Revert to localhost-only**: Remove production URLs from Google Cloud Console temporarily
2. **Display maintenance message**: Show users a message that login is temporarily unavailable
3. **Investigate logs**: Check browser console and server logs for specific errors
4. **Contact support**: Reach out to Google Cloud Support if changes don't propagate after 24 hours

---

## Post-Fix Actions

After successfully fixing OAuth:

1. **Update documentation**: Mark this task as complete in production checklist
2. **Monitor error logs**: Watch Sentry for any OAuth-related errors
3. **Test regularly**: Add OAuth sign-in to automated E2E tests
4. **Document for team**: Share this fix with team members who may need to update OAuth settings

---

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Sign-In for Web](https://developers.google.com/identity/gsi/web)
- [@react-oauth/google Documentation](https://www.npmjs.com/package/@react-oauth/google)
- [FedCM API Reference](https://developer.mozilla.org/en-US/docs/Web/API/FedCM_API)

---

## Contact for Help

If you encounter issues not covered in this guide:

- **Email**: support@restoreassist.com
- **Check**: `COMPREHENSIVE_HEALTH_REPORT.md` for detailed diagnostics
- **Review**: `PRODUCTION_READINESS_CHECKLIST.md` for related issues

---

**Last Updated**: January 2025
**Next Review**: Before production deployment
