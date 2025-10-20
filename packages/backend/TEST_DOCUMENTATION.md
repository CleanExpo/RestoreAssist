# RestoreAssist Backend Test Documentation

## Overview

RestoreAssist uses a comprehensive testing strategy with three levels of test coverage:

1. **Unit Tests** (Jest) - Test individual functions and services in isolation
2. **Integration Tests** (Jest + Supertest) - Test component interactions and API endpoints
3. **E2E Tests** (Playwright) - Test complete user flows and API contracts

## Quick Start

```bash
# Install dependencies (if not already installed)
npm install

# Run all unit and integration tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI (interactive mode)
npm run test:e2e:ui

# Run all tests (unit + integration + E2E)
npm run test:all
```

## Test Directory Structure

```
tests/
├── setup.ts                    # Global test setup and mocks
├── unit/                       # Unit tests
│   ├── subscriptionService.test.ts
│   └── ...
├── integration/                # Integration tests
│   ├── stripeWebhooks.test.ts
│   └── ...
├── e2e/                        # E2E tests (Playwright)
│   ├── api.spec.ts
│   └── ...
└── fixtures/                   # Test data and fixtures
    └── ...
```

## Test Configuration

### Jest Configuration (`jest.config.js`)

- **Test Environment**: Node.js
- **TypeScript Support**: ts-jest preset
- **Test Match Pattern**: `**/*.test.ts`, `**/*.spec.ts`
- **Setup File**: `tests/setup.ts` (runs before all tests)
- **Timeout**: 10 seconds per test
- **Coverage**: Collects from `src/**/*.{js,ts}` (excludes generated files)

### Playwright Configuration (`playwright.config.ts`)

- **Base URL**: `http://localhost:3001` (configurable via `BASE_URL` env var)
- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Parallel Execution**: Fully parallel tests
- **Retries**: 2 retries on CI, 0 locally
- **Web Server**: Automatically starts dev server before tests
- **Artifacts**: Screenshots on failure, video on retry

## Writing Tests

### Unit Tests

Unit tests should test individual functions in isolation with mocked dependencies.

**Example: Testing a service function**

```typescript
import { describe, it, expect, jest } from '@jest/globals';
import { createSubscription } from '../../src/services/subscriptionService';

// Mock dependencies
jest.mock('../../src/db/connection');

describe('createSubscription', () => {
  it('should create a free trial subscription', async () => {
    const subscription = await createSubscription({
      userId: 'user-123',
      planType: 'freeTrial',
    });

    expect(subscription).toMatchObject({
      user_id: 'user-123',
      plan_type: 'freeTrial',
      status: 'active',
      reports_limit: 3,
    });
  });

  it('should throw error with invalid plan type', async () => {
    await expect(
      createSubscription({
        userId: 'user-123',
        planType: 'invalid' as any,
      })
    ).rejects.toThrow();
  });
});
```

### Integration Tests

Integration tests should test how multiple components work together, often using supertest for HTTP requests.

**Example: Testing API endpoints with Stripe integration**

```typescript
import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import stripeRoutes from '../../src/routes/stripeRoutes';

describe('Stripe Webhooks Integration', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.raw({ type: 'application/json' }));
    app.use('/api/stripe', stripeRoutes);
  });

  it('should handle checkout.session.completed event', async () => {
    const mockEvent = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123' } },
    };

    const response = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'test_signature')
      .send(JSON.stringify(mockEvent));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });
});
```

### E2E Tests

E2E tests should test complete user flows and API contracts using Playwright.

**Example: Testing authentication flow**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('POST /api/auth/login with valid credentials', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: 'demo@restoreassist.com',
        password: 'demo123',
      },
    });

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('token');
      expect(data).toHaveProperty('user');
    }
  });

  test('GET /api/reports should require authentication', async ({ request }) => {
    const response = await request.get('/api/reports');
    expect(response.status()).toBe(401);
  });
});
```

## Test Mocking

### Global Mocks (`tests/setup.ts`)

The following services are automatically mocked for all tests:

- **Sentry** - Error tracking disabled in tests
- **Email Service** - Prevents sending real emails
- **Console** - Suppresses log/debug/info (keeps error/warn)

### Database Mocking

Tests use in-memory storage by default:

```typescript
process.env.USE_POSTGRES = 'false'; // Set in tests/setup.ts
```

To test with PostgreSQL:

```typescript
beforeEach(() => {
  process.env.USE_POSTGRES = 'true';
  const { db } = require('../../src/db/connection');
  db.oneOrNone.mockResolvedValue({ /* mock data */ });
});
```

### Stripe Mocking

Stripe is mocked in integration tests:

```typescript
jest.mock('stripe');
mockStripe.webhooks = {
  constructEvent: jest.fn((payload) => JSON.parse(payload.toString())),
};
```

## Coverage Requirements

### Minimum Coverage Targets

- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Lines**: 80%

### Viewing Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report in browser
# Located at: coverage/lcov-report/index.html
```

