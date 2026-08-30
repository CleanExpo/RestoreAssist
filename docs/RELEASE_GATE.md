---
gate_version: 1.0.0
last_updated: 2026-08-25
linear_ticket: RA-4956
authority: Required for profile-scoped production go-live (web and mobile tracked separately)
---

# RestoreAssist Production Go-Live Gate

> **Rule:** RestoreAssist may only be declared live for a given release profile when that profile's gate score equals its profile max, no open P0/P1 release-blocker issues remain, and every applicable mandatory check is green. Anything less is **fail-closed**.

## Why this exists

Subjective release calls have caused premature "ready" claims in the past. This gate replaces judgement-by-vibe with a versioned, machine-verifiable score. Per [[ra-4956]].

## How to run it

```bash
nvm use
scripts/bootstrap-restoreassist-env.sh
npx --no-install tsx scripts/release-gate-score.ts --profile=web
npx --no-install tsx scripts/release-gate-score.ts --profile=web --json --strict
npx --no-install tsx scripts/release-gate-score.ts --profile=mobile --json --strict
```

If `--profile` is omitted, the scorer defaults to `mobile` for backward-compatible fail-closed behaviour.

CI currently runs `--profile=web --json --strict` against the release candidate. Output artifact: `release-gate-report.json`.

## Release profiles

- `web` — current production workflow. Applicable max: **85** points. Excludes the mobile-only App Store/TestFlight/App Review section E.
- `mobile` — retains the full **100** points and still requires E1-E3.

Profile omission does not award points: excluded criteria are removed from that profile's max score.

## The points (sections A-F)

### A) Product Correctness & Feature Integrity — 25 pts

| Pts | Criterion | Verification |
|---|---|---|
| 10 | All core user journeys pass E2E (signup/login, onboarding, storage setup, restore, inspection, claim, attestation, PDF) | Signed machine receipt from a criterion-specific verifier bound to the exact release SHA |
| 10 | Middleware/auth/paywall rules match spec under test | `npx vitest run lib/__tests__/middleware-*.test.ts` 0 failures |
| 5 | No Sev1/Sev2 defects open | Linear query: `team=RestoreAssist AND priority in (Urgent,High) AND state != Done` returns 0 |

### B) Automated Quality & CI Reliability — 20 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | `npm run lint` passes | Exit 0, ignoring known continue-on-error baseline ([[lint-debt-followup]]) |
| 5 | `npm run type-check` passes | Exit 0, 0 errors |
| 5 | Unit tests pass with 0 failures | `npx --no-install vitest run` — failing count == 0 |
| 5 | `npm run test:smoke:sandbox` passes with 0 failures | Playwright smoke against sandbox URL bound to the release SHA |

### C) Security & Compliance — 15 pts

| Pts | Criterion | Verification |
|---|---|---|
| 10 | `npm audit --omit=dev --audit-level=moderate` returns 0 moderate+ vulnerabilities | Exit 0 |
| 5 | Secrets scan + config sanity pass (no plaintext secrets, env-var completeness) | `gitleaks detect --no-banner --redact` exit 0 AND `.env.example` keys present in Vercel prod env |

### D) Billing & Paying-Customer Readiness — 15 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | Website Stripe sandbox purchase, renewal, cancellation verified | Owner evidence, bound to the release SHA. iOS checkout is intentionally blocked and does not earn points by omission |
| 5 | Paywall gating correctly enforces access by entitlement state | `npx --no-install vitest run lib/billing/__tests__/ app/api/webhooks/stripe/__tests__/` 0 failures |
| 5 | Revenue events tracked + reconciled (purchase, renewal, churn) | Owner evidence: Stripe events dashboard count == DB `subscription_events` count for last 7 days |

### E) App Store Launch Operations — 15 pts (`mobile` profile only)

| Pts | Criterion | Verification |
|---|---|---|
| 5 | App Store metadata/screenshots/privacy nutrition + age rating approved | Owner: Phill — App Store Connect screenshot of "Ready for Submission" state |
| 5 | TestFlight external build stable, crash-free sessions >= 99.5% | Owner evidence: App Store Connect / TestFlight crash dashboard for the build |
| 5 | App Review blockers = 0; release + rollback plan documented | Independently reviewed E3 evidence bound to the release SHA |

