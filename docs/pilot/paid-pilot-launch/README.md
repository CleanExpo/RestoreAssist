# RestoreAssist paid-pilot launch control centre

**Owner:** RestoreAssist release owner
**Last reviewed:** 2026-08-25
**Scope:** Three to five paying restoration businesses
**Canonical production origin:** `https://restoreassist.app`

This package turns the paid pilot into a controlled release, not an informal
customer trial. It does not authorise a deployment, customer contact, charge,
database change or production configuration change.

## Current launch state

**BLOCKED.** Do not invite or charge a pilot until every Gate 0 item in the
[operator runbook](./operator-runbook.md) is proven against one reviewed
release revision. In particular, the repository currently documents no
approved protected deployment or rollback workflow. See
[`docs/runbooks/digitalocean-production-release.md`](../../runbooks/digitalocean-production-release.md).

## Package contents

| File                                                                                                | Purpose                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [Operator runbook](./operator-runbook.md)                                                           | Ordered, fail-closed launch checklist                        |
| [Acceptance tests](./acceptance-tests.md)                                                           | Automated and live proof for six revenue-critical journeys   |
| [Acceptance manifest](./acceptance-manifest.json)                                                   | Machine-readable gate definition                             |
| [Onboarding and revenue](./onboarding-revenue-feedback.md)                                          | Three-to-five customer rollout, revenue and feedback capture |
| [Monitoring and rollback](./monitoring-rollback.md)                                                 | Stop, hold and rollback thresholds                           |
| [Evidence record](./pilot-evidence-record.md)                                                       | Per-release and per-customer proof template                  |
| [`scripts/pilot/run-paid-pilot-preflight.mjs`](../../../scripts/pilot/run-paid-pilot-preflight.mjs) | Read-only local preflight runner                             |

## Safe local commands

List the exact test plan without running it:

```bash
node scripts/pilot/run-paid-pilot-preflight.mjs --list
```

Validate this package and run its deterministic local tests:

```bash
node scripts/pilot/run-paid-pilot-preflight.mjs --run
```

The runner never contacts production, creates customers, invokes Stripe, sends
email, runs migrations or deploys. Live acceptance remains a separately
approved operator action.

## Success definition

The pilot succeeds only when:

1. One canary customer passes all six live journeys and remains inside every
   monitoring threshold for 24 hours.
2. Customers two and three pass the same evidence gates before use.
3. Customers four and five are added only after the first three remain green.
4. Collected subscription revenue reconciles exactly between Stripe and the
   RestoreAssist database.
5. No cross-tenant exposure, data loss, incorrect charge or open P0/P1 pilot
   blocker exists.
