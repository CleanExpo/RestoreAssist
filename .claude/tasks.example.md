# Task Runbooks

Sample tasks that demonstrate how to work with the orchestrator and agents.

## Task Format

Each task follows this structure:

```markdown
# Task: [Task Name]

## Description
What needs to be done and why

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Context
Any relevant background information

## Agent Assignment
Which agent(s) should handle this
```

---

## Task 1: Add User Authentication

### Description
Implement user authentication with email/password and OAuth (Google, GitHub) support.

### Acceptance Criteria
- [ ] Users can register with email/password
- [ ] Users can login with email/password
- [ ] Users can login with Google OAuth
- [ ] Users can login with GitHub OAuth
- [ ] Passwords are hashed and secure
- [ ] Session management implemented
- [ ] Logout functionality works
- [ ] Tests cover all authentication flows

### Context
The application currently has no authentication. We need a secure authentication system that supports both traditional email/password and OAuth providers. The system should be scalable and follow security best practices.

### Agent Assignment
**Workflow:** feature

1. @research - Find best practices for authentication in [your stack]
2. @coder - Implement authentication system
3. @tester - Create authentication tests
4. @integrator - Wire up auth to existing components
5. @docs - Document authentication flow

---

## Task 2: Optimize Database Queries

### Description
Several pages are loading slowly due to inefficient database queries. Need to identify and optimize problematic queries.

### Acceptance Criteria
- [ ] Slow queries identified and documented
- [ ] Indexes added where appropriate
- [ ] N+1 query problems resolved
- [ ] Page load times improved by >50%
- [ ] Query performance tests added

### Context
Users are complaining about slow page loads, especially on the dashboard and user list pages. Database monitoring shows some queries taking 3-5 seconds.

### Agent Assignment
**Workflow:** bugfix

1. @research - Investigate slow queries and optimization strategies
2. @coder - Implement optimizations (indexes, query refactoring)
3. @tester - Add performance tests
4. @integrator - Verify no breaking changes

---

## Task 3: Create API Documentation

### Description
Generate comprehensive API documentation for our REST API endpoints.

### Acceptance Criteria
- [ ] All endpoints documented
- [ ] Request/response examples included
- [ ] Authentication requirements specified
- [ ] Error codes documented
- [ ] Rate limits specified
- [ ] Documentation accessible to developers

### Context
We have a growing API but no formal documentation. This makes it difficult for frontend developers and third-party integrators to use our API effectively.

### Agent Assignment
1. @research - Review existing API and gather information
2. @docs - Generate API documentation
3. @coder - Add inline API documentation comments
4. @integrator - Set up documentation hosting

---

## Task 4: Add Dark Mode

### Description
Implement dark mode theme support throughout the application with user preference persistence.

### Acceptance Criteria
- [ ] Dark mode toggle in user interface
- [ ] All pages support dark mode
- [ ] User preference saved (localStorage or database)
- [ ] Respects system preference by default
- [ ] Smooth transitions between themes
- [ ] Accessibility maintained in dark mode

### Context
Many users have requested dark mode. This should be a system-wide theme that persists across sessions.

### Agent Assignment
**Workflow:** feature

1. @research - Find dark mode implementation patterns for [your stack]
2. @coder - Implement theme system and dark mode styles
3. @tester - Test theme switching and persistence
4. @integrator - Apply dark mode to all components
5. @docs - Document theme system usage

---

## Task 5: Fix Payment Processing Bug

### Description
Some payment transactions are failing silently without proper error messages to users.

### Acceptance Criteria
- [ ] Root cause of payment failures identified
- [ ] Payment error handling improved
- [ ] Clear error messages shown to users
- [ ] Failed payments logged for debugging
- [ ] Retry mechanism implemented where appropriate
- [ ] Tests prevent regression

### Context
Several users have reported that their payments fail but they don't receive any error message. This is causing frustration and lost revenue.

### Agent Assignment
**Workflow:** bugfix

