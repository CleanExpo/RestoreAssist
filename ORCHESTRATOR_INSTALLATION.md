# Drop-In Claude Orchestrator - Installation Complete

## Installation Date
October 20, 2025

## Branch
`Drop-In-Claude-Orchestrator`

---

## What is the Orchestrator?

The Drop-In Claude Orchestrator is a multi-agent AI development framework that coordinates specialized agents to handle complex development tasks with clear phase gates and structured handoffs.

### Key Concepts

1. **Multi-Agent System**: Instead of one AI doing everything, specialized agents focus on specific tasks
2. **Phase Gates**: Quality checkpoints (e.g., tests must pass before deployment)
3. **Structured Handoffs**: Agents pass work to each other with complete context in JSON format
4. **Workflow Orchestration**: Predefined workflows for common tasks (features, bugfixes, deployments)

---

## Installed Agents (12 Total)

### Core Agents
1. **research** - Gathers context from web, documentation, finds patterns
2. **coder** - Full-stack implementation (frontend, backend, API, packages)
3. **tester** - Playwright E2E testing and validation
4. **integrator** - Merges outputs, resolves imports/paths, ensures build
5. **stuck** - Dead-end detection, provides A/B/C choices, escalation

### Master Coordinators
6. **master-fullstack** - Verifies requirements complete, ensures nothing missing
7. **master-devops** - CI/CD with deployment guardrails
8. **master-docs** - README/ADR/CHANGELOG generation
9. **master-data** - Database seeds, fixtures, data integrity

### Utility Agents
10. **data** - Database migrations and data operations
11. **deployer** - Deployment automation and verification
12. **docs** - Documentation creation and updates

---

## Standard Workflow

```
User Request
    ↓
Research (gathers context)
    ↓
Master-FullStack (verifies requirements)
    ↓
Coder (implements solution)
    ↓
Tester (validates - PHASE GATE)
    ↓
Integrator (finalizes)
    ↓
[Optional: Docs/DevOps/Data]
    ↓
Complete
```

### Phase Gate: Tester → Integrator

**Critical**: Tests MUST pass before Integrator proceeds
- Failing tests block progression
- Options if tests fail:
  1. Return to Coder for fixes
  2. Escalate to Stuck for analysis
  3. Escalate to user if ambiguous

---

## RestoreAssist Configuration

### Monorepo Structure
```yaml
monorepos:
  enabled: true
  packages:
    - packages/frontend
    - packages/backend
```

### Tech Stack Configured
- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Auth**: JWT + Google OAuth
- **Payments**: Stripe
- **Testing**: Playwright + Vitest
- **Deployment**: Vercel
- **AI**: Anthropic Claude

### MCP Servers Enabled
- ✅ Stripe MCP (payment integration)
- ✅ GitHub MCP (repo operations)
- ✅ Context7 MCP (documentation)
- ✅ Playwright MCP (E2E testing)
- ✅ IDE MCP (diagnostics)
- ✅ Sequential-Thinking MCP (complex reasoning)
- ✅ Memory MCP (knowledge graph)
- ✅ Filesystem MCP (file operations)
- ✅ Git MCP (read-only)

### Protected Files
```yaml
protected_files:
  - .env*
  - **/.env.local
  - vercel.json
  - **/package-lock.json
  - **/.vercel/**
  - packages/backend/api/**  # Vercel serverless entry points
```

---

## Custom Workflows

### 1. Feature Development
```
research → master-fullstack → coder → data (if needed) → tester (GATE) → integrator → master-docs
```

### 2. Bug Fix
```
research → stuck → coder → tester (GATE) → integrator
```

### 3. Deployment
```
tester (GATE) → master-devops → tester → master-docs
```

### 4. Database Operations
```
data → master-data → tester → integrator
```

### 5. Subscription Features (Stripe)
```
research → coder → data → tester (GATE) → integrator
```

---

## How to Use

### Basic Agent Invocation
```
@research
## Task
Find best practices for implementing subscription cancellation flows in Stripe
```

