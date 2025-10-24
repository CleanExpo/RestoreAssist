# CI/CD Pipeline Documentation

## Overview

RestoreAssist uses an automated CI/CD pipeline with comprehensive quality gates to ensure safe and reliable deployments. The pipeline enforces strict validation at every stage before code reaches production.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMMIT TO MAIN BRANCH                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  GATE 1: Pre-Deployment Tests                                   │
│  - Backend unit tests                                            │
│  - Frontend unit tests                                           │
│  - E2E Playwright tests                                          │
│  ⚠️  ALL TESTS MUST PASS                                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  GATE 2: Pre-Deployment Validation                              │
│  - Environment variable validation                               │
│  - TypeScript compilation check                                  │
│  - Build verification                                            │
│  - Security audit                                                │
│  - API routes validation                                         │
│  ⚠️  ALL CHECKS MUST PASS                                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  DEPLOYMENT PHASE                                                │
│  ┌─────────────────────────┬─────────────────────────┐         │
│  │  Backend Deployment     │  Frontend Deployment    │         │
│  │  (Parallel)             │  (Parallel)             │         │
│  │  → Vercel               │  → Vercel               │         │
│  └─────────────────────────┴─────────────────────────┘         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  GATE 3: Post-Deployment Verification                           │
│  - Backend health checks                                         │
│  - Frontend accessibility                                        │
│  - Authentication endpoints                                      │
│  - Stripe integration                                            │
│  - Database connectivity                                         │
│  - SSL/TLS validation                                            │
│  - DNS resolution                                                │
│  - Performance baseline                                          │
│  ⚠️  ALL VERIFICATIONS MUST PASS                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  DEPLOYMENT SUMMARY                                              │
│  ✅ Success → Monitor production                                 │
│  ❌ Failure → Automatic rollback triggered                       │
└─────────────────────────────────────────────────────────────────┘
```

## Quality Gates

### Gate 1: Pre-Deployment Tests

**Purpose:** Ensure code quality and functionality before deployment

**Checks:**
- ✅ Backend unit tests with coverage
- ✅ Frontend unit tests with coverage
- ✅ E2E Playwright tests (sharded for performance)
- ✅ Type checking (TypeScript compilation)

**Failure Handling:**
- Tests must achieve 100% pass rate
- Any test failure blocks deployment
- Coverage reports uploaded to Codecov
- Test artifacts retained for 30 days

**Run Command:**
```bash
npm run test
```

---

### Gate 2: Pre-Deployment Validation

**Purpose:** Comprehensive validation of deployment readiness

**Script:** `scripts/pre-deploy-validation.sh`

**Checks Performed:**

#### 1. Environment Variables (Critical)
- ✅ ANTHROPIC_API_KEY
- ✅ JWT_SECRET
- ✅ JWT_REFRESH_SECRET
- ✅ STRIPE_SECRET_KEY
- ✅ STRIPE_WEBHOOK_SECRET
- ✅ ALLOWED_ORIGINS
- ✅ VITE_API_URL
- ✅ VITE_GOOGLE_CLIENT_ID
- ✅ VITE_STRIPE_PUBLISHABLE_KEY
- ✅ VITE_STRIPE_PRICE_* (all tier IDs)

#### 2. TypeScript Compilation
- ✅ Backend compiles without errors
- ✅ Frontend compiles without errors
- ⚠️  Type errors block deployment

#### 3. Build Verification
- ✅ Backend builds successfully
- ✅ Frontend builds successfully
- ✅ Build artifacts generated (`dist/` directories)
- ✅ Critical files present (index.js, index.html)

#### 4. Security Checks
- ✅ No exposed secrets in code
- ✅ No hardcoded API keys
- ⚠️  npm audit for high-severity vulnerabilities
- ✅ Secret patterns detection

#### 5. Database Migrations
- ℹ️  Migration status checked
- ⚠️  Warning if migrations pending

#### 6. API Routes Validation
- ✅ authRoutes.js
- ✅ trialAuthRoutes.js
- ✅ reportRoutes.js
- ✅ stripeRoutes.js
- ✅ subscriptionRoutes.js

#### 7. Vercel Configuration
- ✅ Backend vercel.json present
- ✅ Frontend vercel.json present
- ✅ API handler present

**Run Command:**
```bash
bash scripts/pre-deploy-validation.sh
```

**Exit Codes:**
- `0` - All checks passed, deployment authorized
- `1` - Checks failed, deployment blocked

---

### Gate 3: Post-Deployment Verification

**Purpose:** Validate production deployment health

**Script:** `scripts/post-deploy-verification.sh`

**Checks Performed:**

#### 1. Backend Health
- ✅ Health endpoint responding
- ✅ CORS configuration
- ✅ API returning valid JSON

#### 2. Authentication Endpoints
- ✅ /api/auth/me (returns 401 without token)
- ✅ Trial signup endpoint responding
- ✅ Google OAuth callback accessible

#### 3. Stripe Integration
- ✅ Webhook endpoint configured
- ✅ Checkout session creation
- ✅ Signature validation working

#### 4. Frontend Application
- ✅ Landing page loads (200)
- ✅ SPA routing working
- ✅ Login page accessible
- ✅ Dashboard route configured

#### 5. Static Assets
- ✅ JavaScript bundle accessible
- ✅ CSS styles loaded
- ✅ Asset URLs valid

#### 6. Database Connectivity
- ✅ Database queries executing
- ✅ Connection pool healthy
- ⚠️  Connection errors detected

#### 7. SSL/TLS Configuration
- ✅ Certificate valid
- ✅ Expiry date checked
- ⚠️  Warning if expires < 30 days

#### 8. DNS Resolution
- ✅ Backend domain resolves
- ✅ Frontend domain resolves
- ✅ A records configured

#### 9. Performance Baseline
- ✅ Health endpoint < 1000ms
- ⚠️  Response time > 3000ms
- ℹ️  Frontend load time measured

#### 10. Critical User Flows
- ✅ Landing page accessible
- ✅ Authentication flows working
- ✅ Payment integration responding

**Run Command:**
```bash
export BACKEND_URL=https://your-backend.vercel.app
export FRONTEND_URL=https://your-frontend.vercel.app
bash scripts/post-deploy-verification.sh
```

**Exit Codes:**
- `0` - Deployment verified, production healthy
- `1` - Verification failed, rollback recommended

---

## Rollback Procedures

### Automatic Rollback

**Trigger Conditions:**
- Post-deployment verification fails
- Critical health checks fail
- Database connectivity issues

### Manual Rollback

**Script:** `scripts/rollback.sh`

**Rollback Options:**

1. **Rollback Both Services**
   ```bash
   bash scripts/rollback.sh
   # Select option 1: Both backend and frontend
   ```

2. **Rollback Backend Only**
   ```bash
   bash scripts/rollback.sh
   # Select option 2: Backend only
   ```

3. **Rollback Frontend Only**
   ```bash
   bash scripts/rollback.sh
   # Select option 3: Frontend only
   ```

4. **Rollback to Specific Deployment**
   ```bash
   bash scripts/rollback.sh
   # Select option 4: Enter deployment URL
   ```

**Rollback Process:**

1. ✅ Verify Vercel CLI installed
2. ✅ List recent deployments
3. ⚠️  Confirm rollback action (interactive)
4. 🔄 Promote previous deployment
5. ⏱️  Wait for propagation (30 seconds)
6. ✅ Verify rolled-back deployment
7. ⚠️  Check database migrations (manual)

**Post-Rollback Verification:**
```bash
bash scripts/post-deploy-verification.sh
```

---

## GitHub Actions Workflows

### Test Workflow (`.github/workflows/test.yml`)

**Triggers:**
- Pull requests to `main` or `develop`
- Push to `main` or `develop`
- Manual workflow dispatch

**Jobs:**
1. **backend-tests** - Unit tests, type checking, linting
2. **frontend-tests** - Unit tests, type checking, linting
3. **e2e-tests** - Playwright E2E tests (sharded)
4. **build-check** - Build verification
5. **security-audit** - Dependency audit
6. **test-summary** - Aggregate results

**Configuration:**
- Node.js 20.x
- Parallel execution
- Test sharding for E2E
- Coverage reporting

---

### Deployment Workflow (`.github/workflows/deploy.yml`)

**Triggers:**
- Push to `main` branch
- Manual workflow dispatch with environment selection

**Concurrency:**
- One deployment at a time per branch
- No concurrent deployments (safety)

**Jobs:**

#### 1. pre-deployment-tests
- Run all test suites
- Type checking
- Coverage collection
- **BLOCKING GATE**

#### 2. pre-deployment-validation
- Run validation script
- Environment checks
- Security audit
- Build verification
- **BLOCKING GATE**

#### 3. deploy-backend
- Install dependencies
- Build backend
- Deploy to Vercel
- Output deployment URL

#### 4. deploy-frontend
- Install dependencies
- Build frontend with env vars
- Deploy to Vercel
- Output deployment URL

#### 5. post-deployment-verification
- Run verification script
- Comprehensive health checks
- Performance baseline
- **BLOCKING GATE**

#### 6. deployment-summary
- Aggregate all results
- Create deployment report
- Notify success/failure
- Provide next steps

---

## Environment Variables

### Required for CI/CD

#### GitHub Secrets (Backend)
```bash
ANTHROPIC_API_KEY          # Claude API key
JWT_SECRET                 # JWT signing secret
JWT_REFRESH_SECRET         # Refresh token secret
STRIPE_SECRET_KEY          # Stripe API key
STRIPE_WEBHOOK_SECRET      # Stripe webhook signing secret
ALLOWED_ORIGINS            # CORS origins
VERCEL_TOKEN               # Vercel API token
VERCEL_ORG_ID              # Vercel org ID (backend)
VERCEL_PROJECT_ID          # Vercel project ID (backend)
BACKEND_URL                # Production backend URL
```

#### GitHub Secrets (Frontend)
```bash
VITE_API_URL                     # Backend API URL
VITE_GOOGLE_CLIENT_ID            # Google OAuth client ID
VITE_STRIPE_PUBLISHABLE_KEY      # Stripe publishable key
VITE_STRIPE_PRICE_FREE_TRIAL     # Free trial price ID
VITE_STRIPE_PRICE_MONTHLY        # Monthly price ID
VITE_STRIPE_PRICE_YEARLY         # Yearly price ID
VERCEL_ORG_ID_FRONTEND           # Vercel org ID (frontend)
VERCEL_PROJECT_ID_FRONTEND       # Vercel project ID (frontend)
FRONTEND_URL                     # Production frontend URL
```

#### Optional Secrets
```bash
SENTRY_DSN                 # Error tracking
CODECOV_TOKEN              # Code coverage
GOOGLE_CLIENT_SECRET       # Google OAuth secret
```

---

## Scripts Reference

### Pre-Deployment Validation
**Path:** `scripts/pre-deploy-validation.sh`

**Purpose:** Comprehensive pre-deployment checks

**Usage:**
```bash
bash scripts/pre-deploy-validation.sh
```

**Environment Required:** Production environment variables

---

### Post-Deployment Verification
**Path:** `scripts/post-deploy-verification.sh`

**Purpose:** Validate production deployment health

**Usage:**
```bash
export BACKEND_URL=https://api.restoreassist.app
export FRONTEND_URL=https://restoreassist.app
bash scripts/post-deploy-verification.sh
```

**Retries:** 3 attempts with 5-second delay

---

### Rollback
**Path:** `scripts/rollback.sh`

**Purpose:** Revert to previous stable deployment

**Usage:**
```bash
bash scripts/rollback.sh
```

**Modes:**
- Interactive (default)
- Non-interactive (CI/CD)

---

### Health Check
**Path:** `scripts/health-check.sh`

**Purpose:** Monitor production health

**Usage:**
```bash
export BACKEND_URL=https://api.restoreassist.app
export FRONTEND_URL=https://restoreassist.app
bash scripts/health-check.sh
```

---

## Deployment Best Practices

### Before Deployment

1. ✅ **Run tests locally**
   ```bash
   npm test
   ```

2. ✅ **Run pre-deployment validation**
   ```bash
   bash scripts/pre-deploy-validation.sh
   ```

3. ✅ **Check for breaking changes**
   - Database schema changes
   - API contract changes
   - Environment variable changes

4. ✅ **Review recent commits**
   ```bash
   git log --oneline -10
   ```

5. ✅ **Verify environment variables**
   - Check Vercel dashboard
   - Ensure all secrets are set

### During Deployment

1. 📊 **Monitor pipeline progress**
   - Watch GitHub Actions
   - Check for gate failures

2. 📊 **Monitor Vercel dashboard**
   - Build logs
   - Deployment status

3. 📊 **Monitor Sentry**
   - New error spikes
   - Performance degradation

### After Deployment

1. ✅ **Run post-deployment verification**
   ```bash
   bash scripts/post-deploy-verification.sh
   ```

2. 📊 **Monitor for 30 minutes**
   - Application logs
   - Error rates
   - Response times
   - User traffic

3. ✅ **Verify critical flows**
   - User signup
   - Authentication
   - Payment processing

4. ✅ **Check Stripe webhooks**
   - Webhook delivery
   - Signature validation

### If Deployment Fails

1. 🚨 **Check failure point**
   - Which gate failed?
   - Review error logs

2. 🔄 **Rollback if needed**
   ```bash
   bash scripts/rollback.sh
   ```

3. 🐛 **Debug issues**
   - Local reproduction
   - Log analysis
   - Environment comparison

4. 🔧 **Fix and redeploy**
   - Fix root cause
   - Re-run validation
   - Deploy again

---

## Monitoring and Alerts

### What to Monitor

#### Application Health
- ✅ Health endpoint uptime
- ✅ API response times
- ✅ Error rates (Sentry)
- ✅ Database connections

#### Business Metrics
- 📊 User signups
- 📊 Successful logins
- 📊 Payment conversions
- 📊 Trial activations

#### Infrastructure
- ⚡ Vercel function execution time
- ⚡ Build durations
- ⚡ Deployment frequency
- ⚡ Rollback frequency

### Alert Thresholds

#### Critical (Immediate Action)
- 🚨 Health endpoint down > 2 minutes
- 🚨 Error rate > 5%
- 🚨 Payment processing failures
- 🚨 Database connectivity issues

#### Warning (Monitor Closely)
- ⚠️  Response time > 3000ms
- ⚠️  Error rate > 1%
- ⚠️  Failed deployments
- ⚠️  SSL certificate < 30 days

---

## Troubleshooting

### Common Issues

#### Tests Failing in CI
```bash
# Run tests locally with same Node version
nvm use 20
npm ci
npm test
```

#### Environment Variable Missing
```bash
# Verify in Vercel dashboard
# Settings → Environment Variables
# Ensure variable exists for Production environment
```

#### Build Failing
```bash
# Check TypeScript compilation
npm run build

