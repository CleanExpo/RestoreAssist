# RestoreAssist Monitoring & Observability Guide

## Overview

RestoreAssist implements comprehensive monitoring and error tracking using Sentry for both frontend and backend applications. This guide covers setup, configuration, and best practices for maintaining production observability.

## 🚀 Quick Start

### 1. Set Up Sentry Account

1. Create a Sentry account at [sentry.io](https://sentry.io)
2. Create two projects:
   - `restoreassist-frontend` (React)
   - `restoreassist-backend` (Node.js)
3. Note your DSN values from Settings → Client Keys (DSN)

### 2. Configure Environment Variables

```bash
# Frontend (.env)
VITE_SENTRY_DSN=https://YOUR_PUBLIC_KEY@o0.ingest.sentry.io/PROJECT_ID
VITE_APP_VERSION=1.0.0

# Backend (.env)
SENTRY_DSN=https://YOUR_PUBLIC_KEY@o0.ingest.sentry.io/BACKEND_PROJECT_ID
```

### 3. Verify Installation

- Frontend: Check browser console for "✅ Sentry initialized in production mode"
- Backend: Check server logs for "✅ Sentry error monitoring initialized"

## 📊 Monitoring Capabilities

### Error Tracking

- **Unhandled Exceptions**: Automatically captured with stack traces
- **Promise Rejections**: Tracked with async context
- **Network Errors**: Monitored with request/response details
- **React Error Boundaries**: Component errors with component stack

### Performance Monitoring

- **API Response Times**: All backend endpoints tracked
- **Frontend Transactions**: Page loads and route changes
- **Slow Query Detection**: Database queries > 1 second
- **Resource Loading**: Script, stylesheet, and image load times

### Custom Monitoring

- **Business Metrics**: Report generation time, checkout completion rates
- **Integration Health**: ServiceM8, Google Drive, Stripe status
- **Authentication Flow**: OAuth success/failure rates
- **Payment Processing**: Stripe checkout and subscription events

## 🎯 Key Monitoring Points

### Frontend Monitoring

#### 1. Authentication & Authorization
```javascript
// Tracked automatically in apiWithMonitoring.ts
- Google OAuth login attempts
- Token refresh failures
- Session expiration events
- Permission denied errors
```

#### 2. Report Generation
```javascript
// Performance tracked with custom spans
- Generation request time
- AI processing duration
- PDF/DOCX export time
- Upload to cloud storage
```

#### 3. Payment Flow
```javascript
// Critical path monitoring
- Checkout session creation
- Payment method validation
- Subscription activation
- Trial conversion tracking
```

### Backend Monitoring

#### 1. API Endpoints
```javascript
// All endpoints automatically instrumented
- Request/response times
- Error rates by endpoint
- Rate limiting violations
- Authentication failures
```

#### 2. Database Operations
```javascript
// Prisma instrumentation
- Query execution time
- Connection pool health
- Transaction failures
- Migration status
```

#### 3. External Service Integrations
```javascript
// Third-party API monitoring
- Anthropic AI API calls
- Stripe API operations
- Google OAuth verification
- ServiceM8/Ascora sync
```

## 🔍 Viewing Errors in Sentry

### Dashboard Navigation

1. **Issues**: View all errors grouped by fingerprint
2. **Performance**: Transaction traces and slow operations
3. **Releases**: Track errors by deployment version
4. **User Feedback**: Reports linked to specific users

### Key Filters

```
# Useful Sentry search queries

# Critical production errors
environment:production level:error

# Payment-related issues
transaction:"*stripe*" OR transaction:"*checkout*"

# Authentication problems
transaction:"*auth*" OR transaction:"*login*"

# Slow API calls (> 3 seconds)
transaction.duration:>3000

# Specific user issues
user.email:"user@example.com"

# Recent errors (last 24h)
timestamp:-24h
```

### Error Context

Each error includes:
- User information (ID, email, role)
- Request details (method, URL, headers)
- Environment (production/development)
- Release version
- Browser/OS information
- Breadcrumbs (user actions leading to error)

## 🔔 Alerting Configuration

### Recommended Alert Rules

#### 1. Critical Errors
```yaml
Alert: High Error Rate
Condition: Error count > 50 in 5 minutes
Channel: PagerDuty / Slack (high-priority)
```

#### 2. Performance Degradation
```yaml
Alert: Slow API Response
Condition: P95 latency > 5 seconds
Channel: Slack (engineering)
```

#### 3. Payment Failures
```yaml
Alert: Checkout Failure Spike
Condition: Checkout error rate > 10%
Channel: PagerDuty / Email (critical)
```

#### 4. Authentication Issues
```yaml
Alert: OAuth Login Failures
Condition: OAuth error count > 20 in 10 minutes
Channel: Slack (security)
```

### Notification Channels

1. **Slack Integration**
   - Install Sentry Slack app
   - Configure webhook in Project Settings → Integrations
   - Set up #alerts-production channel

2. **Email Alerts**
   - Configure in Project Settings → Alerts
   - Set up escalation for critical issues

3. **PagerDuty** (Optional)
   - For 24/7 on-call rotation
   - Integrate via Sentry settings

## 📈 Performance Baselines

### Target Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Response Time (P50) | < 200ms | > 500ms |
| API Response Time (P95) | < 1s | > 3s |
| Report Generation | < 30s | > 60s |
| Error Rate | < 0.1% | > 1% |
| Checkout Success Rate | > 95% | < 90% |
| OAuth Success Rate | > 98% | < 95% |

### Performance Budget

```javascript
// Frontend bundle size limits
Main bundle: < 250KB (gzipped)
Vendor bundle: < 500KB (gzipped)
Initial load: < 3s (3G network)
Time to interactive: < 5s
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Sentry Not Receiving Events

```bash
# Check environment variables
echo $SENTRY_DSN
echo $VITE_SENTRY_DSN

# Verify in browser console
localStorage.setItem('debug', 'sentry:*')

# Check network tab for Sentry requests
Look for requests to *.ingest.sentry.io
```

#### 2. Missing User Context

```javascript
// Ensure user context is set after login
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.name
});
```

#### 3. Transactions Not Appearing

```javascript
// Verify sampling rate
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% sampling

