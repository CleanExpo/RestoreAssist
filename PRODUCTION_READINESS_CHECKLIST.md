# RestoreAssist Production Readiness Checklist
**For: https://restoreassist.app/**
**Generated: 2025-10-21**
**Status: Analysis Complete**

---

## Executive Summary

RestoreAssist is a disaster recovery report generation platform that is **80% complete** but requires critical fixes and additions before it can be sold as a production SaaS product.

### 🔴 CRITICAL BLOCKERS (Must Fix Before Launch)
1. Google OAuth is broken in production (FedCM errors)
2. No Privacy Policy page
3. No Terms of Service page
4. No refund/cancellation policy
5. Missing email verification flow
6. No customer support system

### 🟡 HIGH PRIORITY (Should Fix Soon)
1. TypeScript errors (59 remaining)
2. Error monitoring incomplete
3. No rate limiting on API
4. Missing user onboarding flow
5. No analytics/tracking

### 🟢 WORKING COMPONENTS
- ✅ Stripe payment integration (comprehensive)
- ✅ Report generation backend
- ✅ Database schema (PostgreSQL + Prisma)
- ✅ Free trial system
- ✅ Subscription management
- ✅ Email service (SendGrid)
- ✅ Multi-tenant organizations

---

## 1. CRITICAL: Authentication & User Management

### Current State
- **Provider**: Google OAuth (via @react-oauth/google)
- **Backend**: Supabase Auth
- **Token Storage**: localStorage (accessToken, refreshToken, sessionToken)
- **Middleware**: JWT-based auth middleware

### Issues
| Priority | Issue | Impact | Fix Required |
|----------|-------|--------|--------------|
| 🔴 CRITICAL | Google OAuth FedCM errors in production | Users cannot sign up | Fix OAuth config in Google Cloud Console |
| 🔴 CRITICAL | No email verification flow | Security risk, spam accounts | Implement Supabase email verification |
| 🟡 HIGH | Multiple Google Sign-In instances (FIXED) | Poor UX | ✅ Reduced from 3 to 1 instance |
| 🟡 HIGH | No password reset flow | Users can't recover accounts | Add password reset page |
| 🟡 HIGH | No account deletion | GDPR compliance issue | Add account deletion feature |

### Required Fixes

#### 1.1 Fix Google OAuth in Production
**Location**: Google Cloud Console + Frontend
**Files**:
- `.env.production` (VITE_GOOGLE_CLIENT_ID)
- Google Cloud Console OAuth settings

**Steps**:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Find OAuth 2.0 Client ID: `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`
3. Add authorized JavaScript origins:
   - `https://restoreassist.app`
   - `https://www.restoreassist.app`
4. Add authorized redirect URIs:
   - `https://restoreassist.app`
   - `https://www.restoreassist.app`
5. Save and wait 5 minutes for propagation

**Test**: https://restoreassist.app/ → Click "Sign up with Google" → Should not show FedCM errors

#### 1.2 Implement Email Verification
**Location**: Backend + Frontend
**Required**:
```typescript
// Backend route: POST /api/auth/verify-email
// Frontend page: /verify-email?token=xxx
```

**Supabase Config**:
- Enable email confirmation in Supabase dashboard
- Set redirect URL to `https://restoreassist.app/verify-email`

#### 1.3 Add Password Reset Flow
**Required Pages**:
- `/forgot-password` - Request reset
- `/reset-password?token=xxx` - Set new password

---

## 2. CRITICAL: Legal Compliance

### Current State
- ❌ No Privacy Policy
- ❌ No Terms of Service
- ❌ No Cookie Policy
- ❌ No Refund Policy
- ❌ No Acceptable Use Policy

### Required Legal Pages

#### 2.1 Privacy Policy (`/privacy`)
**Must Include**:
- Data collection practices
- Use of cookies (Google Analytics, Stripe, etc.)
- Third-party services (Google, Stripe, Supabase, SendGrid)
- User rights under GDPR/CCPA
- Data retention policies
- Contact information for privacy requests

**Template**: Use https://www.termsfeed.com/privacy-policy-generator/

#### 2.2 Terms of Service (`/terms`)
**Must Include**:
- Service description
- User obligations
- Payment terms
- Subscription cancellation policy
- Refund policy (if any)
- Limitation of liability
- Dispute resolution

**Template**: Use https://www.termsfeed.com/terms-conditions-generator/