# Review error logs in GitHub Actions
# Check for missing dependencies
```

#### Post-Deployment Verification Failing
```bash
# Run verification locally
bash scripts/post-deploy-verification.sh

# Check specific failing endpoint
curl -v https://api.restoreassist.app/api/health
```

#### Rollback Not Working
```bash
# Manually promote previous deployment in Vercel dashboard
# Project → Deployments → Previous deployment → Promote to Production
```

---

## Maintenance

### Weekly Tasks
- Review deployment metrics
- Check SSL certificate expiry
- Review Sentry error trends
- Update dependencies (minor versions)

### Monthly Tasks
- Review and update secrets/keys
- Audit security vulnerabilities
- Review and optimize builds
- Update documentation

### Quarterly Tasks
- Major dependency updates
- Security audit
- Performance optimization
- Disaster recovery drill

---

## Support and Resources

### Documentation
- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)

### Internal Resources
- Production Status Report: `PRODUCTION_READY_REPORT.md`
- Authentication Setup: `AUTH_SETUP.md`
- Stripe Integration: `STRIPE_ENDPOINT_FIX.md`

### Emergency Contacts
- **On-Call Engineer:** Check team rotation
- **Vercel Support:** support@vercel.com
- **Stripe Support:** support@stripe.com

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-10-24 | Initial CI/CD pipeline implementation |

---

**Last Updated:** October 24, 2024
**Maintained By:** DevOps Team
**Review Cycle:** Monthly