### Critical Paths Requiring 100% Coverage

- Authentication and authorization logic
- Payment processing (Stripe webhooks)
- Subscription lifecycle management
- Report generation and storage
- Email notifications

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Pull requests to `main` or `Drop-In-Claude-Orchestrator`
- Pushes to protected branches
- Manual workflow dispatch

**Workflow configuration** (`.github/workflows/test.yml`):

```yaml
name: Test Suite

on:
  push:
    branches: [main, Drop-In-Claude-Orchestrator]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: packages/backend

      - name: Run unit tests
        run: npm test
        working-directory: packages/backend

      - name: Run E2E tests
        run: npm run test:e2e
        working-directory: packages/backend

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          directory: packages/backend/coverage
```

## Environment Variables for Testing

```bash
# Required for tests
NODE_ENV=test
JWT_SECRET=test-jwt-secret
JWT_REFRESH_SECRET=test-refresh-secret
USE_POSTGRES=false  # Use in-memory storage

# Optional (for integration tests)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
SENDGRID_API_KEY=SG.test_...
```

## Common Test Patterns

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  const result = await someAsyncFunction();
  expect(result).toBe(expectedValue);
});
```

### Testing Error Handling

```typescript
it('should throw appropriate error', async () => {
  await expect(
    functionThatShouldThrow()
  ).rejects.toThrow('Expected error message');
});
```

### Testing with Authentication

```typescript
test.describe('Authenticated Endpoints', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    const loginResponse = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password' },
    });
    const data = await loginResponse.json();
    authToken = data.token;
  });

  test('should access protected route', async ({ request }) => {
    const response = await request.get('/api/protected', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.ok()).toBeTruthy();
  });
});
```

### Testing Database Operations

```typescript
describe('Database Operations', () => {
  beforeEach(() => {
    process.env.USE_POSTGRES = 'true';
    const { db } = require('../../src/db/connection');

    // Mock database responses
    db.oneOrNone.mockResolvedValue({ id: '123' });
    db.many.mockResolvedValue([{ id: '123' }, { id: '456' }]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should query database correctly', async () => {
    const result = await someDbFunction();
    expect(result).toBeDefined();
  });
});
```

## Troubleshooting

### Tests Timing Out

If tests timeout:
1. Increase timeout in jest.config.js: `testTimeout: 20000`
2. Or per-test: `jest.setTimeout(20000);`
3. Check for unresolved promises or missing `await`

### Mock Not Working

If mocks aren't applying:
1. Ensure mock is defined before importing the module
2. Use `jest.mock()` at the top of the file
3. Clear mocks between tests: `jest.clearAllMocks()`

### Playwright Tests Failing

Common issues:
1. **Server not starting**: Check `webServer` config in playwright.config.ts
2. **Port conflicts**: Ensure port 3001 is available
3. **Selector issues**: Use `page.locator()` with data-testid attributes
4. **Timing issues**: Use `waitForSelector()` or `waitForResponse()`

### Database Connection Errors

If seeing database connection errors:
1. Verify `USE_POSTGRES=false` in test environment
2. Check that database mocks are properly configured
3. Ensure `tests/setup.ts` is loading correctly

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` to reset state
- Don't rely on test execution order

### 2. Descriptive Test Names
```typescript
// Good
it('should create subscription with unlimited reports for monthly plan', () => {})

// Bad
it('creates subscription', () => {})
```

### 3. Arrange-Act-Assert Pattern
```typescript
it('should update user status', async () => {
  // Arrange
  const userId = 'user-123';
  const newStatus = 'active';

  // Act
  const result = await updateUserStatus(userId, newStatus);

  // Assert
  expect(result.status).toBe('active');
});
```

### 4. Mock External Dependencies
- Always mock external API calls
- Mock database connections
- Mock email services
- Mock payment processors

### 5. Test Edge Cases
- Empty inputs
- Invalid inputs
- Boundary conditions
- Error conditions
- Race conditions

### 6. Keep Tests Fast
- Use mocks instead of real services
- Avoid unnecessary delays
- Run tests in parallel when possible
- Use test.skip() for slow tests during development

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- [Testing Best Practices](https://testingjavascript.com/)

## Maintenance

### Adding New Tests

When adding new features:
1. Write unit tests for new functions
2. Add integration tests for new endpoints
3. Update E2E tests if user flows change
4. Ensure coverage remains above 80%

### Updating Tests

When modifying existing code:
1. Update affected unit tests
2. Check integration tests still pass
3. Verify E2E tests still work
4. Update test documentation if patterns change

### Test Review Checklist

Before merging:
- [ ] All tests pass locally
- [ ] Coverage meets minimum requirements
- [ ] New features have tests
- [ ] Edge cases are tested
- [ ] Mocks are properly configured
- [ ] Test names are descriptive
- [ ] Tests follow best practices
- [ ] CI/CD pipeline passes
