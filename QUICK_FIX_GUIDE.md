# Quick Fix Guide - Production Blocker

## 🚨 CRITICAL: Fix This Before Production Deploy

### Bug #1: Google OAuth Not Working

**Error:** `The given origin is not allowed for the given client ID`

**Fix in 5 minutes:**

1. Open: https://console.cloud.google.com/apis/credentials
2. Click on: `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`
3. Add these to **Authorized JavaScript origins:**
   ```
   http://localhost:5173
   http://localhost:5174
   http://localhost:3000
   https://restoreassist.app
   https://www.restoreassist.app
   ```
4. Add these to **Authorized redirect URIs:**
   ```
   http://localhost:5173
   https://restoreassist.app
   https://www.restoreassist.app
   ```
5. Click **SAVE**

**Test:**
```bash
# Open browser to http://localhost:5173
# Click "Start Free Trial"
# Click "Sign in with Google"
# Should work without 403 error
```

---

## ✅ Already Fixed in Code

### Bug #2: Cookie Banner Fixed
- File: `packages/frontend/src/components/CookieConsent.tsx`
- Fix: Added `pointer-events-none` to wrapper
- Status: ✅ Ready to deploy

### Bug #3: React Warnings Fixed
- File: `packages/frontend/src/components/ui/card.tsx`
- Fix: Changed `CardDescription` from `<p>` to `<div>`
- Status: ✅ Ready to deploy

---

## 📋 Files Changed

```bash
git status
# Should show:
#   modified:   packages/frontend/src/components/CookieConsent.tsx
#   modified:   packages/frontend/src/components/ui/card.tsx
```

## 🚀 Deploy Checklist

- [ ] Fix Google OAuth origins in Google Cloud Console
- [ ] Test OAuth login works
- [ ] Commit code fixes
- [ ] Deploy to production
- [ ] Verify production OAuth works

---

See `BUGS_FIXED_SUMMARY.md` for full details.
