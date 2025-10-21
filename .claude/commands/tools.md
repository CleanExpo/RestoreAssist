# /tools - Available Development Tools Reference

Quick reference for all available orchestration tools, agents, and skills.

## 🚀 Quick Commands

- **`/all [task]`** - Full orchestration using ALL tools and agents
- **`/tools`** - Show this reference
- **`/speckit.*`** - SpecKit commands (plan, implement, specify, etc.)

## 🎯 SDK Agents (`.claude/agents/`)

Use `@agent-name` to invoke:

### Core Workflow Agents
- **@research** - Gather patterns, best practices, library research
- **@master-fullstack** - Verify requirements, ensure nothing missing
- **@coder** - Full-stack implementation (FE/BE/API)
- **@tester** - Playwright E2E testing and validation
- **@integrator** - Finalize, resolve imports, ensure build
- **@stuck** - Pattern recognition when blocked

### Specialized Agents
- **@master-docs** - README/API docs/CHANGELOG generation
- **@master-devops** - CI/CD, deployment, infrastructure
- **@master-data** - Database seeds, fixtures, migrations

## 🛠️ Anthropic Skills (`.claude/skills/`)

### webapp-testing
**When to use**: Testing web applications with Playwright
```
Use webapp-testing skill to test the login flow
Use webapp-testing skill to verify the dashboard renders correctly
```

### artifacts-builder
**When to use**: Building React components with shadcn/ui
```
Use artifacts-builder skill to create a data visualization dashboard
Use artifacts-builder skill to build a settings page with form validation
```

### document-skills
**When to use**: Creating/editing documents

**Available formats:**
- **pdf** - Extract text, create PDFs, merge/split documents
- **docx** - Create/edit Word documents with formatting
- **pptx** - Create/edit PowerPoint presentations
- **xlsx** - Create/edit Excel spreadsheets with formulas

```
Use the pdf skill to extract data from the report
Use the docx skill to create a technical specification document
Use the xlsx skill to generate a financial analysis spreadsheet
```

## 📋 SpecKit Commands (`.claude/commands/speckit.*`)

- **`/speckit.plan`** - Execute implementation planning workflow
- **`/speckit.specify`** - Create/update feature specification
- **`/speckit.implement`** - Execute implementation plan
- **`/speckit.tasks`** - Generate dependency-ordered tasks
- **`/speckit.checklist`** - Generate custom checklist
- **`/speckit.analyze`** - Cross-artifact consistency analysis
- **`/speckit.clarify`** - Identify underspecified areas
- **`/speckit.constitution`** - Create/update project constitution

## 🔄 Orchestration Workflow

Standard `/all` flow:

```
User Request
    ↓
@research (gather context)
    ↓
@master-fullstack (verify requirements)
    ↓
@coder (implement)
    ↓
@tester (validate - PHASE GATE)
    ↓
@integrator (finalize)
    ↓
@master-docs (document)
    ↓
@master-devops (deploy - optional)
    ↓
Complete!
```

## 💡 Usage Examples

### Example 1: Full Feature Implementation
```
/all Implement user profile editing with avatar upload
```
**What happens:**
1. @research finds patterns for profile editing and image upload
2. @master-fullstack verifies all requirements (form, API, storage, tests)
3. @coder implements frontend form, backend API, storage integration
4. @tester writes E2E tests using webapp-testing skill
5. @integrator ensures build passes and everything wired
6. @master-docs generates API documentation

### Example 2: Using Specific Agent
```
@research
Find best practices for implementing real-time notifications in React
```

### Example 3: Using Specific Skill
```
Use the pdf skill to extract all tables from the financial report
```

### Example 4: Testing Specific Feature
```
@tester
Test the checkout flow end-to-end
Acceptance criteria:
- Add item to cart
- Proceed to checkout
- Complete payment
- Verify order confirmation
```

## 🎨 Best Practices

1. **Use `/all` for complete features** - Comprehensive implementation
2. **Use specific agents for focused tasks** - Faster for single concerns
3. **Use skills when appropriate** - Let Claude know which skill to use
4. **Follow phase gates** - Never skip testing phase
5. **Track with todos** - Use TodoWrite for complex tasks

## 🔧 Environment

**Current Project:** RestoreAssist
**Stack:** React + TypeScript + Node.js + Vercel
**Database:** In-memory (trial tokens)
**Auth:** Google OAuth
**Payment:** Stripe (planned)

---

**Pro Tip:** Combine tools for maximum effect:
```
/all Build admin dashboard with user analytics
- Uses @research for dashboard patterns
- Uses @coder for implementation
- Uses webapp-testing skill for E2E tests
- Uses artifacts-builder skill for React components
- Uses xlsx skill to generate analytics exports
```
