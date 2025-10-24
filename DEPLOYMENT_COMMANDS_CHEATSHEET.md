# Deployment Commands Cheatsheet 🚀

**Quick Reference for RestoreAssist Deployment**

---

## Pre-Deployment

### Verify Pipeline Ready
```bash
bash scripts/test-pipeline-locally.sh
```
**Expected:** "CI/CD PIPELINE READY ✅"

### Validate Before Deploy
```bash
bash scripts/pre-deploy-validation.sh
```
**Expected:** "DEPLOYMENT AUTHORIZED"

### Check TypeScript
```bash
# Backend
cd packages/backend && npx tsc --noEmit

# Frontend
cd packages/frontend && npx tsc --noEmit
```

### Run Tests Locally
```bash
# All tests
npm test

# Backend tests only
npm test --workspace=packages/backend

# Frontend tests only
npm test --workspace=packages/frontend

# E2E tests
cd packages/frontend && npx playwright test
```

### Build Production
```bash
# All packages
npm run build

# Backend only
npm run build --workspace=packages/backend

# Frontend only
npm run build --workspace=packages/frontend
```

---

## Deployment

### Deploy to Production (Automatic)
```bash
# Push to main branch
git push origin main

# Triggers GitHub Actions automatically
# Monitor at: github.com/YourOrg/RestoreAssist/actions
```

### Deploy Manually (GitHub Actions)
```
1. Go to: github.com/YourOrg/RestoreAssist/actions
2. Click: "Deploy to Production"
3. Click: "Run workflow"
4. Select: "production" environment
5. Click: "Run workflow" button
```

### Deploy Backend Only
```bash
# Make changes in packages/backend/
git add packages/backend/
git commit -m "feat: update backend"
git push origin main

# Triggers backend-specific workflow
```

### Deploy with Docker Compose
```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

## Post-Deployment

### Verify Deployment
```bash
# Full verification suite
bash scripts/post-deploy-verification.sh

# Expected: "DEPLOYMENT VERIFIED ✅"
```

### Quick Health Check
```bash
bash scripts/health-check.sh
```

### Manual Health Check
```bash
# Backend
curl https://api.yourdomain.com/api/health

# Frontend
curl https://yourdomain.com

# Expected: HTTP 200
```

### Check Deployment Logs
```bash
# Vercel CLI
vercel logs <deployment-url>

# Docker logs
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs frontend
```

---

## Rollback

### Automatic Rollback (Recommended)
```bash
bash scripts/rollback.sh
```
**Interactive mode:** Prompts for confirmation
**Non-interactive:** Set `INTERACTIVE=false`

### Manual Rollback with Vercel
```bash
# List recent deployments
vercel ls --prod

# Promote previous deployment
vercel promote <deployment-url> --prod
```

### Rollback Backend Only
```bash
bash scripts/rollback.sh
# Select option 2: "Rollback backend only"
```

### Rollback Frontend Only
```bash
bash scripts/rollback.sh
# Select option 3: "Rollback frontend only"
```

### Rollback to Specific Deployment
```bash
bash scripts/rollback.sh
# Select option 4: "Rollback to specific deployment URL"
# Enter deployment URL when prompted
```

---

## Monitoring

### Check Application Health
```bash
# Production backend
curl https://api.yourdomain.com/api/health | jq

# Production frontend
curl https://yourdomain.com -I
```

### Monitor Errors (Sentry)
```
https://sentry.io/organizations/your-org/projects/
```

### Monitor Webhooks (Stripe)
```
https://dashboard.stripe.com/webhooks
```

### Check SSL Certificate
```bash
# Check certificate
openssl s_client -servername yourdomain.com -connect yourdomain.com:443 | openssl x509 -noout -dates

# Days until expiry
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Troubleshooting

### Deployment Failing

**Check workflow logs:**
```
github.com/YourOrg/RestoreAssist/actions
```

**Common issues:**
- Environment variables not set
- TypeScript compilation errors
- Tests failing
- Build artifacts missing

**Fix and redeploy:**
```bash
# Fix issues
git add .
git commit -m "fix: resolve deployment issue"
git push origin main
```

### Verification Failing

**Check environment variables:**
```bash
# In Vercel dashboard
vercel env ls

# In GitHub
Repository → Settings → Secrets and variables → Actions
```

**Test endpoints manually:**
```bash
# Backend health
curl https://api.yourdomain.com/api/health

# Frontend
curl https://yourdomain.com -I

# Auth endpoint
curl https://api.yourdomain.com/api/auth/me
# Expected: 401 Unauthorized
```

### Database Issues

**Check connection:**
```bash
# Using psql
psql $DATABASE_URL

# Check migrations
cd packages/backend
npx prisma migrate status
```

**Run migrations:**
```bash
cd packages/backend
npx prisma migrate deploy
```

### Stripe Webhook Issues

