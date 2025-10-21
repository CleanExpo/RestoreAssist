# /all - Full-Stack Orchestrated Development

Execute a complete, production-ready implementation using ALL available tools and frameworks:

## Orchestration Stack Activated

**1. Spec-Kit Orchestrator** (`.claude/CLAUDE.md`)
- Use the full orchestration workflow with phase gates
- Route through: Research → Master-FullStack → Coder → Tester → Integrator

**2. SDK Agents** (`.claude/agents/`)
- @research - Gather patterns and best practices
- @master-fullstack - Verify requirements completeness
- @coder - Implement full-stack solution
- @tester - Validate with Playwright E2E tests
- @integrator - Finalize and wire everything
- @master-docs - Generate comprehensive documentation
- @master-devops - Handle deployment and CI/CD

**3. Anthropic Skills** (`.claude/skills/`)
- **webapp-testing**: Test UI with Playwright automation
- **artifacts-builder**: Build React components with shadcn/ui
- **document-skills**: Generate PDF/DOCX/XLSX/PPTX documentation

## Execution Protocol

When `/all` is invoked, follow this comprehensive workflow:

### Phase 1: Research & Planning
```
@research
- Gather relevant patterns, libraries, best practices
- Identify constraints and risks
- Provide recommendations
→ Handoff to Master-FullStack with sources and constraints
```

### Phase 2: Requirements Verification
```
@master-fullstack
- Verify ALL requirements are captured
- Perform "no piece missing" check across:
  * Frontend components
  * Backend APIs
  * Database schema
  * Tests
  * Documentation
  * Deployment
→ Handoff to Coder with verified requirements
```

### Phase 3: Implementation
```
@coder
- Implement complete solution (FE + BE + DB)
- Write clean, production-ready code
- Follow best practices and patterns from research
- Include error handling and validation
→ Handoff to Tester with changed files and acceptance criteria
```

### Phase 4: Testing (CRITICAL PHASE GATE)
```
@tester
- Write comprehensive Playwright E2E tests
- Use webapp-testing skill if needed
- Validate ALL acceptance criteria
- MUST PASS before proceeding

IF TESTS FAIL:
  → Return to @coder with error details
  → OR escalate to @stuck for pattern recognition

IF TESTS PASS:
  → Handoff to Integrator with test results
```

### Phase 5: Integration
```
@integrator
- Resolve all imports and paths
- Ensure build passes
- Verify no console errors
- Check deployment readiness
→ Handoff to Master-Docs and/or Master-DevOps
```

### Phase 6: Documentation & Deployment (Optional)
```
@master-docs
- Generate comprehensive README
- Create API documentation (use document-skills if needed)
- Update CHANGELOG

@master-devops (if deployment requested)
- Deploy with guardrails
- Verify deployed environment
- Update deployment docs
```

## Skills Integration

Automatically use skills when appropriate:

- **Building UI components?** → Use `artifacts-builder` skill
- **Testing web application?** → Use `webapp-testing` skill
- **Creating documentation?** → Use `document-skills` (pdf/docx/pptx/xlsx)

## Output Requirements

At the end of the `/all` workflow, provide:

1. ✅ **Complete Implementation**
   - All code written and tested
   - Build passing
   - Tests passing

2. ✅ **Comprehensive Documentation**
   - README with setup instructions
   - API documentation
   - Architecture diagrams (if complex)

3. ✅ **Deployment Artifacts**
   - Environment variables documented
   - Deployment commands provided
   - Verification steps included

4. ✅ **Test Coverage**
   - E2E tests written
   - All acceptance criteria validated
   - Test results reported

5. ✅ **Quality Assurance**
   - No TypeScript errors
   - No console errors
   - Code follows best practices
   - Security considerations addressed

## Usage Examples

```
/all Implement user authentication with Google OAuth and email/password
/all Create a dashboard with real-time analytics and export to PDF
/all Build a payment flow with Stripe integration and invoice generation
/all Add admin panel with user management and audit logs
```

## Critical Rules

1. **NEVER skip the Tester phase gate** - Tests MUST pass
2. **Use Task tool** to track progress with todos
3. **Follow handoff contracts** from CLAUDE.md
4. **Escalate to @stuck** if blocked
5. **Ask user** if requirements are ambiguous

---

**Remember**: `/all` means COMPREHENSIVE, PRODUCTION-READY, FULLY TESTED implementation using the ENTIRE orchestration stack.