#### 2.3 Refund & Cancellation Policy
**Must Define**:
- Free trial terms (currently: 7 days, 3 reports)
- Subscription cancellation process
- Refund eligibility (e.g., "No refunds after 7 days")
- Pro-rated refunds policy

#### 2.4 Cookie Consent
**Required**: Cookie consent banner
**Location**: Add to `App.tsx` or all pages

**Example**:
```tsx
// Use react-cookie-consent or build custom
import CookieConsent from "react-cookie-consent";

<CookieConsent>
  This website uses cookies to enhance the user experience.
</CookieConsent>
```

#### 2.5 Footer Updates
**Current Footer**: Missing legal links
**Required Links**:
```tsx
<footer>
  <a href="/privacy">Privacy Policy</a>
  <a href="/terms">Terms of Service</a>
  <a href="/cookies">Cookie Policy</a>
  <a href="/refunds">Refund Policy</a>
</footer>
```

---

## 3. Payment & Subscription System

### Current State ✅
- **Provider**: Stripe
- **Plans**: Free Trial, Monthly ($X), Yearly ($Y)
- **Webhook**: Fully implemented
- **Features**:
  - ✅ Checkout session creation
  - ✅ Subscription management
  - ✅ Payment failure handling
  - ✅ Cancellation handling
  - ✅ Email notifications (checkout, payment, cancellation)

### Issues
| Priority | Issue | Fix Required |
|----------|-------|--------------|
| 🟡 HIGH | No customer portal link | Add Stripe Customer Portal |
| 🟡 HIGH | No invoice history page | Create `/account/invoices` |
| 🟢 LOW | Pricing not displayed on landing page | Add pricing tiers |

### Required Fixes

#### 3.1 Add Stripe Customer Portal
**Purpose**: Allow users to manage subscription, update payment method, view invoices

**Implementation**:
```typescript
// Backend: POST /api/stripe/create-portal-session
const session = await stripe.billingPortal.sessions.create({
  customer: customerId,
  return_url: `${process.env.BASE_URL}/account/billing`,
});

// Frontend: Add button in /subscription
<a href={portalUrl}>Manage Subscription</a>
```

#### 3.2 Display Pricing on Landing Page
**Location**: `LandingPage.tsx` - pricing section

**Fix**: Update with actual Stripe prices from `.env.production`:
```typescript
const PRICING = {
  monthly: {
    price: "$X/month",
    priceId: import.meta.env.VITE_STRIPE_PRICE_MONTHLY
  },
  yearly: {
    price: "$Y/year",
    priceId: import.meta.env.VITE_STRIPE_PRICE_YEARLY
  }
};
```

---

## 4. Report Generation System

### Current State
- **AI Model**: Configured (model field in reports table)
- **Database**: PostgreSQL with Prisma
- **Storage**: JSON fields (scopeOfWork, itemizedEstimate, complianceNotes)
- **Export**: PDF & DOCX routes exist

### Issues
| Priority | Issue | Fix Required |
|----------|-------|--------------|
| 🟡 HIGH | No PDF generation service verified | Test PDF export end-to-end |
| 🟡 HIGH | No template system | Verify report templates exist |
| 🟡 HIGH | No cost estimate accuracy validation | Add validation rules |

### Required Testing

#### 4.1 End-to-End Report Generation Test
**Test Steps**:
1. Sign up with Google OAuth
2. Activate free trial
3. Create a report (Water Damage)
4. Fill all required fields
5. Generate report
6. Export as PDF
7. Export as DOCX
8. Verify formatting and content

**Acceptance Criteria**:
- Report generates in < 2 minutes
- PDF is professionally formatted
- DOCX is editable
- Cost estimates are reasonable ($X,XXX - $XX,XXX range)

---

## 5. User Experience & Onboarding

### Current State
- Landing page exists with hero, features, pricing
- Dashboard has report form
- Free trial banner shows remaining reports

### Issues
| Priority | Issue | Fix Required |
|----------|-------|--------------|
| 🟡 HIGH | No onboarding flow | Add welcome tour |
| 🟡 HIGH | No help documentation | Create help center |
| 🟡 HIGH | No demo/tutorial video | Record demo video |
| 🟢 LOW | No keyboard shortcuts | Optional enhancement |

### Required Additions

#### 5.1 User Onboarding
**Implement**: Welcome tour after first sign-up