**Test webhook locally:**
```bash
# Install Stripe CLI
stripe listen --forward-to localhost:3001/api/stripe/webhook

# Trigger test event
stripe trigger payment_intent.succeeded
```

**Verify webhook secret:**
```bash
# Should start with whsec_
echo $STRIPE_WEBHOOK_SECRET
```

---

## Environment Variables

### Generate Secrets
```bash
# JWT secrets (run twice for two different secrets)
openssl rand -base64 48

# Strong random string
openssl rand -hex 32
```

### Set Vercel Environment Variables
```bash
# Using Vercel CLI
vercel env add VARIABLE_NAME production

# Or via dashboard
vercel.com/your-org/project/settings/environment-variables
```

### Set GitHub Secrets
```
Repository → Settings → Secrets and variables → Actions → New repository secret
```

---

## Docker Commands

### Build Images
```bash
# Build backend
docker build -t restoreassist-backend:latest -f packages/backend/Dockerfile packages/backend

# Build frontend
docker build -t restoreassist-frontend:latest -f packages/frontend/Dockerfile packages/frontend
```

### Run Containers
```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Start specific service
docker-compose -f docker-compose.prod.yml up -d backend

# Scale services
docker-compose -f docker-compose.prod.yml up -d --scale backend=3
```

### Manage Containers
```bash
# View running containers
docker-compose -f docker-compose.prod.yml ps

# Stop all services
docker-compose -f docker-compose.prod.yml down

# View logs
docker-compose -f docker-compose.prod.yml logs -f backend

# Execute command in container
docker-compose -f docker-compose.prod.yml exec backend npm run migrate
```

### Clean Up
```bash
# Remove stopped containers
docker-compose -f docker-compose.prod.yml rm

# Remove volumes
docker-compose -f docker-compose.prod.yml down -v

# Prune unused images
docker image prune -a
```

---

## Git Commands

### Create Release Branch
```bash
git checkout -b release/v1.0.0
git push origin release/v1.0.0
```

### Tag Release
```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### Hotfix Workflow
```bash
# Create hotfix branch
git checkout -b hotfix/critical-fix main

# Make fix
git add .
git commit -m "fix: critical production issue"

# Deploy
git push origin hotfix/critical-fix

# Merge to main
git checkout main
git merge hotfix/critical-fix
git push origin main
```

---

## Quick Checks

### Is Everything Running?
```bash
# Backend
curl https://api.yourdomain.com/api/health

# Frontend
curl https://yourdomain.com -I

# Database (from backend container)
docker-compose -f docker-compose.prod.yml exec backend npx prisma db execute --stdin <<< "SELECT 1;"
```

### Performance Check
```bash
# Measure response time
time curl https://api.yourdomain.com/api/health

# Load test (requires ab - Apache Bench)
ab -n 100 -c 10 https://api.yourdomain.com/api/health
```

### Security Check
```bash
# Check for secrets in code
bash scripts/pre-deploy-validation.sh | grep "Secret"

# NPM audit
npm audit --audit-level=high

# Check HTTPS
curl -I https://yourdomain.com | grep "HTTP"
```

---

## Emergency Commands

### Quick Rollback
```bash
# One command rollback
bash scripts/rollback.sh <<< $'both\nyes'
```

### Stop All Services (Docker)
```bash
docker-compose -f docker-compose.prod.yml down
```

### Clear All Caches
```bash
# Vercel
vercel env rm CACHE --yes

# Docker
docker system prune -a --volumes -f

# npm
npm cache clean --force
```

---

## Useful Aliases

Add to your `.bashrc` or `.zshrc`:

```bash
# Deployment
alias deploy-test="bash scripts/test-pipeline-locally.sh"
alias deploy-validate="bash scripts/pre-deploy-validation.sh"
alias deploy-verify="bash scripts/post-deploy-verification.sh"
alias deploy-rollback="bash scripts/rollback.sh"
alias deploy-health="bash scripts/health-check.sh"

# Docker
alias dc-prod="docker-compose -f docker-compose.prod.yml"
alias dc-logs="docker-compose -f docker-compose.prod.yml logs -f"
alias dc-ps="docker-compose -f docker-compose.prod.yml ps"

# Git
alias gp="git push origin main"
alias gs="git status"
alias gl="git log --oneline -10"

# Vercel
alias vl="vercel logs"
alias vd="vercel --prod"
```

---

## Documentation Quick Links

| Document | Purpose |
|----------|---------|
| CICD_PIPELINE.md | Complete CI/CD reference |
| DEPLOYMENT_QUICK_REFERENCE.md | Quick commands |
| PIPELINE_VERIFICATION_COMPLETE.md | Verification report |
| DEPLOYMENT_CHECKLIST.md | Manual checklist |
| CICD_FILES_INDEX.md | File navigation |

---

**Last Updated:** October 24, 2025
**Version:** 1.0.0
**Maintained By:** DevOps Team
