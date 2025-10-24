# Deployment Checklist

**Last Updated:** October 23, 2025
**Version:** 1.0.0
**Environment:** Production

## Pre-Deployment Requirements

### 🔐 Security Configuration (CRITICAL)

#### Secrets to Rotate
- [ ] **JWT_SECRET** - Generate new 64-character secret
  ```bash
  openssl rand -base64 48
  ```
  ⚠️ NEVER use the example value from `.env.example`

- [ ] **NEXTAUTH_SECRET** - Generate new NextAuth secret
  ```bash
  openssl rand -base64 32
  ```

- [ ] **DATABASE_URL** - Use production PostgreSQL connection string
  - Format: `postgresql://user:password@host:5432/dbname?sslmode=require`
  - Must have SSL enabled

- [ ] **STRIPE_SECRET_KEY** - Use production Stripe key
  - Must start with `sk_live_`
  - Test in Stripe dashboard first

- [ ] **STRIPE_WEBHOOK_SECRET** - Get from Stripe webhook endpoint
  - Format: `whsec_...`
  - Specific to your webhook endpoint

- [ ] **GOOGLE_CLIENT_SECRET** - Production OAuth credentials
  - Create new OAuth 2.0 credentials in Google Console
  - Add production URLs to authorized redirects

#### API Keys to Configure
- [ ] **ANTHROPIC_API_KEY** - Production Claude API key
  - Set rate limits in Anthropic console
  - Monitor usage dashboard

- [ ] **SENDGRID_API_KEY** - Email service key
  - Verify sender authentication
  - Configure domain authentication

- [ ] **SENTRY_DSN** - Error tracking
  - Create production project
  - Set up alerts

### 📊 Database Setup

#### Migration Steps
1. [ ] **Backup existing database** (if any)
   ```bash
   pg_dump $OLD_DATABASE_URL > backup_$(date +%Y%m%d).sql
   ```

2. [ ] **Create production database**
   ```bash
   createdb restoreassist_prod
   ```

3. [ ] **Run migrations**
   ```bash
   npm run db:migrate --workspace=packages/backend
   ```
   Expected output: "✅ All migrations completed successfully"

4. [ ] **Verify migration status**
   ```sql
   SELECT * FROM schema_migrations ORDER BY executed_at DESC;
   ```
   Should show 9 migrations

5. [ ] **Create indexes**
   - Verify performance indexes created
   - Check foreign key constraints

#### Required Tables
- [ ] `users` - User accounts
- [ ] `subscriptions` - Stripe subscriptions
- [ ] `reports` - Generated reports
- [ ] `refresh_tokens` - JWT tokens
- [ ] `login_sessions` - Active sessions
- [ ] `trial_users` - Trial accounts
- [ ] `schema_migrations` - Migration tracking

### 🌐 Environment Variables

#### Backend Variables
```env
# Database
DATABASE_URL=postgresql://...
DATABASE_POOL_MAX=20

# Authentication
JWT_SECRET=(64 chars minimum)
JWT_EXPIRY=7d
SESSION_SECRET=(32 chars minimum)

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...
STRIPE_PRICE_ID_ANNUAL=price_...

# External Services
ANTHROPIC_API_KEY=sk-ant-...
SENDGRID_API_KEY=SG...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Security
CORS_ORIGIN=https://yourdomain.com
CSRF_SECRET=(32 chars)
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100

# Monitoring
SENTRY_DSN=https://...
LOG_LEVEL=info
```

#### Frontend Variables
```env
# API Configuration
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_PUBLIC_URL=https://yourdomain.com

# Authentication
VITE_GOOGLE_CLIENT_ID=...

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Features
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_SENTRY=true
```

### 🔍 Verification Tests

#### API Health Checks
1. [ ] **Backend health endpoint**
   ```bash
   curl https://api.yourdomain.com/health
   ```
   Expected: `{"status":"healthy","database":"connected"}`

2. [ ] **Authentication test**
   ```bash
   curl -X POST https://api.yourdomain.com/api/auth/test
   ```
   Expected: `{"authenticated":false}`

3. [ ] **Stripe webhook test**
   - Use Stripe CLI to send test webhook
   - Verify signature validation

#### Database Connectivity
1. [ ] **Connection pool test**
   ```bash
   npm run test:db --workspace=packages/backend
   ```

2. [ ] **Query performance**
   - Test with production data volume
   - Verify index usage

### 🚀 Deployment Steps

