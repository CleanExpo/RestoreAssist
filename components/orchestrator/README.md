# RestoreAssist Orchestrator Components

## Overview

This directory contains the Phase 1 components for the RestoreAssist Orchestrator workflow system. These components provide an intelligent, AI-powered workflow for generating IICRC-compliant restoration damage assessment reports.

## Components

### 1. QuickStartPanel

**File:** `QuickStartPanel.tsx`

A responsive panel displaying 4 input method cards for initiating the orchestrator workflow.

#### Features
- 4 input method options: Text Input, PDF Upload, Word Upload, Field App API
- Responsive grid layout (2x2 on mobile, 1x4 on desktop)
- Smooth Framer Motion animations with staggered card entrance (100ms delay)
- Hover effects with scale (1.02) and shadow elevation
- Status badges ("Most Common", "Coming Soon")
- Disabled state for unavailable methods
- WCAG 2.1 AA accessible with proper ARIA labels

#### Props
```typescript
interface QuickStartPanelProps {
  onMethodSelect?: (method: InputMethod) => void
  className?: string
}
```

#### Usage
```tsx
import { QuickStartPanel } from '@/components/orchestrator'

<QuickStartPanel
  onMethodSelect={(method) => console.log(method)}
/>
```

#### Card Specifications
- **Size:** 240px width × 200px height
- **Icon:** 48px (12px when displayed)
- **Colors:** Gradient backgrounds matching phase colors
- **Typography:**
  - Title: text-lg (18px), font-semibold
  - Description: text-sm (14px)
  - Badge: text-xs (12px), font-medium

---

### 2. PhaseProgressBar

**File:** `PhaseProgressBar.tsx`

A horizontal stepper component showing progress through the 4 orchestrator phases.

