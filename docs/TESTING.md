# RestoreAssist Testing Strategy

Complete testing infrastructure with unit tests, E2E tests, visual regression tests, performance audits, and backend tests.

## Overview

RestoreAssist uses a comprehensive multi-layered testing strategy:

| Layer | Tool | Purpose | Coverage |
|-------|------|---------|----------|
| **Unit** | Vitest | Component and function tests | 75%+ required |
| **E2E** | Playwright | User workflow testing | Critical paths |
| **Visual** | Percy | Visual regression detection | UI components |
| **Performance** | Lighthouse CI | Performance metrics | Core Web Vitals |
| **Backend** | Pytest | API and database tests | 75%+ required |
| **Integration** | Autonomous Agents | Full-stack validation | All systems |

## Quick Start

### Run All Tests

```bash
npm run test:all
```

### Run Specific Test Suite

```bash
# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e

# Visual regression tests
npm run test:visual

# Performance tests
npm run test:lighthouse

# Backend tests
npm run test:backend
```

### Watch Mode (Development)

```bash
npm run test:unit:watch
npm run test:backend:watch
npm run test:e2e:headed  # See browser interactions
```

## Frontend Testing (Vitest + Playwright)

### Unit Testing with Vitest

Tests individual functions, components, and utilities.

**Location**: `apps/web/tests/`

**File Structure**:
```
tests/
├── setup.ts                  # Test configuration
├── vitest.d.ts              # TypeScript definitions
├── components/              # Component tests
│   └── Button.test.tsx
├── lib/                     # Utility tests
│   └── utils.test.ts
└── e2e/                     # End-to-end tests
    ├── auth.spec.ts         # Auth workflows
    └── dashboard.spec.ts    # Dashboard features
```

**Run Unit Tests**:
```bash
npm run test:unit              # Run once
npm run test:unit:watch        # Watch mode
npm run test:unit:coverage     # With coverage report
```

**Example Test**:
```typescript
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/Button';

test('should render button', () => {
  render(<Button>Click me</Button>);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

### E2E Testing with Playwright

Tests complete user workflows across the application.

**Location**: `apps/web/tests/e2e/`

**Supported Browsers**:
- ✓ Chromium
- ✓ Firefox
- ✓ WebKit
- ✓ Mobile Chrome (Pixel 5)
- ✓ Mobile Safari (iPhone 12)

**Run E2E Tests**:
```bash
npm run test:e2e             # Headless mode
npm run test:e2e:headed      # See browser
npm run test:e2e:debug       # Debug mode with inspector
```

**Example Test**:
```typescript
import { test, expect } from '@playwright/test';

test('should login successfully', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'user@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
```

**Configuration**: `apps/web/playwright.config.ts`

### Visual Regression Testing

Percy automatically detects visual changes and prevents regressions.

**Location**: `apps/web/tests/visual/`

**Run Visual Tests**:
```bash
PERCY_TOKEN=<token> npm run test:visual
```

**Example Test**:
```typescript
import percySnapshot from '@percy/playwright';

test('homepage looks correct', async ({ page }) => {
  await page.goto('/');
  await percySnapshot(page, 'Homepage Hero Section');
});
```

**Configuration**: `.percy.yml`

### Performance Testing with Lighthouse CI

Automated performance, accessibility, and SEO audits.

**Run Lighthouse Tests**:
```bash
npm run test:lighthouse
```

**Metrics Checked**:
- ✓ Performance (target: 85+)
- ✓ Accessibility (target: 95+)
- ✓ Best Practices (target: 90+)
- ✓ SEO (target: 90+)

**Lighthouse Configuration**: `lighthouserc.js`

## Backend Testing (Pytest)

Tests FastAPI routes, database models, and business logic.

**Location**: `apps/backend/tests/`

**File Structure**:
```
tests/
├── conftest.py          # Pytest fixtures
├── test_startup.py      # Module import tests
├── test_api.py          # API endpoint tests
├── test_db.py           # Database model tests
└── test_agents.py       # Agent logic tests (future)
```

### Run Backend Tests

```bash
npm run test:backend              # Run all tests
npm run test:backend:watch        # Watch mode
cd apps/backend && uv run pytest  # Direct pytest
```

### Backend Test Examples

**API Endpoint Tests**:
```python
@pytest.mark.asyncio
async def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] in ["healthy", "degraded"]
```

**Database Model Tests**:
```python
def test_user_model_exists():
    assert User is not None
    assert User.__tablename__ == "User"
    mapper = inspect(User)
    columns = {c.key for c in mapper.columns}
    assert "email" in columns
