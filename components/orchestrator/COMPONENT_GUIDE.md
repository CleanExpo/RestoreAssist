# Orchestrator Components - Quick Reference Guide

## Component Hierarchy

```
Dashboard Page
│
├── Hero Section
│   └── "Start New Assessment" Button
│       └── Opens QuickStartPanel Modal
│
├── Stats Grid (4 cards)
│   ├── Active Processes
│   ├── Completed Today
│   ├── Avg Time Per Report
│   └── IICRC Compliant %
│
├── Active Workflows Section
│   ├── Primary Workflow Card
│   │   └── PhaseProgressBar (detailed)
│   │
│   └── Secondary Workflow Cards (2)
│       └── Compact progress indicators
│
└── QuickStartPanel Modal (when open)
    ├── Header
    ├── 4 Input Method Cards
    │   ├── Text Input
    │   ├── PDF Upload
    │   ├── Word Upload
    │   └── Field App API
    └── Cancel Button
```

---

## QuickStartPanel Anatomy

```
┌─────────────────────────────────────────────────────────────┐
│  ✨ Start New Assessment                                    │
│  Choose your preferred input method to begin...             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐          │
│  │  📝    │  │  📄    │  │  📋    │  │  🔌    │          │
│  │ [Icon] │  │ [Icon] │  │ [Icon] │  │ [Icon] │          │
│  │        │  │        │  │        │  │        │          │
│  │ Text   │  │  PDF   │  │ Word   │  │ Field  │          │
│  │ Input  │  │ Upload │  │ Upload │  │  App   │          │
│  │        │  │        │  │        │  │  API   │          │
│  │Type or │  │Upload  │  │Import  │  │Connect │          │
│  │paste...│  │PDF...  │  │Word... │  │field...│          │
│  │        │  │        │  │        │  │        │          │
│  │[Badge] │  │        │  │        │  │[Badge] │          │
│  │Most    │  │        │  │        │  │Coming  │          │
│  │Common  │  │        │  │        │  │Soon    │          │
│  └────────┘  └────────┘  └────────┘  └────────┘          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ℹ️ Tip: All methods support IICRC-compliant reporting     │
└─────────────────────────────────────────────────────────────┘
```

### Card States:

**Default:**
```
┌────────┐
│  Icon  │  White bg, border
│ Title  │  No elevation
│  Desc  │
└────────┘
```

**Hover:**
```
┌────────┐
│  Icon  │  Scale 1.02
│ Title  │  Shadow elevation
│  Desc  │  Border brightens
│   ↑    │  Hint arrow appears
└────────┘
```

**Disabled:**
```
┌────────┐
│  Icon  │  Opacity 60%
│ Title  │  Cursor not-allowed
│  Desc  │  Grayscale filter
└────────┘
```

---

## PhaseProgressBar Anatomy

### Desktop View:

```
Workflow Progress                                    45% | ⏱ 5 min remaining

○━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○
                     ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒

     ●              ◉              ○              ○
  Initiation    Processing        Q&A          Output
   Complete     In Progress     Pending        Pending
```

### Mobile View:

```
Workflow Progress                    45%

○━━━━━━━━━━━━━━━━━━━○
        ▒▒▒▒▒

  ●      ◉      ○      ○
Init   Proc    Q&A   Output

┌─────────┬─────────┐
│ ✓ Init  │ ⟳ Proc │
│ Complete│Progress │
├─────────┼─────────┤
│ ○ Q&A   │ ○ Output│
│ Pending │ Pending │
└─────────┴─────────┘
```

### Phase Icons:

**Complete (✓):**
- Green checkmark in gradient circle
- Solid background color
- White icon

**Active (⟳):**
- Spinning loader icon
- Pulsing animation
- Phase-specific color
- Outer ring animation

**Upcoming (○):**
- Gray circle outline
- No icon
- Reduced opacity

---

## Color System

### Phase Colors with Context:

**Initiation (Blue):**
```
Primary:  #2563EB  ███  (Main icon, active state)
Light:    #DBEAFE  ░░░  (Background, hover)
Dark:     #1E3A8A  ▓▓▓  (Gradient end, dark mode)
```

**Processing (Purple):**
```
Primary:  #9333EA  ███  (Main icon, active state)
Light:    #F3E8FF  ░░░  (Background, hover)
Dark:     #581C87  ▓▓▓  (Gradient end, dark mode)
```

**Q&A (Cyan):**
```
Primary:  #06B6D4  ███  (Main icon, active state)
Light:    #CFFAFE  ░░░  (Background, hover)
Dark:     #164E63  ▓▓▓  (Gradient end, dark mode)
```

**Output (Emerald):**
```
Primary:  #10B981  ███  (Main icon, active state)
Light:    #D1FAE5  ░░░  (Background, hover)
Dark:     #064E3B  ▓▓▓  (Gradient end, dark mode)
```

---

## Animation Timeline

### QuickStartPanel Entry:
```
0ms    ─── Modal backdrop fades in
100ms  ─── Modal scales up (spring)
200ms  ─── Header appears
300ms  ─── Card 1 slides up
400ms  ─── Card 2 slides up
500ms  ─── Card 3 slides up
600ms  ─── Card 4 slides up
700ms  ─── Tip box fades in
```

### Card Hover:
```
0ms    ─── Scale starts (1.0 → 1.02)
100ms  ─── Icon rotates 5°
200ms  ─── Shadow elevates
300ms  ─── Hint appears
```

### PhaseProgressBar Active State:
```
Loop (2s):
0ms    ─── Pulse scale 1.0, opacity 0.5
1000ms ─── Pulse scale 1.2, opacity 1.0
2000ms ─── Pulse scale 1.0, opacity 0.5
[repeat]
```

---

## Responsive Breakpoints