### Multi-Agent Workflow
```
@research
Research how to handle failed payment retries in Stripe

@coder
Implement the retry logic based on research findings

@tester
Create E2E tests for payment retry scenarios

@integrator
Wire everything together and verify build
```

### Using Workflows
Instead of invoking agents manually, you can specify a workflow type:
- "Add subscription cancellation feature" → Uses `subscription` workflow
- "Fix payment webhook error" → Uses `bugfix` workflow
- "Deploy to production" → Uses `deploy` workflow

---

## Configuration Files

### Main Config
- **Location**: `.claude/config.yaml`
- **Purpose**: Project-wide orchestrator settings
- **Customized For**: RestoreAssist monorepo with Stripe integration

### Agent Definitions
- **Location**: `.claude/agents/*.md`
- **Count**: 12 specialized agents
- **Format**: Markdown with instructions and examples

### MCP Configurations
- **Location**: `.claude/mcp/*.config.json`
- **Purpose**: Configure Model Context Protocol servers

### Policies
- **Location**: `.claude/policies/*.md`
- **Contains**: Guardrails and handoff protocols

---

## Autonomy Mode

**Current Setting**: `trusted`

This means:
- Agents work autonomously within guardrails
- Fast iteration without requiring approval for each step
- Phase gates still enforced (tests must pass)
- Protected files cannot be modified

**Alternative Modes**:
- `review_each_step` - Requires approval before writes
- Can be toggled with `/switch-to-review-mode`

---

## Testing the Orchestrator

### Test 1: Simple Documentation Request
```
@master-docs
Create a README for the subscription service
```

### Test 2: Research Query
```
@research
What are the best practices for handling Stripe webhook retries?
```

### Test 3: Bug Investigation
```
@stuck
We have a failing E2E test in the payment flow. Help identify the issue.
```

### Test 4: Full Feature Workflow
```
Implement a subscription upgrade/downgrade feature with proper Stripe integration
```
This would automatically trigger: research → master-fullstack → coder → data → tester → integrator

---

## Commit History

```bash
e498144 - Add Drop-In Claude Orchestrator with RestoreAssist configuration
  - 12 specialized agents installed
  - Custom config.yaml for monorepo
  - MCP servers configured
  - Workflows for features, bugs, deployments
  - Phase gates enabled
```

---

## Benefits for RestoreAssist

### 1. Structured Development
- Clear separation of concerns
- Each agent specializes in one thing
- Consistent quality through phase gates

### 2. Better Testing
- Tester agent enforces test creation
- Tests must pass before integration
- E2E tests for critical flows

### 3. Documentation
- Master-docs agent keeps docs updated
- Automatic CHANGELOG generation
- ADR (Architecture Decision Records)

### 4. Deployment Safety
- Master-devops ensures guardrails
- Verification steps enforced
- No direct production pushes

### 5. Knowledge Retention
- Research agent documents findings
- Stuck agent recognizes patterns
- Memory MCP maintains knowledge graph

---

## Next Steps

1. ✅ **Installation** - Complete
2. ✅ **Configuration** - Complete
3. ✅ **Git Commit** - Complete
4. ✅ **Branch Push** - Complete
5. ⏳ **Testing** - In Progress
6. ⏳ **Merge to Main** - After testing

---

## Support

### Documentation
- **Orchestrator Guide**: `.claude/claude.md`
- **Agent Definitions**: `.claude/agents/*.md`
- **Configuration**: `.claude/config.yaml`

### Useful Commands
```bash
# Check orchestrator status
/mcp status

# Switch to review mode
/switch-to-review-mode

# View agents
ls .claude/agents/

# View workflows
cat .claude/config.yaml | grep -A 30 "workflows:"
```

---

**Status**: ✅ Installation Complete
**Branch**: Drop-In-Claude-Orchestrator
**Ready For**: Testing and validation
**Last Updated**: October 20, 2025

🤖 **Orchestrator successfully integrated into RestoreAssist!**