**Steps**:
1. Show 3-step guide overlay
2. Point to "Create Report" button
3. Highlight report form fields
4. Show PDF export button

**Library**: Use `react-joyride` or `intro.js`

#### 5.2 Help Center / Documentation
**Required Pages**:
- `/help` - Main help center
- `/help/getting-started` - Quick start guide
- `/help/creating-reports` - Report creation guide
- `/help/billing` - Billing and subscription help
- `/help/faq` - Frequently Asked Questions

#### 5.3 Demo Video
**Platform**: YouTube or Vimeo
**Duration**: 2-3 minutes
**Content**:
- Sign up process
- Create first report
- Export as PDF
- Subscription upgrade

**Embed**: Update `LandingPage.tsx` line 678 with actual video ID

---

## 6. Error Monitoring & Analytics

### Current State
- **Sentry**: Configured in backend (`stripeRoutes.ts`)
- **Analytics**: Not implemented
- **Error Logging**: Console.error only

### Issues
| Priority | Issue | Fix Required |
|----------|-------|--------------|
| 🔴 CRITICAL | No frontend error tracking | Add Sentry to frontend |
| 🟡 HIGH | No analytics tracking | Add Google Analytics or Posthog |
| 🟡 HIGH | No user event tracking | Track key actions (signup, report creation) |
| 🟡 HIGH | No performance monitoring | Add Web Vitals tracking |

### Required Implementations

#### 6.1 Frontend Error Tracking
**Add to Frontend**:
```bash
npm install @sentry/react @sentry/tracing
```

**Configuration** (`main.tsx`):
```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
});
```

#### 6.2 Analytics Tracking
**Option 1: Google Analytics 4**
```bash
npm install react-ga4
```

**Option 2: Posthog (Recommended for Product Analytics)**
```bash
npm install posthog-js
```

**Track Key Events**:
- Page views
- Sign up completed
- Trial activated
- Report created
- Report downloaded
- Subscription started
- Subscription cancelled

---

## 7. Security & Rate Limiting

### Current State
- JWT authentication ✅
- HTTPS enforced ✅
- CORS configured ✅
- SQL injection protected (Prisma) ✅

### Issues
| Priority | Issue | Fix Required |
|----------|-------|--------------|
| 🔴 CRITICAL | No rate limiting on auth endpoints | Add rate limiting |
| 🟡 HIGH | No CSRF protection | Add CSRF tokens |
| 🟡 HIGH | No request size limits | Add body-parser limits |
| 🟡 HIGH | No API key rotation policy | Document rotation process |

### Required Fixes

#### 7.1 Rate Limiting
**Add to Backend**:
```bash
npm install express-rate-limit
```

**Implementation**:
```typescript
import rateLimit from 'express-rate-limit';

// Auth endpoints: 5 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later.'
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// API endpoints: 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use('/api/', apiLimiter);
```

#### 7.2 CSRF Protection
**Add to Backend**:
```bash
npm install csurf cookie-parser
```

---

## 8. Email Communications

### Current State ✅
- **Provider**: SendGrid
- **Implemented Emails**:
  - ✅ Checkout confirmation
  - ✅ Payment receipt
  - ✅ Payment failed
  - ✅ Subscription cancelled

### Issues
| Priority | Issue | Fix Required |
|----------|-------|--------------|
| 🟡 HIGH | No welcome email | Add welcome email template |
| 🟡 HIGH | No trial expiry warning | Add 1-day expiry reminder |
| 🟡 HIGH | No trial expiry notification | Add post-expiry email |
| 🟢 LOW | No monthly usage summary | Optional enhancement |

### Required Email Templates

#### 8.1 Welcome Email
**Trigger**: After successful Google OAuth sign-up
**Content**:
- Welcome message
- Free trial details (7 days, 3 reports)
- Getting started guide link
- Support contact

#### 8.2 Trial Expiry Warning
**Trigger**: 1 day before trial expires
**Content**:
- Trial expiring soon
- Reports remaining
- Call-to-action: Upgrade to paid plan
- Pricing comparison

#### 8.3 Trial Expired
**Trigger**: Day after trial expires
**Content**:
- Trial has ended
- Upgrade options
- What happens next (read-only access to reports)

---

## 9. Database & Infrastructure

### Current State ✅
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Hosting**: Vercel (Frontend + Backend)
- **CDN**: Vercel Edge Network