### F) Production Observability & Support — 10 pts

| Pts | Criterion | Verification |
|---|---|---|
| 5 | Monitoring/alerting for auth, billing webhook errors, restore failures | Vercel Observability alert rules configured (owner evidence remains blocked pending a trusted verifier) |
| 5 | Runbooks + support SLAs (P1 response ≤1h, customer comms template ready) | Deterministic repository verifier: `docs/MOBILE_RELEASE_RUNBOOK.md`, `docs/PILOT_CUTOVER_CHECKLIST.md`, `docs/SUPPORT_SLA.md`, and `docs/CUSTOMER_COMMS_TEMPLATE.md` with rollback tree + templates A-E + P1 ≤1h |

## Machine-verifiable vs blocked owner-evidence breakdown

- **Web profile machine-verifiable (50 / 85 pts):** A2 (10), all of B (20), C1 (10), D2 (5), and F2 (5).
- **Web profile reachable by signed receipt (15 / 85 pts):** C2 (5), A3 (5) and D3 (5), once a receipt signed by a trusted key is present. See "Signed receipts" below.
- **Web profile owner-evidence still blocked (20 / 85 pts):** A1 (10), D1 (5), and F1 (5).
- **Mobile-only blocked additions (15 / 100 pts):** E1-E3 remain required in the `mobile` profile and are excluded from the `web` profile.

Committed prose, screenshots, URLs and hashes of narrative evidence do not earn release points: they are self-attestable. The scorer validates their structure and freshness for diagnostics, then fails closed until each owner criterion has a signed, criterion-specific machine receipt producer and verifier. A1 requires signup, login, onboarding, storage setup, restore, inspection, claim, attestation and PDF observations. E3 requires App Review, release, rollback and reviewer observations. Freshness is aged from the stated date, never filesystem metadata.

### Signed receipts

The verifier this section used to call for now exists:
`scripts/ci/release-receipt.ts`, with its planted-defect controls in
`scripts/ci/__tests__/release-receipt.test.ts` and the producer in
`scripts/ci/sign-release-receipt.ts`. An owner criterion earns its points when
`<criterion>.receipt.json` sits beside the evidence file and verifies.

Three properties carry the scheme, and each has a test that fails without it:

1. **The trust root is not in this repository.** Public keys are read from the
   `RELEASE_RECEIPT_PUBLIC_KEYS` environment variable, which on Actions means a
   repository secret. A committed key would be worthless: anyone who can open a
   pull request could swap in a key they hold and sign their own receipts. The
   private half stays with the owner and must never be committed. Each key is
   scoped to the criteria it may sign:

   ```json
   {"<key-id>": {"publicKey": "<PEM>", "criteria": ["C2-secrets-scan"]}}
   ```

   Issue one key per producer. They run in different places with different
   blast radii, and a leaked key should reach only its own criterion. A bare
   `"<key-id>": "<PEM>"` is rejected rather than read as unscoped.
2. **Every absence fails closed.** No key set configured, an unknown key id, a
   key not authorised for the criterion it signed, or a criterion with no
   registered policy all score zero. A receipt file appearing in the repository
   moves nothing on its own.
3. **The signer cannot be handed a measurement.** It invokes the registered
   producer itself and signs what that returns. This is the fix for a P1 found
   by CodeRabbit reviewing #2109 after it merged: `sign-release-receipt.ts`
   previously took a `--measurements` argument and signed it unchanged, so a
   holder of a valid key could certify `openBlockerCount: 0` with no producer
   ever running, and every check below would pass. That is self-attestation
   with a signature on it — precisely what this scheme exists to replace.

   The flag was removed rather than validated: an input that must never be
   trusted should not exist. A criterion with no registered producer cannot be
   signed at all, which is why `C2-secrets-scan` currently cannot be.

