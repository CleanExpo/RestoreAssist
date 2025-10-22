# Testing Guide

This document provides comprehensive guidance for testing RestoreAssist platform.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Architecture](#test-architecture)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [CI/CD Integration](#cicd-integration)
- [Pre-Commit Hooks](#pre-commit-hooks)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Install Dependencies

```bash
# Install all dependencies
npm install

# Install Playwright browsers (for E2E tests)
cd packages/frontend
npx playwright install --with-deps chromium
```

### Run All Tests

```bash
# Run all tests (unit + integration + E2E)
npm test

# Run tests in specific package
npm test --workspace=packages/backend
npm test --workspace=packages/frontend
```

### Run Specific Test Suites

```bash
# Backend unit tests
cd packages/backend
npm test

# Backend unit tests with coverage
npm run test:coverage

# Backend E2E tests
npm run test:e2e

# Frontend unit tests
cd packages/frontend
npm test

# Frontend E2E tests
npm run test:e2e

# Frontend E2E tests with UI
npm run test:e2e:ui
```

---

## Test Architecture

### Test Types

| Test Type | Location | Framework | Purpose |
|-----------|----------|-----------|---------|
| **Backend Unit** | `packages/backend/tests/unit/` | Jest | Test individual functions and services |
| **Backend Integration** | `packages/backend/tests/integration/` | Jest + Supertest | Test API endpoints and database interactions |
| **Backend E2E** | `packages/backend/tests/e2e/` | Playwright | Test full API workflows |
| **Frontend Unit** | `packages/frontend/tests/unit/` | Vitest | Test React components and utilities |
| **Frontend E2E** | `packages/frontend/tests/e2e-claude/` | Playwright | Test user flows and UI interactions |

### Test Coverage Goals

| Package | Current | Target |
|---------|---------|--------|
| **Backend** | 85% (29/34) | 90% |
| **Frontend** | 69% (38/55) | 85% |
| **Overall** | 75% (67/89) | 90% |

### Test Pyramid

```
        /\
       /  \        E2E Tests (10-15%)
      /____\       - Critical user flows
     /      \      - Cross-system integration
    /        \
   /  Integration\ (25-30%)
  /    Tests     \ - API endpoints
 /________________\ - Database interactions
/                  \
/   Unit Tests     \ (55-65%)
/   (Fast & Many)  \ - Business logic
/____________________\ - Utility functions
```

---

## Running Tests

### Backend Tests

#### Unit Tests

```bash
cd packages/backend

# Run all unit tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Run specific test file
npm test -- subscriptionService.test.ts

# Run specific test suite
npm test -- --testNamePattern="createSubscription"
```

#### Integration Tests

```bash
# Run integration tests
npm test -- tests/integration

# Test specific endpoint
npm test -- authConfig.test.ts
```

#### E2E Tests

```bash
# Run E2E tests
npm run test:e2e

# With UI
npm run test:e2e:ui

# Specific test file
npm run test:e2e -- api.spec.ts
```

### Frontend Tests

#### Unit Tests

```bash
cd packages/frontend

# Run all unit tests
npm test

# Watch mode
npm test -- --watch

# With coverage
npm run test:coverage

# Run specific file
npm test -- oauthErrorMapper.test.ts
```

#### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# With UI (interactive mode)
npm run test:e2e:ui

# Headed mode (see browser)
npm run test:e2e:headed

# Specific test file
npm run test:e2e -- navigation.spec.ts

# View test report
npm run test:e2e:report
```

### Performance Testing

```bash
# Run performance benchmarks
cd packages/backend
npm run test:perf

# Load testing (coming soon)
npm run test:load
```

---

## Writing Tests

### Backend Unit Test Template

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { yourFunction } from '../../src/services/yourService';

// Mock dependencies
jest.mock('../../src/db/connection', () => ({
  db: {
    one: jest.fn<() => Promise<any>>(),
    many: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  },
}));

describe('YourService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('yourFunction', () => {
    it('should handle success case', async () => {
      // Arrange
      const input = { /* test data */ };
      const expected = { /* expected result */ };

      // Act
      const result = await yourFunction(input);

      // Assert
      expect(result).toEqual(expected);
    });

    it('should handle error case', async () => {
      // Arrange
      const invalidInput = { /* invalid data */ };

      // Act & Assert
      await expect(yourFunction(invalidInput)).rejects.toThrow('Expected error');
    });
  });
});
```

### Backend Integration Test Template

```typescript
import request from 'supertest';
import app from '../../src/app';

describe('GET /api/your-endpoint', () => {
  it('should return 200 with valid data', async () => {
    const response = await request(app)
      .get('/api/your-endpoint')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toBeDefined();
  });

  it('should return 401 without auth', async () => {
    await request(app)
      .get('/api/your-endpoint')
      .expect(401);
  });
});
```

### Frontend E2E Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to page
    await page.goto('/your-page');
  });

  test('should perform user action successfully', async ({ page }) => {
    // Arrange
    const button = page.getByRole('button', { name: /submit/i });

    // Act
    await button.click();

    // Assert
    await expect(page).toHaveURL('/success');
    await expect(page.getByText(/success message/i)).toBeVisible();
  });

  test('should handle error state', async ({ page }) => {
    // Test error scenarios
    const input = page.getByRole('textbox', { name: /email/i });
    await input.fill('invalid-email');

    const submit = page.getByRole('button', { name: /submit/i });
    await submit.click();

    await expect(page.getByText(/invalid email/i)).toBeVisible();
  });
});
```

### Frontend Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import YourComponent from './YourComponent';

describe('YourComponent', () => {
  it('should render correctly', () => {
    // Arrange & Act
    render(<YourComponent title="Test Title" />);

    // Assert
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    // Arrange
    const { user } = render(<YourComponent />);
    const button = screen.getByRole('button');

    // Act
    await user.click(button);

    // Assert
    expect(screen.getByText(/clicked/i)).toBeInTheDocument();
  });
});
```