### Schema Review
```prisma
✅ Reports table - comprehensive
✅ Organizations table - multi-tenant ready
✅ Subscriptions table (inferred from code)
✅ Ascora integration tables - CRM integration
❌ Users table - using Supabase Auth (external)
```

### Issues
| Priority | Issue | Fix Required |
|----------|-------|--------------|
| 🟡 HIGH | No database backup policy | Set up automated backups |
| 🟡 HIGH | No migration rollback plan | Document rollback procedure |
| 🟢 LOW | No read replicas | Consider for scaling |

### Required Documentation

#### 9.1 Backup Policy
**Frequency**: Daily automated backups (Supabase handles this)
**Retention**: 7 days
**Testing**: Monthly restore test

#### 9.2 Migration Safety
**Process**:
1. Test migration in staging
2. Create manual backup
3. Run migration during low-traffic window
4. Verify data integrity
5. Monitor for errors

---

## 10. Customer Support System

### Current State
- ❌ No support system
- ❌ No contact page
- ❌ No live chat
- ❌ No ticketing system

### Required Implementations

#### 10.1 Minimum Viable Support
**Required**:
1. **Contact Page** (`/contact`)
   - Support email: support@restoreassist.app
   - Response time: 24-48 hours
   - Business hours: 9 AM - 5 PM AEST

2. **FAQ Page** (`/faq`)
   - Common questions
   - Troubleshooting guide
   - Billing questions

3. **Email Support**
   - Set up support@restoreassist.app
   - Forward to team inbox
   - Use template responses

#### 10.2 Enhanced Support (Optional)
**Options**:
- **Intercom**: Live chat + help desk ($X/month)
- **Zendesk**: Ticketing system ($X/month)
- **Crisp**: Free live chat
- **Tawk.to**: Free live chat

---

## 11. Testing & Quality Assurance

### Current State
- TypeScript errors: 59 remaining
- Backend tests: Some exist
- Frontend tests: Unknown
- E2E tests: None identified

### Required Testing

#### 11.1 Critical User Journeys
**Test Each Flow**:

1. **New User Sign-Up**
   - [ ] Click "Sign up with Google"
   - [ ] Complete Google OAuth
   - [ ] Land on dashboard
   - [ ] See free trial banner (3 reports, 7 days)

2. **Create First Report**
   - [ ] Click "Create Report"
   - [ ] Fill all required fields
   - [ ] Submit form
   - [ ] Report generates successfully
   - [ ] Export as PDF works
   - [ ] Export as DOCX works

3. **Subscription Purchase**
   - [ ] Click "Upgrade" from trial banner
   - [ ] Select Monthly/Yearly plan
   - [ ] Complete Stripe checkout
   - [ ] Receive confirmation email
   - [ ] Subscription status updated in dashboard

4. **Report Limit Enforcement**
   - [ ] Create 3 reports in trial
   - [ ] Attempt 4th report
   - [ ] See upgrade prompt
   - [ ] Cannot generate 4th report

5. **Subscription Cancellation**
   - [ ] Go to subscription management
   - [ ] Click "Cancel Subscription"
   - [ ] Confirm cancellation
   - [ ] Receive cancellation email
   - [ ] Access maintained until period end

#### 11.2 Fix TypeScript Errors
**Remaining**: 59 errors
**Files**:
- Ascora Customer Sync: 19 errors
- Ascora Job Board: 14 errors
- Google Drive Sync Scheduler: 26 errors

**Decision Required**:
- If components are unused → Delete them
- If components are needed → Fix type errors

---

## 12. Performance & Optimization

### Current Issues
| Priority | Issue | Fix Required |
|----------|-------|--------------|
| 🟡 HIGH | No image optimization | Use Vite image plugin |
| 🟡 HIGH | No code splitting | Implement lazy loading |
| 🟡 HIGH | No caching strategy | Add service worker |
| 🟢 LOW | No CDN for assets | Vercel handles this |

### Recommendations

#### 12.1 Image Optimization
```bash
npm install vite-plugin-image-optimizer
```

#### 12.2 Lazy Loading
```typescript
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
```

#### 12.3 Bundle Size Analysis
```bash
npm install --save-dev rollup-plugin-visualizer
```

---

## 13. SEO & Marketing

### Current State
- Meta tags: Basic
- Sitemap: Not generated
- robots.txt: Missing
- Schema markup: None

### Required Additions

