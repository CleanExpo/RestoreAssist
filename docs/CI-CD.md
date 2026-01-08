# CI/CD Pipeline Documentation

Complete CI/CD infrastructure for RestoreAssist with automated testing, deployment, and quality checks.

## Overview

RestoreAssist uses GitHub Actions for continuous integration and deployment:

| Pipeline | Trigger | Purpose | Deployment |
|----------|---------|---------|-----------|
| **CI** | PR + Push to main/develop | Tests & quality checks | None |
| **Deploy Vercel** | Push to main | Frontend deployment | Production |
| **Deploy DigitalOcean** | Push to main (backend changes) | Backend deployment | Production |
| **Status Checks** | PR opened/updated | Branch protection validation | None |
| **Maintenance** | Weekly + Daily schedules | Dependency & security checks | None |

## CI Pipeline (.github/workflows/ci.yml)

Main quality assurance pipeline that runs on every pull request and push.

### Jobs

**1. Code Quality**
- ESLint validation
- Prettier formatting check
- TypeScript type checking
- **Status**: Required ✓

**2. Frontend Unit Tests**
- Vitest with coverage
- Coverage upload to Codecov
- **Timeout**: 10 minutes
- **Status**: Required ✓

**3. Backend Tests**
- Pytest with PostgreSQL + Redis
- Database migrations validation
- **Timeout**: 10 minutes
- **Status**: Required ✓

**4. E2E Tests**
- Playwright cross-browser testing
- Screenshot/video on failure
- **Timeout**: 15 minutes
- **Browsers**: Chromium, Firefox, WebKit, Mobile
- **Status**: Required ✓

**5. Visual Regression**
- Percy snapshot testing
- Multi-viewport comparison
- **Runs on**: Pull requests only
- **Status**: Optional (informational)

**6. Performance Tests**
- Lighthouse CI scoring
- Core Web Vitals validation
- **Runs on**: Pull requests only
- **Status**: Optional (informational)

**7. Security Scanning**
- Trivy vulnerability scanner
- Dependency security check
- **Status**: Optional (non-blocking)

**8. Build Verification**
- Frontend build check
- Backend module validation
- **Status**: Required ✓

### Execution Flow

```
code-quality (required)
    ↓
[frontend-tests] [backend-tests] (parallel, required)
    ↓
[e2e-tests] [build] (parallel, required)
    ↓
[visual-tests] [performance] [security] (parallel, optional)
    ↓
ci-status (final check)
    ↓
notify (comment on PR)
```

### Secrets Required

Add these to GitHub repository Settings > Secrets:

```
CODECOV_TOKEN              # Codecov upload token
PERCY_TOKEN                # Percy visual testing token
```

## Deployment Workflows

### Vercel Deployment (.github/workflows/deploy-vercel.yml)

**Trigger**: Push to `main` branch

**Steps**:
1. Setup environment
2. Run linting
3. Run tests
4. Build Next.js app
5. Deploy to Vercel production
6. Run post-deployment health checks
7. Run Lighthouse CI on production
8. Notify Slack

**Environment Variables**:
```
VERCEL_TOKEN              # Vercel API token
VERCEL_ORG_ID             # Organization ID
VERCEL_PROJECT_ID         # Project ID
```

**Deployment Time**: 5-10 minutes

### DigitalOcean Deployment (.github/workflows/deploy-digitalocean.yml)

**Trigger**: Push to `main` branch (backend changes)

**Steps**:
1. Build Docker image
2. Push to DigitalOcean Registry
3. Deploy to App Platform
4. Run database migrations
5. Run health checks
6. Notify Slack

**Environment Variables**:
```
DIGITALOCEAN_ACCESS_TOKEN    # DigitalOcean API token
DIGITALOCEAN_REGISTRY_NAME   # Container registry name
DATABASE_URL                 # Production database URL
DIRECT_URL                   # Direct database URL
```

**Deployment Time**: 10-15 minutes

## Status Checks (.github/workflows/status-checks.yml)

Validates branch protection requirements for pull requests.

**Checks**:
- ✓ Draft PR detection
- ✓ Code review requirements (≥1 approval)
- ✓ Conversation resolution (no pending changes)
- ✓ Conventional commit format
- ✓ Dependency changes flagged
- ✓ File size validation (<5MB)
- ✓ Secret detection

**Branch Protection Settings**:

Required status checks:
- `CI / quality` (code quality)
- `CI / frontend-tests` (unit tests)
- `CI / backend-tests` (backend tests)
- `CI / e2e-tests` (E2E tests)
- `CI / build` (build verification)

Required approvals:
- ✓ Minimum 1 approval
- ✓ Dismiss stale reviews on push

## Maintenance Workflow (.github/workflows/maintenance.yml)

**Schedule**:
- Daily: Security checks (2 AM UTC)
- Weekly: Dependency checks (Monday midnight UTC)
- Weekly: Performance check (Monday 9 AM UTC)