---

## CI/CD Integration

### GitHub Actions Workflows

#### Test Workflow (`test.yml`)

Runs on every PR and push to main/develop:

- **Backend Tests**: Unit, integration, type checking
- **Frontend Tests**: Unit, type checking
- **E2E Tests**: Full user flow validation (parallelized 2 shards)
- **Build Verification**: Ensures production builds work
- **Security Audit**: npm audit for vulnerabilities

**Estimated Runtime**: 5-8 minutes

#### Deploy Workflow (`deploy.yml`)

Runs on push to main with test gates:

1. **Pre-Deployment Tests** (Gate 1): Full test suite
2. **Build Artifacts** (Gate 2): Production builds
3. **Deploy Backend**: Vercel deployment
4. **Deploy Frontend**: Vercel deployment
5. **Post-Deployment Smoke Tests**: Health checks
6. **Deployment Summary**: Final status report

**Estimated Runtime**: 10-15 minutes

### Test Parallelization

E2E tests run in parallel using shards:

```yaml
strategy:
  matrix:
    shard: [1/2, 2/2]
```

This splits tests across 2 runners, reducing execution time by ~50%.

### Caching Strategy

Dependencies are cached to speed up CI:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20.x
    cache: 'npm'
```

---

## Pre-Commit Hooks

### Husky Configuration

Pre-commit hooks run automatically before each commit:

#### What Gets Checked

1. **Lint-Staged**: Format and lint changed files
2. **Type Check**: TypeScript validation for backend and frontend
3. **Commit Message**: Conventional commit format validation

#### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test changes
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes

**Examples:**

```bash
feat(auth): add Google OAuth support
fix(api): resolve subscription status update issue
test(e2e): add checkout flow validation
docs: update testing guide with new examples
```

#### Bypass Hooks (Emergency Only)

```bash
# Skip pre-commit hooks (use sparingly!)
git commit --no-verify -m "emergency fix"
```

---

## Best Practices

### Test Organization

1. **Arrange-Act-Assert** pattern for clarity
2. **One assertion per test** when possible
3. **Descriptive test names** that explain what's being tested
4. **Group related tests** using `describe()` blocks

### Mocking Strategy

1. **Mock external dependencies** (APIs, databases)
2. **Use in-memory storage** for unit tests
3. **Minimize mocking** in integration tests
4. **No mocking** in E2E tests (test real flows)

### Test Data Management

1. **Use factories** for creating test data
2. **Clean up after tests** to avoid side effects
3. **Isolate tests** - each should run independently
4. **Use realistic data** that matches production

### Performance

1. **Keep unit tests fast** (< 100ms each)
2. **Parallelize E2E tests** when possible
3. **Skip long-running tests** in watch mode
4. **Use test sharding** for large suites

### Coverage Goals

- **Statements**: ≥ 80%
- **Branches**: ≥ 75%
- **Functions**: ≥ 80%
- **Lines**: ≥ 80%

**Critical paths should have 100% coverage:**
- Authentication flows
- Payment processing
- Data validation
- Security checks

---

## Troubleshooting

### Common Issues

#### Playwright Browser Install Issues

```bash
# Windows
npx playwright install --with-deps chromium

