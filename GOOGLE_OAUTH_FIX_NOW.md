# 🔧 Google OAuth Configuration Fix - Step-by-Step Guide

**Status:** 🔴 CRITICAL - Blocks all user logins
**Time Required:** 5 minutes
**Your Client ID:** `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`

---

## ✅ Step 1: Access Google Cloud Console

1. Open your browser and go to: **https://console.cloud.google.com/apis/credentials**
2. Sign in with your Google account that owns this project
3. If prompted, select the correct project

---

## ✅ Step 2: Locate Your OAuth Client

1. Look for **OAuth 2.0 Client IDs** section
2. Find the client with ID: `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`
3. Click the **✏️ Edit** button (pencil icon) next to it

---

## ✅ Step 3: Add Authorized JavaScript Origins

In the **Authorized JavaScript origins** section, add these URLs:

### Development URLs:
```
http://localhost:5173
http://localhost:5174
http://localhost:3000
http://localhost:80
```

### Production URLs (when ready):
```
https://restoreassist.app
https://www.restoreassist.app
```

**How to add:**
1. Click **"+ ADD URI"** button
2. Paste one URL
3. Press Enter or click outside the field
4. Repeat for each URL

---

## ✅ Step 4: Add Authorized Redirect URIs

In the **Authorized redirect URIs** section, add these URLs:

### Development URLs:
```
http://localhost:5173
http://localhost:5173/
http://localhost:3001/api/integrations/google-drive/callback
http://localhost:3001/api/auth/google/callback
```

### Production URLs (when ready):
```
https://restoreassist.app
https://restoreassist.app/
https://api.restoreassist.app/api/integrations/google-drive/callback
https://api.restoreassist.app/api/auth/google/callback
```

**How to add:**
1. Click **"+ ADD URI"** button
2. Paste one URL
3. Press Enter or click outside the field
4. Repeat for each URL

---

## ✅ Step 5: Save Changes

1. Scroll to the bottom of the page
2. Click the **"SAVE"** button
3. Wait for confirmation message: "OAuth client updated"

**Note:** Changes may take 5-10 seconds to propagate.

---

## ✅ Step 6: Verify Configuration

Run this command in your terminal to verify the fix:

```bash
npm run verify:oauth
```

Or manually test:
1. Open `http://localhost:5173`
2. Click "Start Free Trial"
3. Click "Sign in with Google"
4. **Expected:** Google OAuth popup opens (NO 403 error in console)
5. **Expected:** Can sign in with Google successfully

---

## 🔍 Visual Checklist

After saving, your configuration should look like this:

### Authorized JavaScript origins:
- [x] `http://localhost:5173`
- [x] `http://localhost:5174`
- [x] `http://localhost:3000`
- [x] `http://localhost:80`
- [ ] `https://restoreassist.app` (production)
- [ ] `https://www.restoreassist.app` (production)

### Authorized redirect URIs:
- [x] `http://localhost:5173`
- [x] `http://localhost:5173/`
- [x] `http://localhost:3001/api/integrations/google-drive/callback`
- [x] `http://localhost:3001/api/auth/google/callback`
- [ ] `https://restoreassist.app` (production)
- [ ] `https://api.restoreassist.app/api/integrations/google-drive/callback` (production)
- [ ] `https://api.restoreassist.app/api/auth/google/callback` (production)

---

## 🐛 Troubleshooting

### Problem: Can't find OAuth Client
**Solution:**
- Check you're in the correct Google Cloud project
- Look for "Web application" type clients
- Search for the Client ID in the page

### Problem: Still getting 403 error after saving
**Solution:**
- Wait 1-2 minutes for changes to propagate
- Clear browser cache (Ctrl+Shift+Delete)
- Try incognito/private browsing mode
- Check browser console for exact error

### Problem: Different domain needed
**Solution:**
- Add your custom domain to the lists above
- Follow same format as examples
- Must include protocol (http:// or https://)

---

## ✅ Success Indicators

After fixing, you should see:

1. **Console (before fix):**
   ```
   ❌ [GSI_LOGGER]: The given origin is not allowed for the given client ID
   ❌ Failed to load resource: 403
   ```

2. **Console (after fix):**
   ```
   ✅ [GSI_LOGGER]: The user signed in successfully
   ✅ No 403 errors
   ```

3. **User Experience:**
   - Click "Sign in with Google" → Opens popup ✅
   - Select Google account → Redirects to app ✅
   - Dashboard loads with user info ✅

---

## 📞 Need Help?

If you encounter issues:

1. **Check browser console** for exact error messages
2. **Verify Client ID** matches in both:
   - Google Cloud Console
   - `packages/frontend/.env.local` (VITE_GOOGLE_CLIENT_ID)
   - `packages/backend/.env.local` (GOOGLE_CLIENT_ID)
3. **Run verification script:** `npm run verify:oauth`
4. **Review logs:** `docker-compose logs -f backend`

---

## 🎯 Quick Reference

**Your Client ID:** `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`
**Google Cloud Console:** https://console.cloud.google.com/apis/credentials
**Time Required:** 5 minutes
**Impact:** Unblocks 100% of user logins

---

## ⏭️ After Fixing

Once OAuth is working:

1. ✅ Test full sign-in flow
2. ✅ Test report generation
3. ✅ Test Stripe checkout
4. ✅ Move to production deployment

---

*Last Updated: 2025-10-22*
*Priority: CRITICAL*
*Status: Awaiting Google Cloud Console Configuration*
