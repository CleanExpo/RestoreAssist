# RestoreAssist Orchestrator - Branch Instructions (phills-updates)

**Branch:** phills-updates
**Purpose:** Implementation of RestoreAssist Orchestrator System
**Last Updated:** 2025-11-05

---

## 1. Language Requirements

### Australian English Spelling - MANDATORY

All code, documentation, and user-facing text MUST use Australian English spelling conventions:

| ❌ US English | ✅ Australian English |
|---------------|----------------------|
| analyze       | analyse              |
| organization  | organisation         |
| color         | colour               |
| recognize     | recognise            |
| optimize      | optimise             |
| summarize     | summarise            |
| prioritize    | prioritise           |
| customize     | customise            |
| finalize      | finalise             |
| center        | centre               |
| fiber         | fibre                |
| license       | licence (noun)       |
| meter         | metre                |
| behavior      | behaviour            |

**Common Exceptions:**
- Technical terms like "API", "URL", "HTML" remain unchanged
- Third-party library names remain unchanged (e.g., "Tailwind CSS", "React")
- Code variable names can use camelCase without 'u' where standard (e.g., `color` in CSS properties)

---

## 2. Application-Specific Navigation

### Dashboard Sidebar - Orchestrator Application

The sidebar navigation in `app/dashboard/layout.tsx` must ONLY contain items relevant to the orchestrator workflow. Remove all unnecessary navigation items.

**APPROVED Navigation Items:**
1. **Dashboard** (Home icon) - Main orchestrator overview
2. **Start Assessment** (PlayCircle icon) - Initiate new workflow
3. **Active Assessments** (Activity icon) - View in-progress workflows
4. **Completed Reports** (CheckCircle icon) - View finished assessments
5. **Settings** (Settings icon) - User preferences
6. **Help & Support** (HelpCircle icon) - Documentation and support

**REMOVE These Items:**
- ❌ New Report (replaced by "Start Assessment")
- ❌ Reports (replaced by "Active Assessments" + "Completed Reports")
- ❌ Clients (not part of orchestrator workflow)
- ❌ Cost Libraries (not part of orchestrator workflow)
- ❌ Integrations (move to Settings if needed)
- ❌ Analytics (not part of initial orchestrator MVP)
- ❌ Subscription (not part of orchestrator workflow)
- ❌ Upgrade Package (not part of orchestrator workflow)

**Navigation Structure:**
```typescript
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Start Assessment', href: '/dashboard/start', icon: PlayCircle, highlight: true },
  { name: 'Active Assessments', href: '/dashboard/active', icon: Activity },
  { name: 'Completed Reports', href: '/dashboard/completed', icon: CheckCircle },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'Help & Support', href: '/dashboard/help', icon: HelpCircle }
]
```

---

## 3. Orchestrator Workflow Patterns

### Phase System

The orchestrator uses a **4-phase workflow system**:

1. **Initiation (Blue #2563EB)** - Initial data collection and validation
2. **Processing (Purple #9333EA)** - AI analysis and skill coordination
3. **Q&A (Cyan #06B6D4)** - Interactive clarification and refinement
4. **Output (Emerald #10B981)** - Report generation and delivery

### Input Methods

Four primary input methods are supported:

1. **Text Input** (Most Common) - Direct text/paste
2. **PDF Upload** - Extract from existing PDF reports
3. **Word Upload** - Import from .docx files
4. **Field App API** (Coming Soon) - Integration with field data apps

### Workflow States

```typescript
type WorkflowStatus =
  | 'initiating'      // Phase 1 active
  | 'processing'      // Phase 2 active
  | 'awaiting_input'  // Phase 3 - waiting for user answers
  | 'generating_output' // Phase 4 active
  | 'completed'       // All phases done
  | 'error'          // Workflow error occurred
  | 'paused'         // User paused workflow
```

### Skill Coordination

The orchestrator coordinates these specialist skills:

- `damage-analyzer` - Analyses damage patterns and severity
- `iicrc-compliance-checker` - Ensures IICRC S500/S520 standards
- `question-generator` - Creates contextual clarification questions
- `report-writer` - Generates final IICRC-compliant reports
- `scope-calculator` - Estimates scope of work
- `timeline-estimator` - Projects restoration timelines

---

## 4. Component Structure Guidelines

### File Organisation

```
components/
  orchestrator/
    QuickStartPanel.tsx      # Input method selection
    PhaseProgressBar.tsx     # Phase visualisation
    ActiveWorkflowCard.tsx   # Individual workflow status
    QuestionInterface.tsx    # Q&A phase interface (TODO)
    ReportPreview.tsx        # Output phase preview (TODO)
    types.ts                 # Shared TypeScript types
    index.ts                 # Centralised exports
    README.md                # Component documentation
```

### Naming Conventions

- **Components:** PascalCase (e.g., `QuickStartPanel.tsx`)
- **Hooks:** camelCase with 'use' prefix (e.g., `useWorkflowProgress.ts`)
- **Utilities:** camelCase (e.g., `formatDuration.ts`)
- **Types:** PascalCase interfaces/types (e.g., `interface PhaseProgress`)
- **Constants:** SCREAMING_SNAKE_CASE (e.g., `PHASE_COLORS`)

### Component Template

```typescript
"use client"

import { motion } from "framer-motion"
import { /* icons */ } from "lucide-react"
import { useState } from "react"

/**
 * [Component Name] Component
 *
 * [Brief description of purpose]
 *
 * @component
 * @example
 * ```tsx
 * <ComponentName prop1="value" />
 * ```
 */

interface ComponentNameProps {
  // Props with JSDoc
  /** Description of prop */
  propName: string
  className?: string
}

export default function ComponentName({
  propName,
  className = ""
}: ComponentNameProps) {
  // Component logic

  return (
    <div className={`base-styles ${className}`}>
      {/* Component JSX */}
    </div>
  )
}
```

---

## 5. Styling Guidelines

### Colour System (Australian spelling in docs, US in code where required)

**Phase Colours:**
- Initiation: Blue (`#2563EB`, `blue-500`)
- Processing: Purple (`#9333EA`, `purple-500`)
- Q&A: Cyan (`#06B6D4`, `cyan-500`)
- Output: Emerald (`#10B981`, `emerald-500`)

**Utility Colours:**
- Success: Green (`#10B981`)
- Warning: Amber (`#F59E0B`)
- Error: Red (`#EF4444`)
- Info: Blue (`#3B82F6`)

### Dark Mode Support

All components MUST support dark mode with proper contrast ratios (WCAG 2.1 AA minimum).

**Pattern:**
```tsx
className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
```

### Responsive Breakpoints

- **Mobile:** < 768px (1 column layouts)
- **Tablet:** 768px - 1024px (2 column layouts)
- **Desktop:** > 1024px (4 column layouts for cards)

---

## 6. Animation Standards

### Framer Motion Patterns

**Entry Animations:**
```tsx
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4, ease: "easeOut" }}
```

**Staggered Children:**
```tsx
transition={{ duration: 0.4, delay: index * 0.1 }}
```

**Hover Effects:**
```tsx
whileHover={{ scale: 1.02, y: -4 }}
whileTap={{ scale: 0.98 }}
```

**Progress Animations:**
```tsx
<motion.div
  initial={{ width: 0 }}
  animate={{ width: `${percentage}%` }}
  transition={{ duration: 0.5, ease: "easeInOut" }}
/>
```

---

## 7. Typography

### Font Families

- **All Text (Headings, Titles, Body):** 'Whitney' - Humanist sans-serif typeface by Tobias Frere-Jones
  - Whitney is a commercial font from H&Co (Hoefler & Co)
  - Configured via CSS variable: `var(--font-whitney)`
  - Fallback stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`
- **Monospace:** 'Whitney Mono' (if available), 'Fira Code', 'Consolas', 'Monaco'
  - Configured via CSS variable: `var(--font-whitney-mono)`

**Font Implementation:**
Whitney must be added via:
1. Web font service (fonts.com, cloud.typography.com)
2. Self-hosted font files in `/public/fonts/`

See `app/globals.css` for font configuration details.

### Font Sizes

```css
text-xs    /* 0.75rem - 12px */
text-sm    /* 0.875rem - 14px */
text-base  /* 1rem - 16px */
text-lg    /* 1.125rem - 18px */
text-xl    /* 1.25rem - 20px */
text-2xl   /* 1.5rem - 24px */
text-3xl   /* 1.875rem - 30px */
text-4xl   /* 2.25rem - 36px */
```

---

## 8. Accessibility Requirements

### WCAG 2.1 AA Compliance - MANDATORY

1. **Colour Contrast:** Minimum 4.5:1 for normal text, 3:1 for large text
2. **Keyboard Navigation:** All interactive elements must be keyboard accessible
3. **ARIA Labels:** Buttons and interactive elements require `aria-label` or `aria-labelledby`
4. **Focus Indicators:** Visible focus states on all interactive elements
5. **Alt Text:** All images and icons require descriptive alt text
6. **Semantic HTML:** Use proper heading hierarchy (h1 → h2 → h3)

**Example:**
```tsx
<button
  onClick={handleClick}
  aria-label="Start new assessment workflow"
  className="focus:ring-2 focus:ring-blue-500 focus:outline-none"
>
  Start Assessment
</button>
```

---

## 9. State Management Patterns

### Component State (useState)

For local UI state within components:
```typescript
const [isOpen, setIsOpen] = useState(false)
const [hoveredCard, setHoveredCard] = useState<string | null>(null)
```

### Server State (React Query - Future)

For fetching and caching server data:
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['workflow', workflowId],
  queryFn: () => fetchWorkflow(workflowId)
})
```

### Global State (Context - If Needed)

For workflow state shared across multiple components:
```typescript
const WorkflowContext = createContext<WorkflowContextType | null>(null)
```

---

## 10. API Endpoint Conventions

### Workflow Endpoints (To Be Implemented)

```
POST   /api/workflows/initiate
GET    /api/workflows/:id/status
POST   /api/workflows/:id/answer
GET    /api/workflows/:id/report
PATCH  /api/workflows/:id/pause
PATCH  /api/workflows/:id/resume
DELETE /api/workflows/:id
```

### Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  metadata?: {
    timestamp: string
    requestId: string
  }
}
```

---

## 11. Testing Requirements (Future)

### Unit Tests
- All utility functions must have unit tests
- Target: 80% code coverage minimum

### Component Tests
- Critical user flows must have integration tests
- Use React Testing Library

### E2E Tests
- Complete orchestrator workflow end-to-end test
- Use Playwright MCP

---

## 12. Documentation Standards

### Component Documentation

Every component MUST include:
1. JSDoc comment explaining purpose
2. Usage example with code snippet
3. Props interface with descriptions
4. Return type annotation

### Code Comments

- **When to Comment:** Complex logic, business rules, workarounds
- **When NOT to Comment:** Self-explanatory code
- **Style:** Use Australian English in comments

---

## 13. Git Commit Conventions

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `style`: Formatting changes
- `docs`: Documentation updates
- `test`: Test additions/changes
- `chore`: Build/config changes

**Example:**
```
feat(orchestrator): add QuickStartPanel component

Implement the 4-card input method selection interface for initiating
orchestrator workflows. Includes animations, hover effects, and dark mode support.

Uses Australian English spelling throughout.
```

---

## 14. Known Issues & Workarounds

### Issue 1: Tailwind v4 Compatibility
**Status:** Resolved
**Solution:** Using Tailwind CSS v3.4.17 (Lightning CSS incompatibility with v4)

### Issue 2: Prisma Client Initialization
**Status:** Non-blocking
**Impact:** API routes show errors but dashboard works with mock data
**TODO:** Run `npx prisma generate` before deployment

### Issue 3: NextAuth Session Errors
**Status:** Non-blocking
**Impact:** Auth endpoints return 500 but don't affect dashboard functionality
**TODO:** Debug session configuration

---

## 15. Quick Reference

### Start Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Run Type Checking
```bash
npx tsc --noEmit
```

### Format Code
```bash
npm run format
```

### Generate Prisma Client
```bash
npx prisma generate
```

---

## 16. Orchestrator Framework Integration

**IMPORTANT:** This project follows the Drop-In Claude Orchestrator pattern for coordinating specialist AI agents through structured workflows with safety enforcement.

**See:** `.claude/orchestrator-patterns.md` for comprehensive guidelines on:
- Multi-agent workflow architecture
- Safety & guardrail system
- Agent handoff contracts
- Phase gate enforcement
- Skill coordination best practices
- Quality assurance checkpoints

**Reference Repository:** https://github.com/CleanExpo/Drop-In-Claude-Orchestrator

---

## 17. API Key Onboarding & BYOK Model

The system uses a **Bring Your Own Key (BYOK)** model requiring users to provide their own Anthropic API key for AI features. All new users must complete mandatory onboarding: **Signup/Login → Onboarding (if no API key) → Dashboard**.

**Security:** API keys are encrypted using AES-256-GCM before database storage (see `lib/crypto.ts`)

**Key Components:**
- `lib/crypto.ts` - Encryption utilities for secure key storage
- `app/onboarding/page.tsx` - Onboarding UI flow
- `app/api/user/api-key/` - API endpoints for key management
- `prisma/schema.prisma` - Database schema with encrypted key fields

**Reference:** See `.claude/api-key-onboarding.md` for complete implementation details

---

## 18. Additional Resources

- **Orchestrator Patterns:** `.claude/orchestrator-patterns.md` (mandatory reading)
- **IICRC Standards:** https://www.iicrc.org/
- **Tailwind CSS v3 Docs:** https://v3.tailwindcss.com/
- **Framer Motion Docs:** https://www.framer.com/motion/
- **Next.js 16 Docs:** https://nextjs.org/docs
- **React 19 Docs:** https://react.dev/
- **Whitney Font:** H&Co (Hoefler & Co) - https://www.typography.com/

---

**Remember:**
- Always use Australian English spelling in user-facing text and documentation
- Keep navigation focused on orchestrator workflow only (6 items max)
- Maintain WCAG 2.1 AA accessibility standards throughout
- Follow orchestrator coordination patterns for multi-skill workflows
- Enforce phase gate requirements before progression
- Maintain Whitney font consistency across all components