```

**Backend Configuration**: `apps/backend/pyproject.toml`

## Integration with Autonomous Agents

The existing autonomous testing agents remain active and provide additional validation:

- **Frontend Agent**: Validates homepage, navigation, forms
- **API Agent**: Tests REST endpoints and response formats
- **Security Agent**: Checks for vulnerabilities
- **Database Agent**: Validates connection and migrations
- **Performance Agent**: Measures load times and metrics

**Run Autonomous Agents**:
```bash
node testing/orchestrator.js
```

## Test Coverage Requirements

### Frontend Coverage
- **Minimum**: 75% statements, branches, functions, lines
- **Target**: 85%+
- **View Report**: `npm run test:unit:coverage`

### Backend Coverage
- **Minimum**: 75%
- **Target**: 85%+
- **Command**: `npm run test:backend -- --cov`

## CI/CD Integration

Tests run automatically on:
- ✓ Pull requests
- ✓ Commits to main/develop
- ✓ Pre-commit hooks (lint + type check)

**.github/workflows**:
- `ci.yml`: Main test pipeline
- `deploy-vercel.yml`: Frontend deployment
- `deploy-digitalocean.yml`: Backend deployment

**Pre-commit Configuration**:
```bash
# Automatically run type checking and unit tests
# on commit (using Husky + lint-staged)
npm run prepare
```

## Debugging Tests

### Frontend Debugging

```bash
# Visual debugging with Playwright Inspector
npm run test:e2e:debug

# Browser DevTools
npm run test:e2e:headed

# VS Code Debugger
# Add to .vscode/launch.json and use Run > Start Debugging
```

### Backend Debugging

```bash
# pytest with verbose output
cd apps/backend && uv run pytest -vv tests/

# Show print statements
cd apps/backend && uv run pytest -s tests/

# Stop on first failure
cd apps/backend && uv run pytest -x tests/

# Run specific test
cd apps/backend && uv run pytest tests/test_api.py::test_health_endpoint
```

## Best Practices

### Unit Tests

✅ **DO**:
- Test user interactions, not implementation
- Use semantic queries (getByRole, getByLabelText)
- Test behavior, not internal state
- Keep tests focused and isolated
- Mock external dependencies

❌ **DON'T**:
- Test library internals
- Mock DOM or React
- Snapshot test visual elements
- Test implementation details

### E2E Tests

✅ **DO**:
- Test critical user paths
- Use realistic data
- Test across browsers
- Clean up data after tests
- Wait for navigation and network

❌ **DON'T**:
- Test every detail (use unit tests)
- Hardcode wait times
- Test 3rd party integrations
- Make tests interdependent
- Skip accessibility checks

### Backend Tests

✅ **DO**:
- Test API contracts
- Mock external services
- Test error cases
- Validate database constraints
- Use fixtures for setup

❌ **DON'T**:
- Test database directly (use ORM)
- Make tests dependent on each other
- Use real external APIs
- Skip edge cases
- Leave test data in database

## Performance Baselines

Target metrics for Core Web Vitals:

| Metric | Target | Status |
|--------|--------|--------|
| LCP | < 2.5s | Required |
| FID | < 100ms | Required |
| CLS | < 0.1 | Required |
| TTL | < 3.8s | Target |
| FCP | < 1.8s | Target |

## Troubleshooting

### Tests Timeout

```bash
# Increase timeout for slow tests
npm run test:e2e -- --timeout=30000
```

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Playwright Installation Issues

```bash
# Reinstall browsers
npx playwright install
```

### Pytest Import Errors

```bash
# Reinstall Python dependencies
cd apps/backend
uv sync
```

### Percy Snapshots Not Updating

```bash
# Reset Percy project (requires token)
PERCY_TOKEN=<token> percy config:create
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Percy Documentation](https://percy.io/)
- [Lighthouse CI Docs](https://github.com/GoogleChrome/lighthouse-ci)
- [Pytest Documentation](https://pytest.org/)

## Contributing

When adding new features:

1. Write tests first (TDD)
2. Ensure all tests pass: `npm run test:all`
3. Check coverage: `npm run test:unit:coverage`
4. Run pre-commit checks: `npm run prepare`
5. Create PR with test results

## Test Metrics Dashboard

Generate test metrics report:

```bash
# Frontend coverage
npm run test:unit:coverage

# Backend coverage
cd apps/backend && uv run pytest --cov --html=coverage

# Performance report
npm run test:lighthouse
```

Reports are generated in:
- Frontend: `apps/web/coverage/`
- Backend: `apps/backend/coverage/`
- Lighthouse: `.lighthouseci/`