4. **A receipt must come from the protected workflow.** Every receipt carries
   `provenance` — repository, workflow ref, run id, run attempt — straight from
   the Actions runtime, and the signer refuses to run outside Actions. The
   verifier requires `.github/workflows/release-receipt.yml@refs/heads/main`.

   The ref matters as much as the path: a pull request can edit that workflow
   file, so a receipt minted from a PR branch would prove nothing about what
   ran. Secrets live on the gated `release-receipts` environment, never as
   repository-wide secrets, which every workflow can read.

   Together with the key living only in that environment, this is what makes
   "holder of the key" mean "that workflow" rather than "whoever has the key".

5. **Measurements are re-derived where possible, and constrained where not.** A
   signature says who produced the bytes, never that they are true, so the
   verifier recomputes the release SHA, the source tree and the evidence digest
   against the checkout being scored. A receipt taken on a different tree is
   rejected even when its signature is perfect. The observed `environment` is
   checked against the criterion's policy, so C2 cannot claim to have been
   measured anywhere but CI.

   What remains is stated rather than papered over: a scanner's finding count
   is the producer's word, pinned to an exact tree. That residue is the reason
   these criteria need an accountable signer at all. A measurement CI can take
   unaided does not belong here — it belongs as a machine criterion, the way
   C1 and F2 already do.

That third property is why a signature alone cannot enable a criterion. Each
one needs a registered measurement check saying what "measured" means for it,
and a criterion absent from that registry cannot pass however good its key.

**Registered:**

- **C2-secrets-scan** — requires a `git-checkout-index` export rather than a
  working-directory scan (`gitleaks --no-git` ignores `.gitignore`), zero
  findings, and zero missing recommended environment variables.
- **A3-no-sev1-sev2-open** — produced by
  `scripts/ci/producers/a3-open-blockers.ts`, which counts open Urgent/High
  issues on Linear team RA. Every check on it answers a line of that
  criterion's own evidence file, which records how it once scored 5 points it
  had not earned:

  | Check | The failure it answers |
  | --- | --- |
  | `populationCount` must be positive | The recorded query named a project that did not exist. Linear answered "Could not find project", and the empty result read as zero blockers — "the absence of a measurement, in the way an unplugged smoke detector reports no smoke." |
  | `stateTypesScanned` must be all four open types | The old query scanned `state = started` only, so triage, backlog and unstarted blockers were invisible. |
  | `prioritiesScanned` must be `1,2` | Urgent alone does not answer a criterion about Urgent **and** High. |
  | `excludedProjects` must be exactly `Margot,Pi-Dev-Ops` | Exclusions can drive any count to zero. The RA-2232 scope verdict is pinned here, so widening it is a reviewed code change rather than a producer flag. |

  **A3 cannot pass yet, by design.** Linear personal API keys see only what
  their user sees and can be narrowed to particular teams, so `populationCount`
  proves the query returned *something*, never *everything* — a key without
  access to a private team reports a healthy population while omitting exactly
  the blockers living there. `A3_EXPECTED_VIEWER_ID` pins the Linear identity
  that may take the measurement, and is deliberately empty until the owner
  creates a service identity with verified read access across team RA. While it
  is empty the criterion fails closed, which is the honest state.

  The producer deliberately does **not** judge severity. Priority is not
  severity — an epic or a growth ticket can carry Urgent without being a
  customer-impacting defect, and that mismatch is why the criterion drifted.
  Reconciling the two is a human call made in Linear by downgrading the ticket.

