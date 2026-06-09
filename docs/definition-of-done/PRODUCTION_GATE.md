# RestoreAssist Production / External Gate

## Rule
Local readiness never authorizes production action.

## Explicitly gated actions
- production DB reads/writes
- Supabase or psql access
- live migration
- deployment or production release
- OP / 1Password retry or secret retrieval
- email sending
- Stripe/payment action
- claim/order action
- public publishing
- browser automation or Computer Use

## Safe in this batch
- local docs/specs/evidence
- static route/test/evidence mapping
- local type-check/lint/test commands
- DoD coverage recalculation from local files
- Git/PR workflow under green-gate policy

## Completion claim requirement
Any claim that RestoreAssist is production-ready must include a separate Founder / Board decision naming the production action approved. This document only closes the local explicit-gate evidence gap.
