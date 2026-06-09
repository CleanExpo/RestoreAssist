# RestoreAssist Owner / Approver Model

## Owner roles
- Product owner: Founder / Board / Unite-Group Nexus product owner.
- Execution owner: Senior PM for local DoD gap closure.
- Engineering owner: implementation lead for code changes when separately approved.

## Completion claim rule
A RestoreAssist completion claim is valid only when:
1. Project DoD coverage is reconciled by the engine.
2. false-done prevention remains active.
3. Evidence pointers exist for each requirement.
4. Validation evidence is attached.
5. Founder / Board has accepted any human-gated readiness claim.

## Hard gates requiring named approval
Production DB, Supabase/psql, migrations, deployment, OP/1Password, secrets, external integrations, email, Stripe/payments, claims/orders, public publishing, and production release.
