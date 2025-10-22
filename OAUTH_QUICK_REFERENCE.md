# 🎯 Google OAuth Fix - Quick Reference Card

## Your Configuration Details

**Client ID:** `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`
**Console URL:** https://console.cloud.google.com/apis/credentials

---

## URLs to Add (Copy-Paste Ready)

### Authorized JavaScript Origins (6 URLs)

```
http://localhost:5173
http://localhost:5174
http://localhost:3000
http://localhost:80
https://restoreassist.app
https://www.restoreassist.app
```

### Authorized Redirect URIs (8 URLs)

```
http://localhost:5173
http://localhost:5173/
http://localhost:3001/api/integrations/google-drive/callback
http://localhost:3001/api/auth/google/callback
https://restoreassist.app
https://restoreassist.app/
https://api.restoreassist.app/api/integrations/google-drive/callback
https://api.restoreassist.app/api/auth/google/callback
```

---

## 5-Minute Process

1. ✅ Go to: https://console.cloud.google.com/apis/credentials
2. ✅ Click **Edit** (✏️) on Client ID `292141944467-...`
3. ✅ Add 6 JavaScript origins (see above)
4. ✅ Add 8 redirect URIs (see above)
5. ✅ Click **SAVE**

---

## Verification Command

```bash
npm run verify:oauth
```

---

## Manual Test

1. Open http://localhost:5173
2. Click "Start Free Trial"
3. Click "Sign in with Google"
4. **Success:** Google popup opens ✅
5. **Failure:** 403 error in console ❌

---

## Need Help?

**Full guide:** `GOOGLE_OAUTH_FIX_NOW.md`
**Script:** `scripts/verify-oauth.js`
**Time:** 5 minutes
**Impact:** Unblocks 100% of logins 🚀

---

*Keep this card open while configuring Google Cloud Console*
