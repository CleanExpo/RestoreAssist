# RestoreAssist Project Constitution

<!--
Sync Impact Report:
Version: 1.0.0 (Initial ratification)
Ratification Date: 2025-01-22
Last Amended: 2025-01-22

Changes:
- Initial constitution created with 5 core principles
- Governance procedures established
- Compliance review cycle defined

Templates Status:
⚠ plan-template.md - Pending creation
⚠ spec-template.md - Pending creation
⚠ tasks-template.md - Pending creation

Follow-up TODOs: None
-->

**Version:** 1.0.0
**Ratification Date:** 2025-01-22
**Last Amended:** 2025-01-22

## Project Identity

**Name:** RestoreAssist
**Description:** AI-powered damage assessment report generator for the Australian restoration industry

RestoreAssist leverages Anthropic's Claude AI to transform the traditionally time-consuming process of creating restoration documentation into a streamlined, efficient workflow. The platform ensures compliance with Australian building codes while delivering professional-grade restoration reports for insurance claims and project management.

## Core Principles

These principles are non-negotiable and MUST be upheld in all feature development, architectural decisions, and code contributions.

### 1. User-Centric Design

**Principle:** Every feature MUST prioritize user needs and deliver intuitive, efficient workflows for restoration professionals.

**Requirements:**
- User research and feedback MUST inform feature design
- UI/UX decisions MUST reduce cognitive load and minimize clicks-to-completion
- Accessibility standards (WCAG 2.1 AA minimum) MUST be met
- Mobile responsiveness MUST be supported for field work scenarios
- User onboarding MUST be frictionless with clear value demonstration

**Rationale:** Restoration professionals work in high-pressure, time-sensitive environments. The platform's success depends on making complex documentation tasks simple and fast, not adding new burdens.

**Validation:**
- User testing sessions before major releases
- Analytics tracking of task completion times
- Accessibility audits with automated tools (axe, Lighthouse)
- Mobile device testing matrix coverage

### 2. NCC 2022 Compliance

**Principle:** All generated reports, recommendations, and technical content MUST align with the National Construction Code (NCC) 2022 and relevant Australian Standards.

**Requirements:**
- Building classifications MUST follow NCC Volume One (commercial) and Volume Two (residential)
- Fire safety and structural integrity assessments MUST reference current AS standards
- Plumbing and drainage work MUST comply with AS/NZS 3500 series
- AI-generated content MUST cite relevant code sections where applicable
- Compliance disclaimers MUST be included in all exported reports
- Regular reviews MUST be conducted when NCC updates are released

**Rationale:** Legal liability and professional credibility depend on accurate code compliance. Incorrect information could lead to unsafe construction practices, insurance disputes, or legal consequences for users.

**Validation:**
- Expert review of AI prompt templates by qualified building professionals
- Automated checks for code citation accuracy
- Quarterly compliance audits against NCC updates
- User-reported compliance issues tracked and prioritized

### 3. Performance First

**Principle:** The platform MUST deliver fast, responsive experiences under real-world Australian network conditions and device capabilities.

**Requirements:**
- Report generation MUST complete within 30 seconds for standard reports
- Frontend Time to Interactive (TTI) MUST be under 3 seconds on 4G connections
- AI API calls MUST have timeout handling and graceful degradation
- Database queries MUST be optimized with proper indexing and connection pooling
- Bundle sizes MUST be minimized through code splitting and lazy loading
- Images MUST use modern formats (WebP, AVIF) with responsive sizing
- Backend APIs MUST handle 100+ concurrent users without degradation

**Rationale:** Restoration professionals often work from job sites with variable mobile connectivity. Slow performance leads to abandonment, especially during time-sensitive claim documentation.

**Validation:**
- Lighthouse performance scores ≥90 for production builds
- Load testing with Artillery/k6 simulating peak usage
- Real User Monitoring (RUM) with performance budgets
- Bundle size tracking in CI/CD pipeline
- Monthly performance regression testing

### 4. Security by Default

**Principle:** Security MUST be embedded in every layer, not bolted on afterward. User data and business information MUST be protected to industry standards.

