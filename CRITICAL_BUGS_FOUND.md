# Critical Production Bugs Found - 2025-10-22

## Summary
Tested the actual application with real user flows and found **3 critical bugs** that prevent the app from working in production.

---

## BUG #1: Google OAuth Origin Not Configured - **BLOCKS ALL LOGINS**

### Severity: CRITICAL
### Impact: Users cannot sign in with Google OAuth

### Error Message:
```
[GSI_LOGGER]: The given origin is not allowed for the given client ID.
Failed to load resource: the server responded with a status of 403 ()
```

### Root Cause:
The Google Cloud Console OAuth configuration doesn't include `http://localhost:5173` as an authorized JavaScript origin. This means:
- Development: OAuth fails on localhost
- Production: Will fail if production URLs aren't added to Google Cloud Console

### Location:
- Console error appears when GoogleOAuthProvider loads
- Affects: All "Sign in with Google" buttons

### Fix Required:
1. Go to Google Cloud Console: https://console.cloud.google.com/apis/credentials
2. Select OAuth 2.0 Client ID: `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`
3. Add Authorized JavaScript origins:
   - `http://localhost:5173` (development)
   - `http://localhost:5174` (development)
   - `http://localhost:3000` (development)
   - `https://restoreassist.app` (production)
   - `https://www.restoreassist.app` (production)
4. Add Authorized redirect URIs:
   - `http://localhost:5173` (development)
   - `https://restoreassist.app` (production)
   - `https://www.restoreassist.app` (production)

### Test After Fix:
```bash
# Open http://localhost:5173
# Click "Start Free Trial"
# Click "Sign in with Google"
# Should open Google OAuth popup WITHOUT 403 error
```

---

## BUG #2: Cookie Consent Banner Blocks Form Submission

### Severity: HIGH
### Impact: Users cannot submit forms until they dismiss cookie banner

### Error Details:
```
Playwright error: element is visible, enabled and stable
- <div class="flex-1">…</div> from <div class="fixed bottom-0 left-0 right-0 z-50"> subtree intercepts pointer events
```

### Root Cause:
The cookie consent banner has `z-index: 50` (z-50) and remains visible at the bottom of the screen, blocking clicks on form buttons.

### Location:
- File: Cookie consent component (likely in a layout or App component)
- CSS: `fixed bottom-0 left-0 right-0 z-50`

### Fix Required:
**Option 1: Hide banner after acceptance (RECOMMENDED)**
```typescript
// When user clicks "Accept All Cookies" or "Decline"
// Set localStorage and hide the banner permanently
localStorage.setItem('cookieConsent', 'accepted');
setCookieBannerVisible(false);
```

**Option 2: Lower z-index**
```css
/* Change from z-50 to z-10 or z-20 */
.cookie-banner {
  z-index: 10;
}
```

**Option 3: Add pointer-events-none to non-interactive parts**
```css
.cookie-banner {
  pointer-events: none;
}
.cookie-banner-buttons {
  pointer-events: auto;
}
```

### Files to Check:
```bash
grep -r "cookie.*consent\|Accept All Cookies" packages/frontend/src/
```

---

## BUG #3: React DOM Nesting Warnings

### Severity: MEDIUM
### Impact: Console warnings, potential hydration issues

### Error Message:
```
Warning: validateDOMNesting(...): <div> cannot appear as a descendant of <p>
Warning: validateDOMNesting(...): <p> cannot appear as a descendant of <p>
```

### Root Cause:
Invalid HTML nesting in PricingCard component - `<p>` tags contain block elements like `<div>` or nested `<p>` tags.

### Location:
```
packages/frontend/src/components/pricing/PricingCard.tsx:21:31
packages/frontend/src/components/ui/card.tsx:86:12
```

### Fix Required:
Replace `<p>` tags with `<div>` where they contain block-level children:

```typescript
// BEFORE (Invalid)
<CardDescription>
  <p>
    <div>Some content</div> {/* Invalid nesting */}
  </p>
</CardDescription>

// AFTER (Valid)
<CardDescription>
  <div>
    <div>Some content</div>
  </div>
</CardDescription>
```

---

## Additional Findings

### ✅ WORKING:
1. Backend API running on http://localhost:3001
2. Frontend running on http://localhost:5173
3. Trial auth endpoints responding correctly (`/api/trial-auth/health`)
4. Stripe configuration loaded with valid price IDs
5. Dev Login bypass works in development mode
6. Modal opens correctly when clicking "Start Free Trial"

### ⚠️ NOT TESTED (Blocked by BUG #1):
1. Actual Google OAuth login flow
2. Report generation (requires successful login)
3. Stripe checkout session creation
4. PDF export functionality

---

## Priority Fixes

### **IMMEDIATE (Blocks Production)**
1. Fix BUG #1 - Configure Google OAuth origins (5 minutes)

### **HIGH (Blocks User Actions)**
2. Fix BUG #2 - Cookie banner blocking clicks (15 minutes)

### **MEDIUM (Quality)**
3. Fix BUG #3 - React nesting warnings (10 minutes)

---

## Test Plan After Fixes

1. **Google OAuth:**
   ```bash
   # Navigate to http://localhost:5173
   # Click "Start Free Trial"
   # Click "Sign in with Google"
   # Should open Google login popup
   # After login, should redirect to dashboard
   ```

2. **Report Generation:**
   ```bash
   # After successful login
   # Fill form: Address, Damage Type, State, Description
   # Click "Generate Report"
   # Should show loading state
   # Should display generated report
   ```

3. **Stripe Checkout:**
   ```bash
   # Click "Get Started" on Monthly or Yearly plan
   # Should redirect to Stripe checkout
   # Should create valid checkout session
   ```

---

## Files Requiring Changes

1. **Google Cloud Console** (External)
   - Add authorized origins and redirect URIs

2. **Cookie Banner Component** (To find)
   ```bash
   grep -r "Accept All Cookies" packages/frontend/src/
   ```

3. **PricingCard.tsx**
   ```
   packages/frontend/src/components/pricing/PricingCard.tsx
   ```

4. **card.tsx (CardDescription)**
   ```
   packages/frontend/src/components/ui/card.tsx
   ```