### Mobile (< 768px):
```
QuickStartPanel:
┌──────────────┐
│   Card 1    │
├──────────────┤
│   Card 2    │
├──────────────┤
│   Card 3    │
├──────────────┤
│   Card 4    │
└──────────────┘

PhaseProgressBar:
[Condensed grid view]
```

### Tablet (768px - 1024px):
```
QuickStartPanel:
┌────────┬────────┐
│ Card 1 │ Card 2 │
├────────┼────────┤
│ Card 3 │ Card 4 │
└────────┴────────┘

PhaseProgressBar:
[Full horizontal view]
```

### Desktop (> 1024px):
```
QuickStartPanel:
┌────┬────┬────┬────┐
│ C1 │ C2 │ C3 │ C4 │
└────┴────┴────┴────┘

PhaseProgressBar:
[Full horizontal with details]
```

---

## State Management Examples

### Opening QuickStart:
```typescript
// Dashboard component
const [showQuickStart, setShowQuickStart] = useState(false)

// Hero button click
<button onClick={() => setShowQuickStart(true)}>
  Start New Assessment
</button>

// Modal
{showQuickStart && (
  <QuickStartPanel onMethodSelect={handleSelect} />
)}
```

### Tracking Progress:
```typescript
// Workflow state
const [progress, setProgress] = useState<PhaseProgress>({
  currentPhase: 'initiation',
  completedPhases: [],
  progressPercentage: 0,
  estimatedTimeRemaining: '10 min'
})

// Update on phase change
const handlePhaseComplete = (phase: OrchestratorPhase) => {
  setProgress(prev => ({
    ...prev,
    completedPhases: [...prev.completedPhases, phase],
    currentPhase: getNextPhase(phase),
    progressPercentage: calculateProgress(phase)
  }))
}
```

---

## Common Use Cases

### 1. Starting a Workflow:
```typescript
import { QuickStartPanel, InputMethod } from '@/components/orchestrator'

const handleMethodSelect = (method: InputMethod) => {
  // Log selection
  console.log('Selected:', method)

  // Navigate to workflow
  router.push(`/dashboard/workflow/${method}`)

  // Or show inline form
  setShowInputForm(true)
  setInputMethod(method)
}

<QuickStartPanel onMethodSelect={handleMethodSelect} />
```

### 2. Displaying Progress:
```typescript
import { PhaseProgressBar, PhaseProgress } from '@/components/orchestrator'

// From API or state
const workflowProgress: PhaseProgress = {
  currentPhase: 'processing',
  completedPhases: ['initiation'],
  progressPercentage: 45,
  estimatedTimeRemaining: '5 min'
}

<PhaseProgressBar progress={workflowProgress} showDetails={true} />
```

### 3. Empty State:
```typescript
// When no active workflows
{activeWorkflows.length === 0 ? (
  <div className="empty-state">
    <p>No Active Workflows</p>
    <button onClick={() => setShowQuickStart(true)}>
      Start New Assessment
    </button>
  </div>
) : (
  activeWorkflows.map(workflow => (
    <PhaseProgressBar key={workflow.id} progress={workflow.progress} />
  ))
)}
```

---

## Accessibility Quick Reference

### Keyboard Navigation:
- `Tab`: Move between cards/elements
- `Enter/Space`: Activate selected card
- `Esc`: Close modal (when implemented)

### ARIA Attributes:
```tsx
// Input method card
<button
  aria-label="Select Text Input input method"
  aria-disabled={!enabled}
  role="button"
>

// Progress phase
<div
  role="progressbar"
  aria-valuenow={45}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="Workflow progress at 45%"
>
```

### Screen Reader Announcements:
- "Initiation phase complete"
- "Currently processing, 45% complete"
- "Estimated time remaining: 5 minutes"

---

## Performance Tips

### Optimizing Renders:
```typescript
// Memoize static data
const inputMethods = useMemo(() => [...], [])

// Memoize callbacks
const handleSelect = useCallback((method) => {
  // Handler logic
}, [dependencies])

// Lazy load modal
const QuickStartPanel = lazy(() => import('./QuickStartPanel'))
```

### Animation Performance:
```tsx
// Use transform/opacity for GPU acceleration
<motion.div
  animate={{ scale: 1.02, opacity: 1 }}  // ✓ GPU accelerated
  // NOT: { marginTop: -10 }               // ✗ CPU bound
/>
```

---

## Troubleshooting

### Issue: Cards not displaying
**Check:**
- Import path: `@/components/orchestrator`
- File structure matches expected
- No TypeScript errors

### Issue: Animations laggy
**Check:**
- Using transform/opacity (not margin/width)
- Too many elements animating simultaneously
- Browser DevTools performance tab

### Issue: Dark mode colors wrong
**Check:**
- `dark:` prefix on Tailwind classes
- CSS variable values in globals.css
- Color contrast meets WCAG standards

---

## Quick Copy-Paste Templates

### Basic Implementation:
```tsx
import { QuickStartPanel, PhaseProgressBar } from '@/components/orchestrator'
import type { InputMethod, PhaseProgress } from '@/components/orchestrator/types'

export default function MyPage() {
  const handleMethodSelect = (method: InputMethod) => {
    console.log('Selected:', method)
  }

  const progress: PhaseProgress = {
    currentPhase: 'processing',
    completedPhases: ['initiation'],
    progressPercentage: 45,
    estimatedTimeRemaining: '5 min'
  }

  return (
    <div>
      <QuickStartPanel onMethodSelect={handleMethodSelect} />
      <PhaseProgressBar progress={progress} />
    </div>
  )
}
```

---

**For more details, see:**
- Full documentation: `README.md`
- Type definitions: `types.ts`
- Implementation summary: `../ORCHESTRATOR_IMPLEMENTATION_SUMMARY.md`