**Requirements:**
- Authentication MUST use industry-standard protocols (OAuth 2.0, JWT with refresh tokens)
- All data transmission MUST use TLS 1.3+
- Sensitive data at rest MUST be encrypted (AES-256 minimum)
- API endpoints MUST enforce authentication, authorization, and rate limiting
- Input validation MUST prevent injection attacks (SQL, XSS, CSRF)
- Dependencies MUST be scanned for known vulnerabilities (npm audit, Snyk)
- Secrets MUST never be committed to version control
- Security headers MUST be configured (CSP, HSTS, X-Frame-Options)
- Error messages MUST NOT leak sensitive information
- Audit logging MUST track security-relevant events

**Rationale:** Restoration reports contain sensitive property information, insurance details, and personal data. Breaches could expose client confidentiality, enable fraud, or violate Australian Privacy Principles under the Privacy Act 1988.

**Validation:**
- OWASP Top 10 security testing before releases
- Automated dependency vulnerability scans in CI/CD
- Penetration testing annually or after major architecture changes
- Security code reviews for authentication/authorization changes
- Regular Sentry error monitoring for suspicious patterns

### 5. Test-Driven Development

**Principle:** Code MUST be covered by automated tests before merging to main. Testing MUST validate both functionality and edge cases.

**Requirements:**
- Unit test coverage MUST be ≥80% for critical business logic
- Integration tests MUST validate API contracts and database interactions
- E2E tests MUST cover core user journeys (report generation, authentication, export)
- Tests MUST run automatically in CI/CD pipeline with mandatory pass gates
- Failing tests MUST block deployment
- Test data MUST be isolated and repeatable (no shared state between tests)
- Performance/load tests MUST be run before scaling architecture changes
- Accessibility tests MUST be automated (axe-core, Playwright accessibility)

**Rationale:** AI-generated content introduces non-deterministic behavior. Comprehensive testing ensures that code changes don't break existing functionality, regression bugs are caught early, and the platform remains reliable under production conditions.

**Validation:**
- Code coverage reports in pull requests
- CI/CD pipeline status checks enforced
- Test execution time monitored (tests should be fast enough to run frequently)
- Quarterly review of test effectiveness (are bugs caught by tests or users?)

## Governance

### Amendment Procedure

1. **Proposal:** Any team member may propose a constitutional amendment via GitHub issue with label `constitution-amendment`
2. **Review:** Proposal MUST be reviewed by technical lead and at least one senior engineer
3. **Discussion:** Minimum 3 business days for team feedback and iteration
4. **Approval:** Requires consensus approval (no blocking objections)
5. **Documentation:** Amendment MUST include version bump, rationale, and sync impact report
6. **Propagation:** All dependent templates and docs MUST be updated within 1 sprint

### Versioning Policy

- **MAJOR (X.0.0):** Breaking changes to principles, removal of core requirements, fundamental governance restructuring
- **MINOR (x.Y.0):** New principles added, material expansions to existing principles, new governance procedures
- **PATCH (x.y.Z):** Clarifications, wording improvements, typo fixes, non-semantic refinements

### Compliance Review Cycle

- **Quarterly:** Review principles against NCC updates and industry best practices
- **Pre-Release:** Verify new features align with constitutional requirements
- **Retrospective:** Identify principle violations in post-mortems and update safeguards
- **Annual:** Full constitution audit with external expert review (optional but recommended)

### Conflict Resolution

If a feature requirement conflicts with a constitutional principle:
1. The principle takes precedence unless a formal amendment is proposed
2. Product/engineering leads MUST collaborate to find an alternative solution
3. If no alternative exists, the feature MUST be rejected or the constitution MUST be amended
4. Exceptions are NOT permitted without constitutional amendment

### Enforcement

- Pull requests MUST reference this constitution in their description template
- Code reviews MUST validate constitutional compliance
- Architectural Decision Records (ADRs) MUST cite relevant principles
- Principle violations identified in production MUST be prioritized as P1 bugs

## Living Document Notice

This constitution is a living document. As RestoreAssist evolves, the team may discover new principles or refine existing ones. However, changes MUST be deliberate, documented, and propagated to maintain consistency across all project artifacts.

---

**Adopted:** 2025-01-22
**Authority:** RestoreAssist Technical Leadership Team
**Next Review:** 2025-04-22 (Quarterly)