1. @research - Investigate payment logs and error patterns
2. @stuck - Analyze if we're hitting known payment gateway issues
3. @coder - Implement fix and better error handling
4. @tester - Add payment error scenario tests
5. @integrator - Ensure error handling is consistent

---

## Task 6: Deploy to Production

### Description
Deploy version 2.0 to production environment with zero downtime.

### Acceptance Criteria
- [ ] All tests pass in staging
- [ ] Database migrations run successfully
- [ ] Deployment doesn't cause downtime
- [ ] Rollback plan documented
- [ ] Production health checks pass
- [ ] Monitoring alerts configured

### Context
Version 2.0 includes major new features and needs to be deployed carefully to production with no downtime.

### Agent Assignment
**Workflow:** deploy

1. @tester - Run full test suite
2. @deployer - Deploy to staging
3. @tester - Verify staging environment
4. @deployer - Deploy to production (blue-green)
5. @tester - Verify production health checks

---

## Task 7: Import User Data from CSV

### Description
Import 10,000 user records from legacy system CSV export into our database.

### Acceptance Criteria
- [ ] CSV file validated and cleaned
- [ ] Data mapping defined
- [ ] Import script created and tested
- [ ] Duplicate handling implemented
- [ ] Import results logged
- [ ] Failed records reported

### Context
We're migrating from a legacy system and need to import existing user data. The CSV file has some inconsistencies that need to be handled.

### Agent Assignment
1. @data - Validate and clean CSV data
2. @data - Create import script with validation
3. @data - Run import with logging
4. @data - Generate import report
5. @coder - Verify data integrity in database

---

## Task 8: Refactor Authentication Module

### Description
The authentication module has grown complex and needs refactoring for better maintainability.

### Acceptance Criteria
- [ ] Code is more modular and testable
- [ ] Duplicate code eliminated
- [ ] Clear separation of concerns
- [ ] All existing tests still pass
- [ ] New tests added for edge cases
- [ ] Documentation updated

### Context
The auth module has accumulated technical debt. Time to clean it up before adding new features.

### Agent Assignment
1. @coder - Refactor authentication code
2. @integrator - Update imports and ensure compatibility
3. @tester - Verify all tests pass
4. @docs - Update architecture documentation

---

## Task 9: Research AI Integration Options

### Description
Research and evaluate different options for integrating AI capabilities into our application.

### Acceptance Criteria
- [ ] 3-5 options identified and compared
- [ ] Pricing and limitations documented
- [ ] Integration complexity assessed
- [ ] Recommendation provided with rationale
- [ ] POC implementation plan outlined

### Context
We want to add AI-powered features but need to evaluate which provider/approach is best for our use case and budget.

### Agent Assignment
1. @research - Evaluate AI integration options (OpenAI, Anthropic, open-source, etc.)
2. @research - Document findings and provide recommendation
3. @coder - Create POC implementation plan (if approved)

---

## Custom Task Template

Use this template for your own tasks:

```markdown
# Task: [Your Task Name]

## Description
[What needs to be done and why]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

## Context
[Any relevant background information]

## Agent Assignment
[Which agents should handle this and in what order]

1. @[agent] - [What this agent should do]
2. @[agent] - [What this agent should do]
```

---

## Tips for Writing Tasks

### Good Task Descriptions
- **Be specific**: "Add search functionality to product page" not "improve search"
- **Include context**: Why is this needed? What problem does it solve?
- **Define success**: Clear acceptance criteria that can be verified
- **Right-size**: Not too big (split large tasks) or too small (combine trivial tasks)

### Agent Selection
- **Single-agent tasks**: Straightforward implementation, testing, or documentation
- **Multi-agent workflows**: Complex features requiring multiple specialties
- **Use workflows**: Leverage predefined workflows (feature, bugfix, deploy)

### Acceptance Criteria
- **Testable**: Can be objectively verified
- **Complete**: Covers all aspects of "done"
- **Clear**: No ambiguity about what needs to happen

### Context
- **Background**: What led to this task?
- **Constraints**: Time, budget, technical limitations
- **Dependencies**: What needs to be done first?
- **References**: Links to designs, specs, related issues