#### 1. Pre-Deployment (30 minutes)
- [ ] Create production branch from main
- [ ] Run full test suite locally
  ```bash
  npm test
  ```
- [ ] Build production bundles
  ```bash
  npm run build
  ```
- [ ] Verify no TypeScript errors
  ```bash
  npx tsc --noEmit
  ```

#### 2. Database Deployment (15 minutes)
- [ ] Connect to production database
- [ ] Run migrations
- [ ] Verify table creation
- [ ] Test sample queries

#### 3. Backend Deployment (20 minutes)
- [ ] Deploy to Vercel
  ```bash
  vercel --prod
  ```
- [ ] Set environment variables in Vercel dashboard
- [ ] Verify serverless functions deployed
- [ ] Test API endpoints

#### 4. Frontend Deployment (15 minutes)
- [ ] Build production bundle
- [ ] Deploy static assets
- [ ] Verify CDN configuration
- [ ] Test critical user flows

#### 5. Post-Deployment Verification (30 minutes)
- [ ] **Authentication flow**
  - [ ] Email/password signup
  - [ ] Login/logout
  - [ ] Password reset
  - [ ] Session persistence

- [ ] **Payment flow**
  - [ ] Stripe checkout
  - [ ] Webhook processing
  - [ ] Subscription creation

- [ ] **Core features**
  - [ ] Report generation
  - [ ] File exports
  - [ ] Integration connections

### 🔄 Rollback Procedures

#### Immediate Rollback (5 minutes)
1. **Revert Vercel deployment**
   ```bash
   vercel rollback
   ```

2. **Restore database backup** (if schema changed)
   ```bash
   psql $DATABASE_URL < backup_$(date +%Y%m%d).sql
   ```

3. **Clear caches**
   - CDN cache
   - Redis cache
   - Browser caches

#### Rollback Verification
- [ ] Previous version accessible
- [ ] Database queries working
- [ ] No data loss
- [ ] Error rates normal

### 📊 Monitoring Setup

#### Essential Monitors
1. [ ] **Uptime monitoring**
   - Frontend URL
   - API health endpoint
   - Database connection

2. [ ] **Error tracking**
   - Sentry alerts configured
   - Error rate thresholds set
   - Team notifications enabled

3. [ ] **Performance monitoring**
   - Response time alerts (<500ms)
   - Database query monitoring
   - Memory usage tracking

4. [ ] **Security monitoring**
   - Failed login attempts
   - Unusual API usage patterns
   - Webhook failures

#### Alert Channels
- [ ] Email notifications configured
- [ ] Slack/Discord webhooks set up
- [ ] PagerDuty for critical issues

### 📝 Documentation Updates

- [ ] Update README with production URL
- [ ] Document deployment process
- [ ] Update API documentation
- [ ] Create runbook for common issues
- [ ] Update team wiki/confluence

### ✅ Final Checklist

#### Security
- [ ] All secrets rotated
- [ ] HTTPS enforced everywhere
- [ ] CORS properly configured
- [ ] Rate limiting active
- [ ] CSRF protection enabled

#### Performance
- [ ] CDN configured
- [ ] Gzip/Brotli compression enabled
- [ ] Database indexes created
- [ ] Caching headers set
- [ ] Bundle size <1MB

#### Compliance
- [ ] Privacy policy updated
- [ ] Terms of service published
- [ ] Cookie consent implemented
- [ ] GDPR compliance verified
- [ ] Data retention policies set

### 🚨 Emergency Contacts

- **DevOps Lead:** [Contact]
- **Database Admin:** [Contact]
- **Security Team:** [Contact]
- **Stripe Support:** [Dashboard Link]
- **Vercel Support:** [Dashboard Link]

### 📅 Post-Deployment Tasks

#### Day 1
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify payment processing
- [ ] Review user feedback

#### Week 1
- [ ] Analyze usage patterns
- [ ] Optimize slow queries
- [ ] Review security logs
- [ ] Plan first patch release

#### Month 1
- [ ] Conduct security audit
- [ ] Performance optimization
- [ ] Feature usage analysis
- [ ] Customer feedback review

---

## Deployment Sign-off

- [ ] **Technical Lead:** _______________
- [ ] **Security Review:** _______________
- [ ] **QA Approval:** _______________
- [ ] **Product Owner:** _______________

**Deployment Date:** _______________
**Deployment Time:** _______________
**Deployed By:** _______________

## Notes

_Space for deployment-specific notes and issues encountered:_

---

**Remember:** Take your time, follow each step carefully, and don't skip verification steps. A successful deployment is worth the extra care!