# Linux (CI)
apt-get update && apt-get install -y \
  libnss3 libxss1 libasound2 libatk-bridge2.0-0 libdrm2 libgbm1
```

#### Tests Timing Out

```typescript
// Increase timeout for specific test
test('slow operation', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ...
});
```

#### Flaky E2E Tests

```typescript
// Use explicit waits
await page.waitForSelector('.element', { state: 'visible' });

// Wait for network to be idle
await page.waitForLoadState('networkidle');

// Add retry logic
await expect(async () => {
  const text = await page.textContent('.element');
  expect(text).toBe('Expected');
}).toPass({ timeout: 5000 });
```

#### Mock Not Working

```typescript
// Ensure mocks are cleared between tests
beforeEach(() => {
  jest.clearAllMocks();
});

// Reset module registry
beforeEach(() => {
  jest.resetModules();
});
```

#### Coverage Not Generated

```bash
# Ensure coverage directory exists
mkdir -p coverage

# Run with explicit coverage flag
npm test -- --coverage --coverageDirectory=./coverage
```

### Debug Mode

#### Jest Debug

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# VSCode launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

#### Playwright Debug

```bash
# Run with UI mode
npm run test:e2e:ui

# Debug specific test
npx playwright test --debug navigation.spec.ts

# View trace
npx playwright show-trace trace.zip
```

---

## Resources

### Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Vitest Documentation](https://vitest.dev/guide/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

### Internal Links

- [Project README](./README.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [API Documentation](./packages/backend/README.md)

### Test Utilities

Located in:
- `packages/backend/tests/utils/` - Backend test helpers
- `packages/frontend/tests/utils/` - Frontend test helpers
- `packages/frontend/tests/e2e-claude/fixtures/` - E2E test fixtures

---

## Metrics & Monitoring

### Current Test Statistics

```
Backend Tests:    29/34 (85.3%)
Frontend Tests:   38/55 (69.1%)
E2E Tests:        Running
Total Coverage:   75%
```

### CI/CD Performance

- Average test execution time: **5-8 minutes**
- Target execution time: **< 5 minutes**
- Parallel E2E execution: **2 shards**
- Cache hit rate: **~80%**

### Quality Gates

All PRs must pass:
- ✅ All unit tests
- ✅ All integration tests
- ✅ All E2E tests
- ✅ Type checking
- ✅ Build verification
- ✅ No high/critical security vulnerabilities

---

## Contributing

When adding new features:

1. ✅ Write tests first (TDD)
2. ✅ Ensure coverage meets targets
3. ✅ Update test documentation
4. ✅ Run full test suite before PR
5. ✅ Add E2E tests for user-facing features

---

**Questions?** Open an issue or contact the team.

**Last Updated:** 2025-10-22
