# RestoreAssist API Dependency Map for Completion Claims

## Rule
Any RestoreAssist-facing API dependency must have route/test/evidence mapping before being used in a project-completion claim.

## Local mapping expectations
| Dependency type | Required route/source pointer | Required validation | Required evidence |
|---|---|---|---|
| Auth/session | route or middleware source | type-check, focused test, or explicit static review | evidence packet |
| Reports/inspections | API route/source pointer | route test or static route map | evidence packet |
| AI/media/voice | service module/source pointer | unit/static validation and subscription gate review | integration-boundary evidence |
| Billing/payment | route/source pointer | test evidence only; no live Stripe action in local batch | Board-gated evidence |
| Data/Supabase | schema/source pointer only | no production DB or psql in local batch | gated evidence |

## This batch
This batch creates the mapping requirement and evidence pointer. It does not exercise live APIs or external systems.