// For debugging, temporarily set to 1.0
SENTRY_TRACES_SAMPLE_RATE=1.0  # 100% sampling
```

## 🔐 Security Considerations

### Data Scrubbing

Sensitive data is automatically filtered:
- Passwords (any field containing 'password')
- API Keys (any field containing 'key', 'token', 'secret')
- Credit Card numbers
- Social Security numbers
- Authorization headers

### PII Handling

```javascript
// Configure in Sentry project settings
Data Scrubbing: Enabled
Scrub IP Addresses: Enabled
Scrub Defaults: Enabled
Additional Scrub Fields: email, name, phone
```

### Compliance

- GDPR: User data retention set to 30 days
- HIPAA: No health information logged
- PCI DSS: Payment data never sent to Sentry

## 📊 Custom Dashboards

### Executive Dashboard

Create in Sentry → Dashboards → Create Dashboard:

1. **Business Health**
   - Report generation success rate
   - Average generation time
   - Daily active users
   - Revenue impact of errors

2. **Technical Health**
   - Error rate by release
   - API availability (uptime)
   - Performance regression detection
   - Database connection pool usage

### Engineering Dashboard

1. **Error Analysis**
   - Top errors by occurrence
   - New errors in last 24h
   - Error trends by browser/OS
   - Errors by user segment

2. **Performance Metrics**
   - Slowest transactions
   - Database query performance
   - Third-party API latency
   - Frontend bundle size tracking

## 🚨 Incident Response

### Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| P0 | Service Down | < 15 min | Payment system offline |
| P1 | Critical | < 30 min | Login failures > 50% |
| P2 | High | < 2 hours | Report generation slow |
| P3 | Medium | < 24 hours | UI bug affecting < 10% |
| P4 | Low | Best effort | Minor logging issue |

### Response Playbook

1. **Identify** - Check Sentry for error details
2. **Triage** - Determine severity and impact
3. **Communicate** - Update status page and team
4. **Mitigate** - Deploy hotfix or rollback
5. **Resolve** - Fix root cause
6. **Review** - Post-mortem and improvements

## 📚 Additional Resources

- [Sentry React Documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Node Documentation](https://docs.sentry.io/platforms/node/)
- [Performance Monitoring Best Practices](https://docs.sentry.io/product/performance/)
- [Alert Configuration Guide](https://docs.sentry.io/product/alerts/)

## 🔄 Maintenance Tasks

### Weekly
- Review error trends and new issues
- Check performance regression alerts
- Update alert thresholds if needed

### Monthly
- Review and tune sampling rates
- Analyze performance budgets
- Update monitoring documentation
- Clean up resolved/ignored issues

### Quarterly
- Review monitoring coverage
- Evaluate new Sentry features
- Update alerting rules
- Conduct monitoring fire drill

## 📞 Support

For monitoring issues or questions:
- Slack: #engineering-oncall
- Email: devops@restoreassist.com
- Sentry Status: [status.sentry.io](https://status.sentry.io)

---

Last Updated: January 2025
Version: 1.0.0