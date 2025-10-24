# Deployment Quick Reference

## 🚀 Quick Commands

### Local Pre-Deployment Check
```bash
# Run validation before pushing to main
bash scripts/pre-deploy-validation.sh
```

### Manual Deployment Verification
```bash
# After deployment completes
export BACKEND_URL=https://your-backend-url.vercel.app
export FRONTEND_URL=https://your-frontend-url.vercel.app
bash scripts/post-deploy-verification.sh
```

### Emergency Rollback
```bash
# Rollback to previous deployment
bash scripts/rollback.sh
```

### Health Check
```bash
# Monitor production health
export BACKEND_URL=https://your-backend-url.vercel.app
export FRONTEND_URL=https://your-frontend-url.vercel.app
bash scripts/health-check.sh
```

---

## 📋 Pre-Deployment Checklist

- [ ] All tests pass locally (`npm test`)
- [ ] TypeScript compiles without errors
- [ ] Environment variables verified in Vercel dashboard
- [ ] No exposed secrets in code
- [ ] Database migrations ready (if applicable)
- [ ] Pre-deployment validation passes
- [ ] Breaking changes documented
- [ ] Rollback plan prepared

---

## 🔄 Deployment Flow

```
1. Push to main branch
   ↓
2. GitHub Actions runs test suite
   ↓ (must pass)
3. Pre-deployment validation
   ↓ (must pass)
4. Deploy to Vercel (backend + frontend)
   ↓
5. Post-deployment verification
   ↓ (must pass)
6. ✅ Deployment complete
```

---

## 🚨 Troubleshooting

### Tests Failing
```bash
# Run locally with same environment
npm ci
npm test
```

### Build Failing
```bash
# Check TypeScript
npm run build

# Review logs
# Check missing dependencies
```

### Deployment Failing
```bash
# Check GitHub Actions logs
# Verify environment variables in Vercel
# Review Vercel deployment logs
```

### Health Check Failing
```bash
# Test specific endpoint
curl -v https://api.your-domain.com/api/health

# Check Vercel logs
vercel logs <deployment-url>

# Check Sentry for errors
```

---

## 🔐 Required Environment Variables

### Backend (Vercel Dashboard)
- `ANTHROPIC_API_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ALLOWED_ORIGINS`

### Frontend (Vercel Dashboard)
- `VITE_API_URL`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_STRIPE_PRICE_FREE_TRIAL`
- `VITE_STRIPE_PRICE_MONTHLY`
- `VITE_STRIPE_PRICE_YEARLY`

### GitHub Secrets
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_ORG_ID_FRONTEND`
- `VERCEL_PROJECT_ID_FRONTEND`
- `BACKEND_URL`
- `FRONTEND_URL`

---

## 📊 Monitoring After Deployment

### First 5 Minutes
- ✅ Post-deployment verification passes
- ✅ Health endpoints responding
- ✅ No Sentry errors

### First 30 Minutes
- 📊 Response times normal
- 📊 Error rate < 1%
- 📊 User traffic normal
- 📊 Stripe webhooks delivering

### First 24 Hours
- 📊 User signups tracking normally
- 📊 Payment processing successful
- 📊 No unusual error patterns
- 📊 Performance metrics stable

---

## 🔄 Rollback Decision Matrix

| Situation | Action | Command |
|-----------|--------|---------|
| Tests failing in CI | Fix and redeploy | - |
| Validation failing | Fix and redeploy | - |
| Deployment fails | Automatic retry | - |
| Health checks fail | Rollback immediately | `bash scripts/rollback.sh` |
| Production errors > 5% | Rollback immediately | `bash scripts/rollback.sh` |
| Performance degraded | Monitor, rollback if worsens | `bash scripts/rollback.sh` |
| Minor issues | Fix forward | Deploy fix |

---

## 📞 Emergency Contacts

### On-Call Escalation
1. Check team rotation schedule
2. Notify #incidents Slack channel
3. Create incident ticket

### Vendor Support
- **Vercel:** support@vercel.com
- **Stripe:** support@stripe.com
- **Sentry:** support@sentry.io

---

## 📚 Full Documentation

For comprehensive details, see: `CICD_PIPELINE.md`

---

**Quick Start:**
1. Run validation: `bash scripts/pre-deploy-validation.sh`
2. Push to main
3. Monitor GitHub Actions
4. Wait for deployment
5. Verify: `bash scripts/post-deploy-verification.sh`
6. Monitor production for 30 minutes

**If issues:** `bash scripts/rollback.sh`