- **D3-revenue-reconciliation** — produced by
  `scripts/ci/producers/d3-revenue-reconciliation.ts`, which reconciles live
  Stripe subscription events against the `SubscriptionEvent` rows the webhook
  wrote, over the current 7-day window. Observed in `production`, not `ci`:
  test-mode events are not revenue.

  | Check | Why |
  | --- | --- |
  | `stripeEventCount` must be positive | The evidence file states the trap outright: *"0 events on both sides reconciles, but it does NOT prove the pipeline works; it only proves nothing happened."* Two empty queries agreeing is an absent measurement. |
  | `missingInDb` must be 0, and `matchedInDb` must equal `stripeEventCount` | Equal totals are weak — five events on each side can be five **different** events, which is exactly what a partially-failing webhook produces. `SubscriptionEvent.stripeEventId` is `@unique`, so the ids are compared as sets. |
  | `windowEndsAt` must be current | A freely chosen window can be shopped for: an earlier week where the two sides happened to agree. |
  | `duplicateStripeIds` must be 0 | The `@unique` constraint should make this impossible; measuring it is how you learn the constraint still works. |
  | `dbEventsWithoutStripeId` must be 0 | Anything Stripe-originated carries an event id, so a row without one means something other than the webhook is writing revenue events. |
  | `failedWebhookDeliveries` must be 0 | The evidence file calls this "the most likely explanation for a shortfall on the DB side". The producer defaults it to `-1` when unsupplied, so an unmeasured value fails rather than passing as a silent zero. |

  The window is defined once on the Stripe side and the database is queried by
  event id rather than `createdAt`, which removes the boundary skew a two-sided
  time window creates. Tolerating those edge mismatches is where a real
  shortfall would hide.

**Still unregistered, and therefore still scoring zero:** A1, D1, F1
and E1-E3. Each needs a producer that can take its measurement without a human
retyping it -- a Linear query for A3, Stripe reconciliation for D3, an
instrumented end-to-end run for A1 -- plus its own measurement check and
planted-defect tests. **The web profile therefore still cannot reach 85/85, so
the release rule below still blocks.** This remains a release blocker, not an
operator checkbox.

## Release rule (fail-closed)

For the selected profile:

```text
score == profile_max  AND
no open P0/P1 release-blocker issues  AND
all applicable mandatory checks green in the latest required window
```

Any failed criterion = release blocked. No partial-credit overrides. To override, file a Linear ticket with Pi-CEO Board approval and link it in the gate run.

## Versioning

- `gate_version` is bumped when a criterion is added, removed, or reweighted.
- The scorer reads `gate_version` from this doc's frontmatter and stamps it on every report.
- A gate report with `gate_version` mismatch from current main is treated as stale.

## Evidence storage

- Machine reports: `release-gate-report.json` (CI artifact, retained 90 days)
- Owner evidence: committed to `docs/evidence/release-gate/<gate_version>/`
- Latest passing run also surfaced in Linear on RA-4956 as a status comment

## Related

- [[runbooks/digitalocean-production-release]] — protected manual production deployment procedure
- [[ra-4956]] — this ticket
- [[lint-debt-followup]] — known lint baseline (non-blocker)
- [[ra-4983]] — local test-DB bootstrap doc (improves criterion B5 reproducibility)
- [[ra-4984]] — middleware hard-paywall restoration (currently degrades A2 to "tests pass with .skip")

## Owner setup for signed receipts

Two steps, both deliberately outside any agent's reach.

**1. Create the keypair.** The public half is configuration; the private half
must never be committed or pasted anywhere but the secret store.

```bash
openssl genpkey -algorithm ed25519 -out release-signing.pem
openssl pkey -in release-signing.pem -pubout
```

**2. Create the `release-receipts` GitHub environment** and add these secrets
to *it*, not to repository-wide secrets:

| Secret | Value |
| --- | --- |
| `RELEASE_RECEIPT_PRIVATE_KEY` | the private PEM |
| `RELEASE_RECEIPT_PUBLIC_KEYS` | `{"<key-id>": {"publicKey": "<public PEM>", "criteria": ["A3-no-sev1-sev2-open"]}}` |
| `LINEAR_API_KEY` | a dedicated Linear service identity, not a personal key (A3) |
| `STRIPE_SECRET_KEY` | live key; the producer reads live/test from its prefix (D3) |
| `DATABASE_URL` | production database, read-only is sufficient (D3) |

Add required reviewers to the environment. Minting a receipt is an owner
action.

Then set `A3_EXPECTED_VIEWER_ID` in `scripts/ci/producers/a3-open-blockers.ts`
to that service identity's Linear `viewer.id`, as a reviewed code change.

Receipts are minted by running the **Release Receipt** workflow manually. It
measures, signs, verifies the result the way the scorer will, and only then
commits.
