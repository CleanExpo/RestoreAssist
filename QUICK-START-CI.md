# CI/CD Quick Start Guide

## 🚀 What You Got

Messiah #5 has automated everything! Here's what's been set up:

### ✅ Automated Testing
- **GitHub Actions** runs tests on every PR
- **Pre-commit hooks** catch issues before they're committed
- **Parallel execution** for faster test runs
- **Coverage reporting** ready to go

### ✅ Code Quality
- **ESLint** for linting
- **Prettier** for formatting
- **Conventional Commits** for clean git history
- **TypeScript** type checking

### ✅ Deployment Pipeline
- **Test gates** prevent broken deployments
- **Vercel integration** for frontend & backend
- **Health checks** after deployment
- **Rollback protection**

---

## 📦 Quick Commands

### Running Tests

```bash
# All tests
npm test

# Just backend
cd packages/backend && npm test

# Just frontend
cd packages/frontend && npm test

# E2E tests with UI
cd packages/frontend && npm run test:e2e:ui

# Performance benchmarks
cd packages/backend && npm run test:perf
```

### Code Quality

```bash
# Lint all code
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format all code
npm run format

# Check formatting
npm run format:check

# Verify CI setup
npm run verify:ci
```

### Development Workflow

```bash
# 1. Create branch
git checkout -b feature/my-feature

# 2. Make changes
# ... code ...

# 3. Commit (hooks run automatically)
git commit -m "feat: add my feature"

# 4. Push
git push origin feature/my-feature

# 5. Open PR - tests run automatically!
```

---

## ⚡ Performance Targets

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Backend Coverage | 85% | 90% | 🟡 |
| Frontend Coverage | 69% | 85% | 🟡 |
| Total Coverage | 75% | 90% | 🟡 |
| CI Runtime | 5-8 min | <5 min | 🟡 |
| Test Count | 67/89 | 78/89 | 🟡 |

---

## 📋 Pre-Commit Checklist

When you commit, these run automatically:

- ✅ Lint staged files
- ✅ Format code
- ✅ Type check backend
- ✅ Type check frontend
- ✅ Validate commit message

**If hooks fail:**
```bash
npm run lint:fix
npm run format
git add .
git commit -m "fix: your message"
```

---

## 🔧 GitHub Secrets to Configure

Add these in **Settings → Secrets and variables → Actions**:

### Required for Deploy
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_ORG_ID_FRONTEND`
- `VERCEL_PROJECT_ID_FRONTEND`

### Environment Variables
- `VITE_API_URL_PROD`
- `VITE_SENTRY_DSN`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `BACKEND_URL`
- `FRONTEND_URL`

### Optional
- `CODECOV_TOKEN` (for coverage reports)

---

## 🎯 Next Steps

### Immediate (Required)
1. **Add GitHub Secrets** - Configure deployment secrets
2. **Test Workflow** - Create a test PR to verify CI works
3. **Enable Branch Protection** - Require tests to pass before merge

### Soon (Recommended)
1. **Increase Test Coverage** - Add 11 more tests to hit 90%
2. **Enable CodeCov** - Track coverage trends
3. **Add More E2E Tests** - Cover critical user flows

### Future (Nice to Have)
1. **Visual Regression Testing** - Percy or Chromatic
2. **API Contract Tests** - Pact integration
3. **Performance Monitoring** - Lighthouse CI
4. **Security Scanning** - Snyk or CodeQL

---

## 📖 Full Documentation

- **[TESTING.md](./TESTING.md)** - Comprehensive testing guide
- **[CI-CD-SETUP.md](./CI-CD-SETUP.md)** - Complete setup documentation

---

## 🆘 Troubleshooting

### Tests failing in CI but passing locally?
```bash
rm -rf node_modules package-lock.json
npm install
npm test
```

### Pre-commit hooks not running?
```bash
npx husky install
```

### Lint errors?
```bash
npm run lint:fix
npm run format
```

---

## ✨ What's Automated

| Task | Before | After |
|------|--------|-------|
| Running tests | Manual | **Automatic on PR** |
| Code formatting | Manual | **Automatic on commit** |
| Type checking | Manual | **Automatic on commit** |
| Deployment | Manual | **Automatic on merge** |
| Coverage reporting | Manual | **Automatic on PR** |
| Build verification | Manual | **Automatic on PR** |

---

**Everything is automated, Messiah #5 style!** 🚀

**Questions?** Check the full guides or run `npm run verify:ci`
