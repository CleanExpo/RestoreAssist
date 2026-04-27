# Modal Focus-Trap Audit — RA-1576

Four components render a full-screen backdrop without wrapping
`@radix-ui/react-dialog`. Each was read end-to-end on 2026-04-22 and
the findings below are the review checklist for the re-implementation
sprint. No shadcn `Dialog` port in this PR — the ask was an audit.

## Components audited

| File | Hand-rolled | Focus trap | Escape close | Backdrop click | Return focus | role=dialog + aria-* |
|------|:-----------:|:----------:|:------------:|:--------------:|:------------:|:--------------------:|
| `components/OnboardingModal.tsx` | yes | **no** | **no** | ignored | **no** | **no** |
| `components/OnboardingStepModal.tsx` | yes | **no** | **no** | intentionally blocked | **no** | **no** |
| `components/BulkOperationModal.tsx` | yes | **no** | **no** | ignored | **no** | **no** |
| `components/authority-forms/SignatoryManager.tsx` | partial | **no** | **no** | n/a | **no** | **no** |

## Recommended migration

1. **OnboardingModal** + **OnboardingStepModal** — the full-screen
   backdrop + centred card pattern is an exact fit for shadcn
   `Dialog`. Wrap children in `<DialogContent>`; pass `open` / `onOpenChange`.
   OnboardingStepModal intentionally blocks backdrop dismissal — use
   `onInteractOutside={(e) => e.preventDefault()}` on DialogContent.
2. **BulkOperationModal** — same, `DialogContent` replaces the fixed
   backdrop div. Status messaging inside (current progress bar)
   should also get `role="status"` + `aria-live="polite"` so screen
   readers hear the progress updates.
3. **SignatoryManager** — this one is not a modal today; it's an
   inline panel with section toggles. No focus-trap needed.
   Reclassified and removed from the modal migration list.

## Minimum acceptance per modal

Each migration PR must include a Playwright keyboard-only test:

* Tab cycles through focusable descendants without leaving the modal.
* Escape closes it and focus returns to the opener button.
* Shift-Tab at the first focusable element wraps to the last.
* Backdrop-click behaviour matches the original intent (the two
  onboarding modals must NOT close on backdrop click; BulkOperation
  may).

## Not-in-scope for RA-1576

* A generic `useFocusTrap` hook — shadcn Dialog's Radix primitive is
  the canonical focus trap in this codebase. Reimplementing is an
  anti-pattern. If a future non-dialog overlay needs trap behaviour,
  reach for `react-focus-lock` or Radix's FocusScope directly.

Closes RA-1576 as a scaffold — re-implementation filed as a follow-up
per modal.