**Tasks**:
- Check npm/pip outdated packages
- Run security audits
- Verify database backups
- Performance baseline (Lighthouse)
- Clean up old artifacts (>30 days)
- Generate reports
- Create issues for problems

## Pre-commit Hooks

Local validation before pushing code.

### Setup

```bash
npm run prepare
```

### Configuration (.husky/pre-commit)

Runs automatically on `git commit`:

1. **lint-staged**: Auto-fix ESLint, Prettier, Ruff issues
2. **Type checking**: `npm run type-check`

### Staged Files Processing

```
*.{js,jsx,ts,tsx} → eslint --fix → prettier --write
*.{json,md,yml,yaml} → prettier --write
*.py → ruff check --fix → ruff format
```

## Environment Variables

### Repository Secrets

**GitHub Settings > Secrets and variables > Actions**:

```yaml
# Codecov
CODECOV_TOKEN: xxx

# Percy (Visual Testing)
PERCY_TOKEN: xxx

# Vercel
VERCEL_TOKEN: xxx
VERCEL_ORG_ID: xxx
VERCEL_PROJECT_ID: xxx

# DigitalOcean
DIGITALOCEAN_ACCESS_TOKEN: xxx
DIGITALOCEAN_REGISTRY_NAME: xxx

# Database (Production)
DATABASE_URL: postgresql://...
DIRECT_URL: postgresql://...

# Slack Notifications
SLACK_WEBHOOK: https://hooks.slack.com/...
```

### Repository Variables

**Settings > Variables > Actions**:

```yaml
REGISTRY: registry.digitalocean.com
IMAGE_NAME: restoreassist-backend
```

## Monitoring & Notifications

### Slack Integration

Workflows send notifications to Slack channel:
- ✅ Successful deployments
- ❌ Failed deployments
- ⚠️ Maintenance issues
- 📊 Performance reports

### GitHub Notifications

- PR comments with CI status
- Auto-assigned reviewers (on PR)
- Issue creation for security findings

## Troubleshooting

### Failed Workflow

1. **Check logs**: Click on failed job name
2. **Review error**: Look for red text
3. **Common fixes**:
   - Missing secrets? → Add to Settings
   - Timeout? → Increase timeout value
   - Cache issue? → Clear cache in Settings > Actions

### Secrets Not Available

```bash
# Verify secrets are set
gh secret list -R your-org/repo

# Verify permissions
# Settings > Actions > General > Workflow permissions
# ✓ Read and write permissions
```

### Deployment Stuck

```bash
# Check DigitalOcean App Platform logs
doctl apps logs <app-id>

# Check Vercel deployment logs
vercel logs <url>
```

## Performance Targets

### Test Execution Times

| Test Suite | Expected Time | Timeout |
|-----------|---------------|---------|
| Code Quality | 2-3 min | 5 min |
| Unit Tests | 3-5 min | 10 min |
| Backend Tests | 3-5 min | 10 min |
| E2E Tests | 5-10 min | 15 min |
| Build | 3-5 min | 10 min |
| Total | 15-25 min | - |

### Web Vitals Targets

- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1
- **Performance Score**: 85+

## Best Practices

### Branch Strategy

```
main (production)
  ↑ (PRs with passing CI)
  |
develop (staging)
  ↑ (feature branches)
  |
feature/* (feature branches)
```

### Commit Messages

Use conventional commits for automated changelog:

```
feat: Add dark mode toggle
fix: Resolve login timeout issue
docs: Update API documentation
test: Add unit tests for Button component
chore: Update dependencies
```

### Pull Request Process

1. Create feature branch from `develop`
2. Push to GitHub
3. Create pull request to `develop`
4. Wait for CI to pass (required)
5. Request code review
6. Address feedback
7. Merge to `develop` when approved
8. Merge `develop` → `main` for release

## Deployment Checklist

Before merging to main:

- [ ] All tests passing (CI green)
- [ ] Code reviewed (≥1 approval)
- [ ] No security vulnerabilities
- [ ] Performance metrics acceptable
- [ ] Database migrations tested
- [ ] Environment variables set
- [ ] Documentation updated

## Rollback Procedures

### Frontend (Vercel)

```bash
# Revert to previous deployment
vercel rollback <environment>

# Or merge revert commit to main
git revert <commit-hash>
git push origin main
```

### Backend (DigitalOcean)

```bash
# Redeploy previous version
doctl apps update <app-id> \
  --spec app.yaml

# Check deployment status
doctl apps get <app-id>
```

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vercel Deployments](https://vercel.com/docs/deployments/overview)
- [DigitalOcean App Platform](https://docs.digitalocean.com/products/app-platform/)
- [Husky Documentation](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/okonet/lint-staged)

## Contributing

When adding new workflows:

1. Test locally with [act](https://github.com/nektos/act)
2. Use workflow_dispatch for manual testing
3. Document in this file
4. Update branch protection rules if needed
5. Test in staging environment first

---

**Last Updated**: 2026-01-07
**Maintainer**: DevOps Team
**Contact**: ops@restoreassist.com
