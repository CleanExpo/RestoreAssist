# Orchestrator Coordination Patterns (Drop-In Framework)

**Reference:** [Drop-In Claude Orchestrator](https://github.com/CleanExpo/Drop-In-Claude-Orchestrator)
**Last Updated:** 2025-11-05

---

## 1. Multi-Agent Workflow Architecture

RestoreAssist implements a **hierarchical multi-agent orchestrator system** for coordinating specialist skills through structured workflows with safety enforcement.

### Core Specialist Skills

- **`damage-analyser`** — Analyses damage patterns, severity, and IICRC classification
- **`iicrc-compliance-checker`** — Ensures S500/S520 standards compliance
- **`question-generator`** — Creates contextual clarification questions for Q&A phase
- **`report-writer`** — Generates professional IICRC-compliant reports
- **`scope-calculator`** — Estimates restoration scope and materials
- **`timeline-estimator`** — Projects realistic completion timelines

### Master Coordinators (Future)

- **`master-fullstack`** — Performs "no piece missing" completeness verification
- **`master-docs`** — Generates comprehensive documentation and ADRs

---

## 2. Safety & Guardrail System

Implements **write scope restrictions, protected file approval gates, and phase-gated progression**.

### Configuration Example

```yaml
# .claude/config.yaml (to be implemented)
project:
  type: "nextjs_fullstack"
  name: "RestoreAssist"

guardrails:
  write_scope:
    - "app/**"
    - "components/**"
    - "lib/**"
    - "public/**"
    - "styles/**"

  protected_files:
    - ".env*"
    - "prisma/schema.prisma"
    - "package.json"
    - "next.config.js"
    - "tsconfig.json"

  require_validation: true

  phase_gates:
    initiation:
      - "Input method validated"
      - "Data extraction successful"
      - "Initial classification assigned"
    processing:
      - "All specialist skills executed"
      - "IICRC compliance verified"
      - "Data consistency validated"
    qa:
      - "Questions generated and presented"
      - "User responses collected"
      - "Clarifications integrated"
    output:
      - "Report structure validated"
      - "All sections complete"
      - "IICRC standards met"
```

### Safety Mechanisms

1. **Write Scope Enforcement** — Operations limited to designated directories
2. **Protected File Approval** — Critical file changes require explicit authorisation
3. **Phase Gate Requirements** — Progression blocked until validation criteria met
4. **Validation Checkpoints** — Quality gates at each workflow transition
5. **Rollback Capability** — Automatic rollback on validation failure

---

## 3. Agent Handoff Contract Pattern

Agents exchange **JSON contracts** containing validated context for clear, structured communication.

### Contract Schema

```typescript
interface HandoffContract {
  // Source and destination
  from_agent: string
  to_agent: string

  // Workflow context
  context: {
    files_modified: string[]
    data_collected: Record<string, unknown>
    next_steps: string[]
    phase_status: 'initiating' | 'processing' | 'awaiting_input' | 'generating_output'
  }

  // Requirements for next agent
  requirements: {
    must_validate: string[]
    must_verify: string[]
    quality_gates: string[]
  }

  // Metadata
  metadata: {
    timestamp: string
    workflow_id: string
    confidence_score?: number
  }
}
```

### Example Handoff: Damage Analyser → Compliance Checker

```json
{
  "from_agent": "damage-analyser",
  "to_agent": "iicrc-compliance-checker",
  "context": {
    "files_modified": [],
    "data_collected": {
      "damage_category": 3,
      "affected_materials": ["drywall", "carpet", "baseboard"],
      "duration_hours": 72,
      "moisture_class": "Class 3",
      "severity": "significant"
    },
    "next_steps": [
      "Verify IICRC S500 classification",
      "Check S520 mould standards if applicable",
      "Validate remediation approach"
    ],
    "phase_status": "processing"
  },
  "requirements": {
    "must_validate": [
      "Category 3 water classification",
      "Class 3 moisture classification"
    ],
    "must_verify": [
      "Affected materials correctly categorised",
      "Remediation approach aligns with standards"
    ],
    "quality_gates": [
      "All IICRC references accurate",
      "No contradictory classifications"
    ]
  },
  "metadata": {
    "timestamp": "2025-11-05T12:00:00Z",
    "workflow_id": "wf_20251105_001",
    "confidence_score": 0.95
  }
}
```

### Handoff Validation Rules

- **Schema Enforcement:** Prevents incomplete transfers
- **Mandatory Field Validation:** Ensures context quality
- **Auto-Repair:** Attempts for malformed contracts
- **Escalation:** On repeated failures

---

## 4. Workflow Orchestration Patterns

### Restoration Assessment Workflow

```
Input Collection →
  damage-analyser →
    iicrc-compliance-checker →
      question-generator →
        [User Input] →
          scope-calculator →
            timeline-estimator →
              report-writer →
                Output Delivery
```

### Quality Assurance Checkpoints

**After `damage-analyser`:**
- ✓ Damage classification completeness
- ✓ All affected materials documented
- ✓ Duration and moisture readings captured

**After `iicrc-compliance-checker`:**
- ✓ All applicable standards referenced
- ✓ Classification matches IICRC guidelines
- ✓ No contradictory categorisations

**After `question-generator`:**
- ✓ Questions relevant to assessment
- ✓ Clarity and professional language
- ✓ Proper Australian English spelling

**After `report-writer`:**
- ✓ Report structure complete
- ✓ IICRC compliance maintained
- ✓ All sections properly formatted

### Error Recovery Pattern

```
Error Detection →
  stuck-agent →
    Pattern Analysis →
      Alternative Suggestions →
        [User Decision] →
          Retry with Context OR Escalate
```

---

## 5. Skill Coordination Best Practices

### Task Specification Guidelines

**✅ Good Examples:**
- "Analyse water damage in kitchen with S500 classification"
- "Generate questions about moisture readings for Class 3 damage"
- "Calculate scope for drywall replacement in 200 sq ft area"
- "Estimate timeline for Category 3 water remediation"

**❌ Poor Examples:**
- "Look at the damage" (too vague)
- "Ask about everything" (too open-ended)
- "Fix it" (no clear scope)
- "Make it better" (no measurable goal)

### Workflow Management Principles

1. **Complete Skill Execution** — Let each skill finish before handoff
2. **Verify Handoff Quality** — Check contract validity before proceeding
3. **Trust the Process** — Let skills operate within their scope
4. **Monitor Phase Progression** — Track indicators through phases
5. **Intervene at Gates** — Only intervene at designated phase gates

### Configuration Modes

**Trusted Mode:**
- Fast iteration with minimal oversight
- Suitable for routine workflows
- Automatic progression through phases
- Reduced user interaction

**Review Mode:**
- Step-by-step oversight and approval
- Suitable for complex/critical workflows
- Manual approval at each phase gate
- Increased user control

---

## 6. Phase Gate Enforcement

Each workflow phase has **mandatory completion criteria** that must be met before progression.

### Phase 1: Initiation (Blue #2563EB)

**Completion Criteria:**
- ✓ Input method validated (text/PDF/Word/API)
- ✓ Data extraction successful
- ✓ Initial damage classification assigned
- ✓ User information captured

**Progression Blockers:**
- Missing input data
- Unrecognised file format
- Incomplete user details

**Gate Check:** All criteria met → Proceed to Processing

---

### Phase 2: Processing (Purple #9333EA)

**Completion Criteria:**
- ✓ All specialist skills executed
- ✓ IICRC compliance verified
- ✓ Data consistency validated
- ✓ Internal quality checks passed

**Progression Blockers:**
- Skill execution failures
- IICRC standard violations
- Data inconsistencies
- Missing required fields

**Gate Check:** All criteria met → Proceed to Q&A

---

### Phase 3: Q&A (Cyan #06B6D4)

**Completion Criteria:**
- ✓ Questions generated and presented
- ✓ User responses collected
- ✓ Clarifications integrated
- ✓ Context updated with new information

**Progression Blockers:**
- Unanswered critical questions
- Incomplete user responses
- Contradictory clarifications

**Gate Check:** All criteria met → Proceed to Output

---

### Phase 4: Output (Emerald #10B981)

**Completion Criteria:**
- ✓ Report structure validated
- ✓ All sections complete (Executive Summary, Findings, Scope, Timeline, Cost Estimate)
- ✓ IICRC standards compliance verified
- ✓ Professional formatting applied

**Progression Blockers:**
- Missing report sections
- Incomplete data fields
- Non-compliant classifications
- Formatting errors

**Gate Check:** All criteria met → Mark as Completed

---

## 7. Autonomous Optimisation System (Future - MAOS)

The **Multi-Agent Optimisation System (MAOS)** pattern for silent, non-invasive improvements.

### Six Parallel Subagents

1. **Scanner** — Project structure detection and inventory
2. **Compiler** — Pattern library loading and preparation
3. **Analyser** — Code quality analysis and issue detection
4. **Optimiser** — Pattern application and code improvements
5. **Validator** — Test verification and quality assurance
6. **Resource Manager** — Efficiency tracking and optimisation

### Application Areas

- **Standardised Error Handling** — Consistent patterns across codebase
- **Security Vulnerability Patching** — Proactive security improvements
- **Performance Optimisation** — Code efficiency enhancements
- **Code Consistency Enforcement** — Style guide compliance
- **Accessibility Compliance** — WCAG 2.1 AA improvements

### Execution Constraints

- ✓ Silent operation with minimal output (<60 tokens)
- ✓ No structural changes to core architecture
- ✓ Auto-rollback on test failure
- ✓ User notification of improvements post-execution
- ✓ Comprehensive logging for audit trail

---

## 8. Integration with Claude Code

### Task Tool Usage for Skill Coordination

Example pattern for invoking specialist skills:

```text
User Request: "Analyse this water damage assessment"

Claude Response:
I'll coordinate the damage analysis workflow using our specialist skills.

[Uses Task tool with damage-analyser agent]
[Damage analyser completes, returns JSON handoff contract]
[Uses Task tool with iicrc-compliance-checker agent]
[Compliance checker validates, returns updated contract]
[Continues through workflow phases]
```

### Agent Communication Pattern

1. **Invoke Specialist Skill** via Task tool
2. **Receive Handoff Contract** with validated data
3. **Verify Contract Quality** against schema
4. **Invoke Next Skill** with enriched context
5. **Repeat** until workflow complete

---

## 9. Best Practice Summary

### DO

✅ Use specific, measurable task descriptions
✅ Let skills complete their scope before intervening
✅ Trust phase gate validations
✅ Maintain Australian English spelling
✅ Document handoff contracts clearly
✅ Verify IICRC compliance at each checkpoint
✅ Test workflow end-to-end regularly

### DON'T

❌ Give vague, open-ended instructions
❌ Interrupt skills mid-execution
❌ Skip phase gate validations
❌ Mix US/AU English spellings
❌ Bypass safety guardrails
❌ Assume compliance without verification
❌ Deploy without complete workflow testing

---

## 10. Reference Implementation

See `examples/projects/pta-mvp-001/` in the Drop-In Claude Orchestrator repository for a complete reference implementation demonstrating:

- Hierarchical supervisor architecture
- Phase gate enforcement
- Mandatory workflow ordering
- Escalation and error recovery
- Complete testing strategy

---

**Additional Resources:**

- Drop-In Orchestrator: https://github.com/CleanExpo/Drop-In-Claude-Orchestrator
- IICRC Standards: https://www.iicrc.org/
- RestoreAssist Instructions: `.claude/instructions.md`
