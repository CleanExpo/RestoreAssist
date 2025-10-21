# RestoreAssist - Production Testing Checklist

**Date**: January 2025
**Environment**: Production - https://restoreassist.app
**Status**: Ready for Testing

---

## 🎯 Testing Overview

This checklist covers all critical user flows that must work in production before launch.

**Estimated Testing Time**: 45-90 minutes
**Testers Needed**: 1-2 people
**Testing Environment**: Production (https://restoreassist.app)

---

## ✅ Pre-Testing Setup

### Browser Requirements
- [ ] Chrome/Edge (latest version)
- [ ] Firefox (latest version)
- [ ] Safari (if on Mac)
- [ ] Mobile browser (iOS Safari or Android Chrome)

### Test Accounts Needed
- [ ] Gmail account for Google OAuth testing
- [ ] Test credit card for Stripe testing (use Stripe test cards)

### Stripe Test Cards
```
Successful Payment:
Card Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)

Declined Payment:
Card Number: 4000 0000 0000 0002
```

---

## 🧪 Test Scenarios

## 1. Landing Page & First Impressions

### Test 1.1: Initial Page Load
- [ ] Open https://restoreassist.app in incognito/private window
- [ ] **Verify**: Page loads within 3 seconds
- [ ] **Verify**: No console errors (F12 → Console tab)
- [ ] **Verify**: Logo displays correctly
- [ ] **Verify**: "Sign up with Google" button visible
- [ ] **Verify**: Cookie consent banner appears after 1 second
- [ ] **Verify**: Navigation links work (Features, How It Works, Pricing)

**Expected Result**: ✅ Clean, professional landing page with no errors

### Test 1.2: Cookie Consent Banner
- [ ] Click "View Cookie Details" to expand
- [ ] **Verify**: Shows Essential, Analytics, and Third-Party cookies
- [ ] Click "Decline" button
- [ ] **Verify**: Banner dismisses with animation
- [ ] Refresh page
- [ ] **Verify**: Banner does NOT appear again
- [ ] Clear localStorage (F12 → Application → Local Storage → Clear)
- [ ] Refresh page
- [ ] **Verify**: Banner appears again
- [ ] Click "Accept All Cookies"
- [ ] **Verify**: Banner dismisses
- [ ] **Verify**: Consent stored in localStorage

**Expected Result**: ✅ Cookie consent works correctly, respects user choice

### Test 1.3: Legal Pages
- [ ] Scroll to footer
- [ ] Click "Privacy Policy"
- [ ] **Verify**: Redirects to /privacy
- [ ] **Verify**: Page displays with all sections
- [ ] **Verify**: "Back to Home" link works
- [ ] Click "Terms of Service" in footer
- [ ] **Verify**: Redirects to /terms
- [ ] **Verify**: Shows all 15 sections
- [ ] Click "Refund Policy" in footer
- [ ] **Verify**: Redirects to /refunds
- [ ] **Verify**: Shows refund details and 7-day guarantee
- [ ] Click "Contact Support" in footer
- [ ] **Verify**: Redirects to /contact
- [ ] **Verify**: Contact form displays

**Expected Result**: ✅ All legal pages load correctly with proper content

---

## 2. Google OAuth Sign-In Flow

### Test 2.1: Google Sign-In (New User)
- [ ] Open https://restoreassist.app in **incognito** window
- [ ] Click "Sign up with Google" button
- [ ] **Verify**: Google OAuth popup/redirect appears
- [ ] **CRITICAL**: NO FedCM errors or "origin_not_allowed" errors
- [ ] Select Google account
- [ ] **Verify**: OAuth completes successfully
- [ ] **Verify**: Redirects back to RestoreAssist dashboard
- [ ] **Verify**: No console errors during OAuth flow
- [ ] **Verify**: User name displayed somewhere on page

**Expected Result**: ✅ Seamless Google sign-in without errors

**If Failed**:
- Check Google Cloud Console authorized origins include:
  - https://restoreassist.app
  - https://www.restoreassist.app
- Wait 5-10 minutes for Google's changes to propagate
- Clear browser cache and try again

### Test 2.2: OAuth Token Storage
- [ ] After successful login, open F12 → Application → Local Storage
- [ ] **Verify**: `accessToken` exists
- [ ] **Verify**: `refreshToken` exists
- [ ] **Verify**: `sessionToken` exists
- [ ] **Verify**: `userEmail` contains correct email
- [ ] **Verify**: `userName` contains correct name

**Expected Result**: ✅ All tokens stored in localStorage

---

## 3. Free Trial Activation

### Test 3.1: Trial Activation Flow
- [ ] After Google sign-in, look for trial activation prompt
- [ ] Click to activate free trial
- [ ] **Verify**: Trial banner appears at top
- [ ] **Verify**: Shows "7 days" OR "3 reports remaining"
- [ ] **Verify**: Shows expiry date
- [ ] **Verify**: "Free Trial Active" badge visible

**Expected Result**: ✅ Free trial activates successfully

### Test 3.2: Trial Status Verification
- [ ] Open F12 → Network tab
- [ ] Look for API call to `/api/trial-auth/trial-status`
- [ ] **Verify**: Response shows `hasActiveTrial: true`
- [ ] **Verify**: `reportsRemaining: 3`
- [ ] **Verify**: `expiresAt` is 7 days in future

**Expected Result**: ✅ Trial status accurate in API response

---

## 4. Report Generation

### Test 4.1: Generate Water Damage Report
- [ ] Navigate to report generation page/form
- [ ] Fill in required fields:
  - Property Address: "123 Test St, Sydney NSW 2000"
  - Damage Type: "Water Damage"
  - Damage Description: "Burst pipe in kitchen, water damage to floor and walls"
  - Affected Areas: "Kitchen, Living Room"
  - State: "NSW"
- [ ] Click "Generate Report" button
- [ ] **Verify**: Loading indicator appears
- [ ] Wait for report generation (30-60 seconds)
- [ ] **Verify**: Report appears in dashboard
- [ ] **Verify**: Trial counter decrements (2 reports remaining)

**Expected Result**: ✅ Report generated successfully

### Test 4.2: Export Report
- [ ] Click on generated report
- [ ] Click "Export as PDF" button
- [ ] **Verify**: PDF downloads successfully
- [ ] Open PDF file
- [ ] **Verify**: Professional formatting
- [ ] **Verify**: All data included (property address, damage details, cost estimates)
- [ ] Go back to report
- [ ] Click "Export as DOCX" button
- [ ] **Verify**: DOCX downloads successfully
- [ ] Open DOCX file (Word/Google Docs)
- [ ] **Verify**: Proper formatting maintained

**Expected Result**: ✅ Both PDF and DOCX exports work correctly

### Test 4.3: Generate Second Report
- [ ] Generate another report with different damage type (Fire, Mold, etc.)
- [ ] **Verify**: Report generates successfully
- [ ] **Verify**: Trial counter now shows "1 report remaining"

**Expected Result**: ✅ Multiple reports work, counter accurate

---

## 5. Subscription & Payment Flow

### Test 5.1: View Pricing
- [ ] Click "Upgrade" or "Pricing" link
- [ ] **Verify**: Redirects to /pricing page
- [ ] **Verify**: Shows Monthly and Yearly plans
- [ ] **Verify**: Prices displayed correctly
- [ ] **Verify**: Free trial badge visible

**Expected Result**: ✅ Pricing page displays all plans

### Test 5.2: Stripe Checkout (Monthly Plan)
- [ ] Click "Subscribe to Monthly" button
- [ ] **Verify**: Redirects to Stripe Checkout
- [ ] Fill in test card details:
  - Card: 4242 4242 4242 4242
  - Expiry: 12/25
  - CVC: 123
  - ZIP: 12345
- [ ] Fill in billing details (name, email, address)
- [ ] Click "Subscribe" button
- [ ] **Verify**: Payment processes successfully
- [ ] **Verify**: Redirects to /checkout/success
- [ ] **Verify**: Success message displayed

**Expected Result**: ✅ Stripe checkout works, payment successful

### Test 5.3: Subscription Verification
- [ ] Navigate to /subscription page
- [ ] **Verify**: Shows "Monthly" plan active
- [ ] **Verify**: Reports limit shows "Unlimited" or increased limit
- [ ] **Verify**: Next billing date displayed
- [ ] **Verify**: Cancel subscription option available

**Expected Result**: ✅ Subscription status accurate

### Test 5.4: Cancel Subscription
- [ ] Click "Cancel Subscription" button
- [ ] **Verify**: Confirmation modal appears
- [ ] Confirm cancellation
- [ ] **Verify**: Shows "Cancelled - Access until [end date]"
- [ ] **Verify**: No immediate access loss
- [ ] **Verify**: "cancel_at_period_end: true" in API response

**Expected Result**: ✅ Cancellation works, access retained until period end

---

## 6. Account Settings & GDPR

### Test 6.1: Account Settings Page
- [ ] Navigate to /settings (or click profile/settings link)
- [ ] **Verify**: Page loads successfully
- [ ] **Verify**: Shows user email
- [ ] **Verify**: Shows user name
- [ ] **Verify**: Shows "Google OAuth" as authentication method
- [ ] **Verify**: "Manage Subscription" link works
- [ ] **Verify**: "Sign Out" button visible

**Expected Result**: ✅ Settings page displays user information

### Test 6.2: Account Deletion (GDPR)
- [ ] Scroll to "Danger Zone"
- [ ] Click "Delete My Account" button
- [ ] **Verify**: Warning message appears with bullet points
- [ ] **Verify**: Text input field appears
- [ ] Type "DELETE" (uppercase)
- [ ] Click "Confirm Delete Account"
- [ ] **Verify**: Account deletion processes
- [ ] **Verify**: All localStorage cleared
- [ ] **Verify**: Redirects to home page
- [ ] **Verify**: Shows logged-out state

**Expected Result**: ✅ Account deletion works correctly

**⚠️ WARNING**: This test will delete your test account! Use a disposable test account.

### Test 6.3: Sign Out
- [ ] After signing in again, go to /settings
- [ ] Click "Sign Out" button
- [ ] **Verify**: Redirects to home page
- [ ] **Verify**: All tokens cleared from localStorage
- [ ] **Verify**: Shows logged-out state (no user info)

**Expected Result**: ✅ Sign out works correctly

---

## 7. Error Handling & Edge Cases

### Test 7.1: Rate Limiting
- [ ] Open incognito window
- [ ] Go to https://restoreassist.app
- [ ] Click "Sign up with Google" 6 times rapidly (before completing OAuth)
- [ ] **Verify**: After 5-10 attempts, see rate limit error
- [ ] **Verify**: Error message mentions "15 minutes"
- [ ] Wait 2 minutes
- [ ] **Verify**: Can try again

**Expected Result**: ✅ Rate limiting prevents abuse

### Test 7.2: Invalid API Calls
- [ ] Open F12 → Console
- [ ] Manually trigger Sentry error (if test endpoint exists)
- [ ] **Verify**: Error caught by error boundary
- [ ] **Verify**: User-friendly error page shown (not blank screen)
- [ ] **Verify**: "Reload Page" and "Go Home" buttons work

**Expected Result**: ✅ Errors handled gracefully

### Test 7.3: Network Offline
- [ ] Open F12 → Network tab
- [ ] Change to "Offline" mode
- [ ] Try to generate a report
- [ ] **Verify**: Appropriate error message shown
- [ ] Return to "Online" mode
- [ ] **Verify**: Functionality restored

**Expected Result**: ✅ Offline state handled gracefully

---

## 8. Mobile Responsiveness

### Test 8.1: Mobile Landing Page
- [ ] Open https://restoreassist.app on mobile browser
- [ ] **Verify**: Page responsive (no horizontal scroll)
- [ ] **Verify**: "Sign up with Google" button accessible
- [ ] **Verify**: Cookie consent displays correctly
- [ ] **Verify**: Navigation menu works (hamburger if exists)

**Expected Result**: ✅ Mobile-friendly landing page

### Test 8.2: Mobile Report Generation
- [ ] Sign in on mobile
- [ ] Generate a report
- [ ] **Verify**: Form fields usable on mobile
- [ ] **Verify**: Report displays correctly
- [ ] **Verify**: Export buttons work

**Expected Result**: ✅ Core functionality works on mobile

---

## 9. Contact & Support

### Test 9.1: Contact Form
- [ ] Navigate to /contact
- [ ] Fill out contact form:
  - Name: Test User
  - Email: test@example.com
  - Category: Technical Support
  - Subject: Test inquiry
  - Message: This is a test message
- [ ] Click "Send Message"
- [ ] **Verify**: Success message appears
- [ ] **Verify**: Form resets

**Expected Result**: ✅ Contact form submission works

**Note**: Check support email (support@restoreassist.com) to verify message received (may need backend endpoint implementation).

---

## 10. Security & Privacy

### Test 10.1: HTTPS Verification
- [ ] Check URL bar
- [ ] **Verify**: Shows padlock icon
- [ ] **Verify**: URL starts with `https://`
- [ ] Click padlock
- [ ] **Verify**: Valid SSL certificate

**Expected Result**: ✅ Secure HTTPS connection

### Test 10.2: Privacy Policy Compliance
- [ ] Visit /privacy
- [ ] **Verify**: Covers data collection
- [ ] **Verify**: Lists all third-party services (Google, Stripe, Supabase, SendGrid, Vercel, Sentry)
- [ ] **Verify**: Includes GDPR rights
- [ ] **Verify**: Includes contact information

**Expected Result**: ✅ Comprehensive privacy policy

### Test 10.3: Cookie Consent Compliance
- [ ] Clear localStorage
- [ ] Visit site
- [ ] **Verify**: Cookie banner appears before any cookies set
- [ ] **Verify**: Can decline cookies
- [ ] **Verify**: Privacy policy linked from banner

**Expected Result**: ✅ GDPR-compliant cookie consent

---

## 11. Performance & Reliability

### Test 11.1: Page Load Speed
- [ ] Use PageSpeed Insights: https://pagespeed.web.dev/
- [ ] Enter URL: https://restoreassist.app
- [ ] **Target**: Mobile score > 70
- [ ] **Target**: Desktop score > 85
- [ ] **Verify**: First Contentful Paint < 2s
- [ ] **Verify**: Largest Contentful Paint < 3s

**Expected Result**: ✅ Good performance scores

### Test 11.2: Browser Compatibility
- [ ] Test in Chrome (latest)
- [ ] Test in Firefox (latest)
- [ ] Test in Safari (if available)
- [ ] Test in Edge (latest)
- [ ] **Verify**: All core functions work in all browsers

**Expected Result**: ✅ Cross-browser compatibility

---

## 12. Monitoring & Analytics

### Test 12.1: Sentry Error Tracking
- [ ] Log into Sentry dashboard
- [ ] Trigger a test error (if test endpoint exists)
- [ ] **Verify**: Error appears in Sentry dashboard
- [ ] **Verify**: Error includes user context (email, user ID)
- [ ] **Verify**: Stack trace visible
- [ ] **Verify**: No sensitive data (passwords, tokens) in logs

**Expected Result**: ✅ Error tracking works correctly

---

## 📊 Testing Summary

After completing all tests, fill out this summary:

### Overall Results
- **Total Tests**: 60+
- **Tests Passed**: ___
- **Tests Failed**: ___
- **Blockers Found**: ___
- **Minor Issues**: ___

### Critical Issues (Must Fix Before Launch)
1. ________________________________
2. ________________________________
3. ________________________________

### Minor Issues (Can Fix Post-Launch)
1. ________________________________
2. ________________________________
3. ________________________________

### Sign-Off
- [ ] All critical tests passed
- [ ] No blocking issues found
- [ ] Performance acceptable
- [ ] Security verified
- [ ] Legal pages complete
- [ ] **READY FOR PRODUCTION LAUNCH** ✅

---

**Tester Name**: ___________________
**Date Completed**: ___________________
**Sign-Off**: ___________________

---

## 🚀 Next Steps After Testing

If all tests pass:
1. ✅ Mark site as production-ready
2. 📢 Announce launch
3. 📊 Monitor Sentry for errors
4. 💬 Respond to support emails
5. 📈 Track user signups and conversions

If issues found:
1. 🐛 Create GitHub issues for each bug
2. 🔧 Prioritize fixes (critical vs. minor)
3. 🧪 Re-test after fixes
4. ✅ Sign off when all critical issues resolved

---

**Last Updated**: January 2025
**Status**: Ready for Testing
