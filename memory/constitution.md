# RestoreAssist Constitution

## Core Principles

### I. Australian English Throughout (NON-NEGOTIABLE)
All code, comments, documentation, UI text, and specifications must use Australian English spelling and terminology:
- **Spelling**: "organise" not "organize", "colour" not "color", "centre" not "center"
- **Terminology**: "cancelled" not "canceled", "behaviour" not "behavior"
- **Exception**: External APIs and libraries retain their original spelling (e.g., Stripe uses American English)
- **Enforcement**: Pre-commit hooks must validate spelling; PR reviews must verify compliance

### II. Test-Driven Development (NON-NEGOTIABLE)
Testing is mandatory with strict coverage thresholds:
- **Coverage Threshold**: Minimum 80% code coverage across statements, branches, functions, and lines
- **Test Types**: Unit tests (Jest), Integration tests (Jest + Supertest), E2E tests (Playwright across 5 browsers)
- **Red-Green-Refactor**: Write failing test → Implement minimum code → Refactor for quality
- **Test Location**: Unit tests in `tests/unit/`, Integration in `tests/integration/`, E2E in `tests/e2e/`
- **No Skipped Tests**: Tests marked `.skip()` must have GitHub issue tracking resolution

### III. TypeScript Strict Mode (NON-NEGOTIABLE)
Type safety is paramount:
- **Strict Mode**: `tsconfig.json` must enable all strict checks (`strict: true`, `noImplicitAny: true`)
- **Generic Typing**: Mock functions must have explicit generic types (e.g., `jest.fn<(args) => Promise<Type>>()`)
- **Runtime Validation**: Critical inputs require runtime validation beyond TypeScript types
- **No Type Assertions**: Avoid `as any` or type assertions except in mocks/tests with justification
- **Null Safety**: Use optional chaining (`?.`) and nullish coalescing (`??`) operators

### IV. Comprehensive Error Handling
Errors must be handled gracefully with user-friendly messages:
- **Try-Catch Blocks**: All async operations and external calls wrapped in try-catch
- **Graceful Degradation**: Services continue operating in degraded mode rather than failing (e.g., health endpoints return "degraded" status)
- **Error Logging**: Use structured logging with context (user ID, request ID, operation)
- **User-Facing Errors**: Provide actionable error messages, never expose stack traces to users
- **HTTP Status Codes**: Use correct HTTP status codes (401 for unauthorized, 400 for validation, 500 for server errors)

### V. Stripe Payment Integration Standards
Payment processing requires extra care:
- **Webhook Security**: Verify Stripe webhook signatures using `stripe.webhooks.constructEvent()`
- **Idempotency**: Handle duplicate webhook events gracefully (Stripe may retry)
- **Test Mode**: Use Stripe test keys in development/CI environments
- **Error Recovery**: Log payment failures, send notifications, provide retry mechanisms
- **Subscription Lifecycle**: Track full lifecycle (created, active, past_due, cancelled, expired)
- **Audit Trail**: Record all subscription changes in `subscription_history` table

### VI. Report Generation Quality Standards
Insurance restoration reports are mission-critical documents:
- **Data Validation**: Validate all inputs before report generation (address, damage type, cost estimates)
- **Professional Formatting**: Reports must be print-ready with consistent styling
- **Audit Information**: Include generation timestamp, user ID, system version in report metadata
- **Cost Calculations**: Validate cost calculations against business rules (material + labour + overhead)
- **Storage**: Store reports securely with access controls; retain for regulatory compliance
- **Version Tracking**: Track report versions if modified after generation

### VII. Playwright E2E Testing Standards
End-to-end tests validate user journeys across browsers:
- **Browser Coverage**: Test across Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Test Isolation**: Each test must be independent; use `test.beforeEach` for clean state
- **Selectors**: Use data-testid attributes for stable selectors, avoid brittle CSS selectors
- **Authentication**: Set up authenticated contexts using `test.beforeAll` with reusable credentials
- **Assertions**: Use Playwright's auto-waiting assertions (`expect(page).toHaveText()`)
- **Parallel Execution**: Tests must be parallelizable; avoid shared state