#### Features
- 4 workflow phases with distinct colors:
  - **Initiation** (Blue #2563EB)
  - **Processing** (Purple #9333EA)
  - **Q&A** (Cyan #06B6D4)
  - **Output** (Emerald #10B981)
- Phase states: Complete (checkmark), Active (pulsing loader), Upcoming (gray)
- Animated progress bar with gradient
- Progress percentage display
- Estimated time remaining
- Mobile-responsive with condensed view
- Smooth transitions with Framer Motion

#### Props
```typescript
interface PhaseProgressBarProps {
  progress: PhaseProgress
  className?: string
  showDetails?: boolean
}

interface PhaseProgress {
  currentPhase: OrchestratorPhase
  completedPhases: OrchestratorPhase[]
  progressPercentage: number
  estimatedTimeRemaining?: string
}
```

#### Usage
```tsx
import { PhaseProgressBar } from '@/components/orchestrator'

<PhaseProgressBar
  progress={{
    currentPhase: 'processing',
    completedPhases: ['initiation'],
    progressPercentage: 45,
    estimatedTimeRemaining: '5 min'
  }}
  showDetails={true}
/>
```

#### Phase Colors
```typescript
const PHASE_COLORS = {
  initiation: { DEFAULT: '#2563EB', light: '#DBEAFE', dark: '#1E3A8A' },
  processing: { DEFAULT: '#9333EA', light: '#F3E8FF', dark: '#581C87' },
  qa: { DEFAULT: '#06B6D4', light: '#CFFAFE', dark: '#164E63' },
  output: { DEFAULT: '#10B981', light: '#D1FAE5', dark: '#064E3B' }
}
```

---

### 3. Type Definitions

**File:** `types.ts`

Comprehensive TypeScript type definitions for all orchestrator components.

#### Key Types

```typescript
// Input methods
type InputMethod = 'text' | 'pdf' | 'word' | 'api'

// Phase types
type OrchestratorPhase = 'initiation' | 'processing' | 'qa' | 'output'
type PhaseState = 'complete' | 'active' | 'upcoming'

// Workflow status
type WorkflowStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

// Statistics
interface OrchestratorStats {
  activeProcesses: number
  completedToday: number
  averageTimePerReport: string
  iicrcCompliantPercentage: number
}
```

See `types.ts` for complete type definitions.

---

## Dashboard Integration

### Updated Dashboard Features

The main dashboard page (`app/dashboard/page.tsx`) has been updated with:

1. **Hero Section Updates**
   - Changed badge from "Premium" to "AI-Powered Orchestrator"
   - Updated CTA button to "Start New Assessment" with PlayCircle icon
   - Opens QuickStartPanel modal on click

2. **Orchestrator Stats Cards**
   - Active Processes
   - Completed Today
   - Average Time Per Report
   - IICRC Compliant %
   - Each with trend indicators

3. **Active Workflows Section**
   - Shows active workflows with PhaseProgressBar
   - Empty state with CTA to start new assessment
   - Detailed view for primary workflow
   - Condensed cards for additional workflows

4. **QuickStart Modal**
   - Full-screen overlay with backdrop blur
   - Spring animation on open
   - Click outside to close
   - ESC key support (browser default)

## Design System

### Colors

**Phase Colors:**
```css
Initiation:  #2563EB (Blue)
Processing:  #9333EA (Purple)
Q&A:         #06B6D4 (Cyan)
Output:      #10B981 (Emerald)
```

**UI Colors:**
```css
Background:     slate-50 / slate-950 (dark)
Cards:          white / slate-800/50 (dark)
Borders:        slate-200 / slate-700/50 (dark)
Text Primary:   slate-900 / white (dark)
Text Secondary: slate-600 / slate-400 (dark)
```

### Typography

**Font Families:**
- **Headings:** Titillium Web (from existing theme)
- **Body:** System default

**Sizes:**
- Hero Title: text-3xl (36px), md:text-4xl (48px)
- Section Headers: text-2xl (24px)
- Card Titles: text-lg (18px)
- Body Text: text-sm (14px)
- Labels: text-xs (12px)

### Spacing

- Card padding: p-6 (24px) or p-8 (32px) for larger cards
- Grid gap: gap-4 (16px) to gap-8 (32px)
- Section spacing: space-y-8 (32px)

### Animations

**Framer Motion Settings:**
```typescript
// Fade in
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.4, delay: index * 0.1 }}

// Hover scale
whileHover={{ scale: 1.02, y: -4 }}
whileTap={{ scale: 0.98 }}

// Pulsing (active phase)
animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
transition={{ duration: 2, repeat: Infinity }}
```

## Responsive Breakpoints

```typescript
Mobile:   < 768px  (grid-cols-1, md:grid-cols-2)
Tablet:   768px+   (md:grid-cols-2)
Desktop:  1024px+  (lg:grid-cols-4)
```

## Accessibility Features

### WCAG 2.1 AA Compliance

1. **Keyboard Navigation**
   - All interactive elements are focusable
   - Tab order follows visual flow
   - Enter/Space activates buttons

2. **ARIA Labels**
   - Input method cards have descriptive aria-labels
   - Progress indicators have aria-live regions
   - Phase states are announced to screen readers

3. **Color Contrast**
   - All text meets WCAG AA standards (4.5:1 minimum)
   - Status badges use sufficient contrast
   - Disabled states are clearly indicated

4. **Focus Management**
   - Modal traps focus when open
   - Focus returns to trigger on close
   - Visible focus indicators on all elements

## Performance Optimizations

1. **Code Splitting**
   - Components are lazy-loadable
   - Modal only renders when needed

2. **Animation Performance**
   - GPU-accelerated transforms
   - Will-change hints for animations
   - Reduced motion support (browser default)

3. **Bundle Size**
   - Tree-shakeable exports
   - No unnecessary dependencies
   - Optimized icon imports

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- iOS Safari 14+
- Android Chrome 90+

## Future Enhancements (Phase 2+)

- [ ] Real-time progress updates via WebSocket
- [ ] Workflow pause/resume functionality
- [ ] Export workflow analytics
- [ ] Custom input method plugins
- [ ] Workflow templates
- [ ] Collaborative workflows
- [ ] Mobile app integration
- [ ] Voice input support

## Testing

### Component Testing
```bash
# Run unit tests (when implemented)
npm run test

# Run e2e tests (when implemented)
npm run test:e2e
```

### Manual Testing Checklist

- [ ] All input method cards display correctly
- [ ] Hover effects work smoothly
- [ ] Modal opens/closes properly
- [ ] Progress bar animates correctly
- [ ] All phases display with correct colors
- [ ] Responsive layout works on mobile
- [ ] Dark mode displays correctly
- [ ] Keyboard navigation works
- [ ] Screen reader announces states
- [ ] No console errors
- [ ] Performance is smooth (60fps)

## Troubleshooting

### Common Issues

**Components not displaying:**
- Check import paths use `@/components/orchestrator`
- Verify Framer Motion is installed: `npm install framer-motion`
- Ensure lucide-react is installed: `npm install lucide-react`

**TypeScript errors:**
- Run `npm run type-check` to identify issues
- Ensure all types are imported from `@/components/orchestrator/types`

**Styling issues:**
- Verify Tailwind config includes `components/**/*.{ts,tsx}`
- Check dark mode is enabled in Tailwind config: `darkMode: 'class'`

## Contributing

When adding new orchestrator components:

1. Follow existing naming conventions
2. Add comprehensive TypeScript types to `types.ts`
3. Include JSDoc comments for all props
4. Add usage examples in component comments
5. Test in both light and dark modes
6. Verify mobile responsiveness
7. Update this README

## License

Proprietary - RestoreAssist Platform