#### 13.1 Meta Tags
**Add to `index.html`**:
```html
<title>RestoreAssist - Professional Disaster Recovery Reports</title>
<meta name="description" content="Generate detailed, AI-powered restoration reports in minutes. Trusted by restoration professionals.">
<meta property="og:title" content="RestoreAssist - AI Disaster Recovery Reports">
<meta property="og:description" content="Professional restoration reports powered by AI">
<meta property="og:image" content="https://restoreassist.app/og-image.png">
<meta property="og:url" content="https://restoreassist.app">
<meta name="twitter:card" content="summary_large_image">
```

#### 13.2 Sitemap
**Generate**: `public/sitemap.xml`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://restoreassist.app/</loc></url>
  <url><loc>https://restoreassist.app/pricing</loc></url>
  <url><loc>https://restoreassist.app/privacy</loc></url>
  <url><loc>https://restoreassist.app/terms</loc></url>
</urlset>
```

#### 13.3 robots.txt
**Create**: `public/robots.txt`
```
User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /subscription
Sitemap: https://restoreassist.app/sitemap.xml
```

---

## 14. Deployment & CI/CD

### Current State ✅
- **Platform**: Vercel
- **Auto-Deploy**: Enabled on push to main
- **Environments**: Production only
- **Environment Variables**: Configured

### Recommendations

#### 14.1 Add Staging Environment
**Purpose**: Test changes before production
**Setup**:
1. Create `staging` branch
2. Deploy to staging.restoreassist.app
3. Test all changes on staging first

#### 14.2 Pre-Deployment Checks
**Add to Vercel**:
- Run TypeScript check
- Run linting
- Run unit tests
- Check bundle size

---

## SUMMARY: Launch Checklist

### Phase 1: Critical Blockers (MUST FIX)
- [ ] Fix Google OAuth in production
- [ ] Create Privacy Policy page (`/privacy`)
- [ ] Create Terms of Service page (`/terms`)
- [ ] Create Refund Policy page (`/refunds`)
- [ ] Add email verification flow
- [ ] Add frontend error tracking (Sentry)
- [ ] Add rate limiting to auth endpoints
- [ ] Add contact/support page

**Estimated Time**: 3-5 days

### Phase 2: High Priority (SHOULD FIX)
- [ ] Fix remaining 59 TypeScript errors
- [ ] Add Stripe Customer Portal
- [ ] Add Google Analytics
- [ ] Create help documentation
- [ ] Add user onboarding flow
- [ ] Test report generation end-to-end
- [ ] Add welcome email templates
- [ ] Add trial expiry emails

**Estimated Time**: 5-7 days

### Phase 3: Polish & Launch (NICE TO HAVE)
- [ ] Record demo video
- [ ] Add SEO meta tags
- [ ] Generate sitemap
- [ ] Set up staging environment
- [ ] Implement lazy loading
- [ ] Add CSRF protection
- [ ] Create FAQ page

**Estimated Time**: 3-5 days

---

## TOTAL ESTIMATED TIME TO PRODUCTION
**Minimum Viable Product**: 3-5 days (Phase 1 only)
**Full Production Ready**: 11-17 days (All phases)

---

## Post-Launch Monitoring

### Week 1
- [ ] Monitor error rates in Sentry
- [ ] Check Google OAuth success rate
- [ ] Monitor Stripe webhook delivery
- [ ] Track sign-up conversion rate
- [ ] Monitor report generation success rate

### Week 2
- [ ] Review customer support requests
- [ ] Analyze user behavior in analytics
- [ ] Check trial-to-paid conversion rate
- [ ] Monitor payment failure rates

### Week 3
- [ ] Review and respond to user feedback
- [ ] Identify most common issues
- [ ] Plan feature improvements
- [ ] Optimize based on analytics

---

## Conclusion

RestoreAssist has a solid foundation with working payment integration, report generation, and subscription management. However, it requires **critical fixes** to Google OAuth, legal compliance pages, and error monitoring before it can be sold as a production SaaS product.

**Recommended Action Plan**:
1. Fix Google OAuth immediately (2 hours)
2. Create legal pages (1-2 days)
3. Add email verification (1 day)
4. Set up error monitoring (1 day)
5. Test all critical user journeys (1 day)
6. Launch to limited beta users (50-100)
7. Monitor and iterate based on feedback

**Revenue Readiness**: After Phase 1 + Phase 2 completion, the platform will be ready to accept paying customers.