## Development Standards

### Code Quality
- **Linting**: ESLint with TypeScript rules enforced; zero warnings in production code
- **Formatting**: Prettier with consistent configuration; 2-space indentation, single quotes
- **Comments**: Document complex logic, business rules, and non-obvious decisions
- **Function Size**: Functions should be < 50 lines; extract complex logic into helpers
- **DRY Principle**: Avoid code duplication; extract reusable utilities

### Security Requirements
- **Authentication**: JWT tokens with 15-minute expiry; refresh tokens for session management
- **Authorization**: Role-based access control (admin, user); verify permissions on every request
- **Input Validation**: Validate and sanitise all user inputs to prevent injection attacks
- **Environment Variables**: Never commit secrets; use `.env` files locally, secure vaults in production
- **CORS**: Restrict CORS to known frontend origins; no wildcard (`*`) in production
- **Rate Limiting**: Implement rate limiting on public endpoints to prevent abuse

### Performance Standards
- **Response Time**: API endpoints must respond within 200ms (p95); reports within 2 seconds
- **Database Queries**: Use connection pooling; avoid N+1 queries; add indexes for frequent queries
- **Caching**: Cache expensive operations (report generation, aggregated stats) with TTL
- **Bundle Size**: Frontend bundles < 250KB gzipped; use code splitting and lazy loading
- **Memory Management**: Monitor heap usage; clean up event listeners and intervals

### API Design
- **RESTful Conventions**: Use standard HTTP methods (GET, POST, PUT, DELETE) and status codes
- **Versioning**: API routes versioned (`/api/v1/`) to allow breaking changes
- **Response Format**: Consistent JSON structure: `{ data, error, metadata }`
- **Pagination**: List endpoints must support pagination (`page`, `limit` query params)
- **Filtering**: Support filtering and sorting on list endpoints (`sortBy`, `order` params)

## Testing Standards

### Unit Testing
- **Scope**: Test individual functions and modules in isolation
- **Mocking**: Mock external dependencies (database, Stripe, email service)
- **Coverage**: Each function must have tests for success cases, error cases, edge cases
- **Naming**: Test names describe behaviour: `should [expected behaviour] when [condition]`
- **Assertions**: Use specific matchers (`toEqual`, `toHaveProperty`) over generic `toBe`

### Integration Testing
- **Scope**: Test interactions between modules (routes + services + database)
- **Module-Level Mocking**: Mock at module boundaries (jest.mock before imports)
- **Request Testing**: Use Supertest for HTTP request/response testing
- **Database State**: Reset database state between tests using `beforeEach`
- **Error Paths**: Test error handling (network failures, invalid responses)

### E2E Testing
- **Scope**: Test complete user journeys from browser perspective
- **Real Services**: Use real frontend and backend (possibly mocked external APIs)
- **User Flows**: Test critical paths (authentication, report generation, subscription checkout)
- **Mobile Testing**: Verify responsive design on mobile viewports
- **Accessibility**: Test keyboard navigation and screen reader compatibility

## Development Workflow

### Git Workflow
- **Branching**: Feature branches from `main`; naming convention: `feature/`, `fix/`, `refactor/`
- **Commits**: Descriptive commit messages following Conventional Commits format
- **Pull Requests**: Require PR review before merge; CI must pass (tests, linting, build)
- **Commit Frequency**: Commit frequently with logical units of work; squash before merge

### Code Review Requirements
- **Reviewer Count**: Minimum 1 reviewer approval required
- **Review Checklist**: Verify tests pass, code follows standards, no security issues
- **Review Time**: Reviews should be completed within 24 hours
- **Feedback**: Provide constructive, actionable feedback; suggest improvements
- **Constitution Compliance**: All PRs must verify compliance with this constitution

### Continuous Integration
- **CI Pipeline**: Run on every PR and commit to main
- **CI Steps**: Lint → Type check → Unit tests → Integration tests → E2E tests → Build
- **Failure Handling**: PRs blocked if CI fails; must fix before merge
- **Test Timeout**: Tests timeout after 10 minutes; optimise slow tests
- **Parallel Execution**: Run test suites in parallel for faster feedback

### Deployment Process
- **Staging First**: Deploy to staging environment before production
- **Smoke Tests**: Run smoke tests on staging after deployment
- **Database Migrations**: Run migrations before code deployment
- **Rollback Plan**: Document rollback procedure for each deployment
- **Monitoring**: Monitor error rates and performance after deployment

## Orchestrator Integration

### Spec Kit Integration
- **Specification Phase**: Use Spec Kit for feature specifications before implementation
- **Quality Checklists**: Generate checklists with `/speckit.checklist` for validation
- **Implementation Plans**: Create plans with `/speckit.plan` before coding
- **Task Breakdown**: Use `/speckit.tasks` to break features into manageable work

### Agent Workflow
- **Research**: `@research` gathers context and best practices via Jina/Browser MCP
- **Verification**: `@master-fullstack` verifies requirements complete, nothing missing
- **Implementation**: `@coder` implements following TDD and quality standards
- **Testing**: `@tester` validates with E2E tests (PHASE GATE - must pass)
- **Integration**: `@integrator` finalizes, resolves imports, ensures build passes
- **Documentation**: `@master-docs` updates README, generates ADRs, maintains CHANGELOG

### Phase Gates
- **Tester → Integrator Gate**: Tests must pass 100% before integration proceeds
- **Failure Handling**: Return to `@coder` for fixes or escalate to `@stuck` for analysis
- **Stuck Escalation**: If blocked, `@stuck` provides A/B/C options with recommendations

## Governance

### Constitution Authority
- This constitution supersedes all other development practices and guidelines
- All code reviews, PRs, and agent workflows must verify compliance
- Amendments require documentation, team approval, and migration plan

### Enforcement
- **Pre-commit Hooks**: Validate Australian English spelling, linting, formatting
- **CI Checks**: Verify test coverage, TypeScript strict mode, build success
- **Code Review**: Reviewers verify constitution compliance as part of approval
- **Agent Instructions**: Orchestrator agents must follow constitution principles

### Amendment Process
1. Propose amendment with rationale and impact analysis
2. Team review and discussion (minimum 3 days)
3. Approval requires consensus (no blocking objections)
4. Document amendment with version bump
5. Update agent instructions and CI pipeline
6. Communicate changes to all contributors

### Version History
- **Version**: 1.0.0
- **Ratified**: 2025-10-20
- **Last Amended**: 2025-10-20
- **Authors**: RestoreAssist Development Team with Claude Code AI assistance

## Quick Reference

### Commands
- **Create Constitution**: `/speckit.constitution`
- **Specify Feature**: `/speckit.specify [description]`
- **Plan Implementation**: `/speckit.plan [spec-file]`
- **Break into Tasks**: `/speckit.tasks [plan-file]`
- **Implement**: `/speckit.implement [task-file]`

### Test Commands
```bash
# Unit tests
cd packages/backend && npm test

# Integration tests
cd packages/backend && npm run test:integration

# E2E tests
cd packages/backend && npx playwright test

# Coverage report
cd packages/backend && npm run test:coverage
```

### Quality Gates
- ✅ 80%+ test coverage
- ✅ TypeScript strict mode (no errors)
- ✅ Zero linting warnings
- ✅ 100% E2E tests passing (55/55)
- ✅ Australian English spelling verified
- ✅ Build succeeds without errors

---

**This constitution is living documentation. It evolves as RestoreAssist grows, but core principles (Australian English, TDD, TypeScript Strict, Error Handling) remain non-negotiable.**
