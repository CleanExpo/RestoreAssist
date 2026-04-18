#!/usr/bin/env node
// Batch-create Linear epic + 20 child tickets for the Progress Framework.
// Writes results to .claude/swarm/progress-tickets.json
//
// Usage: node scripts/create-progress-tickets.mjs
// Env:   LINEAR_KEY optional — falls back to hardcoded key from memory.

import { writeFile } from "fs/promises";

const KEY = process.env.LINEAR_KEY;
if (!KEY) {
  console.error(
    "LINEAR_KEY env var required. Export your Linear API key before running.",
  );
  process.exit(1);
}
const TEAM = "a8a52f07-63cf-4ece-9ad2-3e3bd3c15673";
const PROJECT = "3c78358a-b558-4029-b47d-367a65beea7b";
const TODO = "285c7d2f-d5f4-4ae1-8e3a-bc96c9aaf130";

async function gql(query, variables) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Linear error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function createIssue({ title, description, parentId }) {
  const input = {
    teamId: TEAM,
    projectId: PROJECT,
    stateId: TODO,
    title,
    description,
    ...(parentId ? { parentId } : {}),
  };
  const data = await gql(
    `mutation($input: IssueCreateInput!) {
       issueCreate(input: $input) {
         success
         issue { id identifier url title }
       }
     }`,
    { input },
  );
  if (!data.issueCreate.success) {
    throw new Error("Issue create returned success=false");
  }
  return data.issueCreate.issue;
}

const EPIC_DESC = `Umbrella epic for the Progress Framework. Board minutes signed 2026-04-18. Motions M-1..M-21 approved (M-12 deferred to Sprint-1 review; M-20 amended with manager-review-flag).

See:
- .claude/board-2026-04-18/00-board-minutes.md — full board minutes + RACI + retention schedule
- .claude/board-2026-04-18/strategic-moat-rollout.md — 20-move rollout plan (grandmaster strategy)
- work-together.md — multi-PC coordination protocol (Linear = single source of truth for ownership)
- .claude/swarm/architecture.md — swarm hierarchy + 11 PM roster + 18 named specialists

All child tickets are claimed via the [CLAIM] comment protocol in work-together.md §2. Default PC ownership is annotated per child; either PC may claim any ticket by posting [CLAIM] + [COORD] if deviating from default.

PC1-orchestrator and PC2-orchestrator execute in parallel per .claude/swarm/architecture.md. Hard caps: 3 PMs concurrent, 5 specialists per PM, 15 agents per PC.

**Phase A (silent infrastructure) begins immediately on M-1..M-5, M-21 landing.**`;

const MOTIONS = [
  {
    m: "M-1",
    owner: "PC1",
    title: "Adopt unified 15-state Progress framework",
    body: `Adopt the 15-state machine from Architect paper §3 with human-readable stage labels from Ops Director paper §2.

States: INTAKE, STABILISATION_ACTIVE, WHS_HOLD, STABILISATION_COMPLETE, SCOPE_DRAFT, SCOPE_APPROVED, DRYING_ACTIVE, VARIATION_REVIEW, DRYING_CERTIFIED, CLOSEOUT, INVOICE_ISSUED, INVOICE_PAID, DISPUTED, CLOSED, WITHDRAWN.

Scope: documentation + ClaimState enum in schema (lands with M-5).`,
  },
  {
    m: "M-2",
    owner: "PC1",
    title: "Adopt Stage × Required Evidence matrix as data contract",
    body: `The evidence contract in board minutes §5.2. Translates to guard functions in lib/progress/state-machine.ts.

Scope: reference doc at .claude/board-2026-04-18/stage-evidence-contract.md + guard function stubs.`,
  },
  {
    m: "M-3",
    owner: "PC1",
    title: "Adopt RACI matrix as authorisation contract",
    body: `RACI in board minutes §5.3. Translates to lib/progress/permissions.ts canPerformTransition(role, state, transitionKey).

Scope: permissions module + unit tests.`,
  },
  {
    m: "M-4",
    owner: "PC1",
    title: "Adopt 8 foundational principles as engineering constraints",
    body: `Board minutes §6 principles: cryptographic chain-of-custody, append-only audit, evidence-gated promotion, offline-first, role-based disclosure, immutable attestation, deterministic integration fan-out, engagement-time licence verification.

Scope: addendum to .claude/STANDARDS.md + CLAUDE.md rule additions (rule 21+).`,
  },
  {
    m: "M-5",
    owner: "PC1",
    title:
      "Add ClaimProgress + ProgressTransition + ProgressAttestation Prisma models (additive)",
    body: `Purely additive schema per Architect paper §4. No existing model columns change. New ClaimState enum. One-to-one back-relations on Report and Inspection.

Scope: prisma/schema.prisma edits + migration via npx prisma migrate dev --name add_progress_framework.

Hot file: prisma/schema.prisma — single-writer claim required.`,
  },
  {
    m: "M-6",
    owner: "PC1",
    title:
      "Carrier variation threshold 20% / AUD 2500 with per-carrier override",
    body: `Claims paper §4 threshold. Configurable via ClaimProgress.carrierVariationThresholdPercent (nullable, default 20). Absolute dollar floor AUD 2,500 applies alongside percentage.

Scope: schema field + variation guard function.`,
  },
  {
    m: "M-7",
    owner: "PC1",
    title: "Six schema tightenings from Ops Director war stories",
    body: `Tightenings:
1. MakeSafeAction.completed OR applicable=false+reason (no nulls)
2. ScopeVariation.authorisationSource enum (CARRIER_EMAIL, CARRIER_PORTAL, DOCUSIGN, PHONE_THEN_EMAIL_FOLLOWUP, EMERGENCY_SELF)
3. MoistureReading.isBaseline + isMonitoringPoint booleans
4. EnvironmentalData time-series conversion
5. New Authorisation model for engagement-time licence/insurance verification
6. Estimate requires linked Scope (FK + guard)

Scope: migration + backfill script + updated creation routes.

Hot file: prisma/schema.prisma — single-writer claim required.`,
  },
  {
    m: "M-8",
    owner: "Either",
    title:
      "Revise /privacy §5 retention schedule to class-based per board minutes §7",
    body: `Current 7-year blanket is shorter than QLD structural (6y6mo from completion) and dust-disease (indefinite under Dust Diseases Act 1942 NSW + analogues).

Scope: app/privacy/page.tsx update with per-class retention table + solicitor review brief prepared.

**Live legal exposure on production — prioritise.**`,
  },
  {
    m: "M-9",
    owner: "Either",
    title:
      "Revise /terms §10 90-day deletion to honour limitation-period retention",
    body: `Current wording conflicts with M-8. Must reference the class-based schedule; 90-day blanket deletion removed.

Scope: app/terms/page.tsx update alongside M-8.

**Live legal exposure on production — prioritise.**`,
  },
  {
    m: "M-10",
    owner: "PC2",
    title:
      "C2PA-style photo manifest (SHA-256 + UTC + GPS + device + user hash)",
    body: `Legal paper §4 chain-of-custody minimum. Implement at capture time (mobile Capacitor) and verify at read time on server.

Scope: lib/evidence/c2pa-manifest.ts + integration into Cloudinary upload flow + read-side verifier at evidence export time.`,
  },
  {
    m: "M-11",
    owner: "PC1",
    title: "Progress stages drive GST/finance events per board minutes §5.2",
    body: `Extends existing lib/gst-treatment-rules.ts (RA-875) and lib/billing-completeness-check.ts (RA-876). No GST rules re-implemented.

Scope: lib/progress/integrations/xero.ts that fires on issue_invoice / record_payment transitions. Maps stage-transition events to Xero actions via the existing integration.`,
  },
  {
    m: "M-13",
    owner: "PC2",
    title:
      "Labour-hire per-job attestation (hours, SG 12%, portable LSL, award, induction)",
    body: `Accounting paper labour-hire capture matrix. Attaches to ProgressAttestation when attestor role is LABOUR_HIRE. Captures: hours worked, award classification, super SG 12% from 1 Jul 2025, portable LSL applicability by state, safety induction proof.

Scope: attestation schema field + UI capture flow + Fair Work compliance check.`,
  },
  {
    m: "M-14",
    owner: "PC2",
    title: "16-gate hard/soft/audit classification from UX paper",
    body: `Product-UX paper §5 gate catalogue. Hard-block the carrier-authority and legal-evidence gates; soft-nudge calibration/nice-to-have; audit-only the informational.

Scope: gate policy config lib/progress/gate-policy.ts + UI wiring + per-gate telemetry events.`,
  },
  {
    m: "M-15",
    owner: "PC2",
    title: "Monthly 5% override governance review (telemetry-fed)",
    body: `UX paper §5 safeguard: any hard-block gate with override/workaround rate >5% surfaces to the board for re-classification or upstream workflow fix.

Scope: telemetry funnel + monthly report cron + board dashboard surface.

Depends on M-17 telemetry landing.`,
  },
  {
    m: "M-16",
    owner: "PC2",
    title: "Ring-fence Junior Technician role — evidence-only, no transitions",
    body: `UX paper motion. Juniors cannot call /api/progress/[id]/transition with the attest_* transitionKeys. They contribute evidence (photos, readings) but cannot promote stages.

Scope: permissions extension in lib/progress/permissions.ts + UI progressive disclosure (TransitionButton component hides/disables for juniors).`,
  },
  {
    m: "M-17",
    owner: "PC2",
    title: "Telemetry ship-blocker (8 events, 4 funnels, 2 board KPIs)",
    body: `UX paper §8 telemetry spec.

8 events: progress.transition.attempt, .success, .blocked, .override, .attestation.captured, .evidence.missing, .offline.queued, .offline.synced.
4 funnels: stabilisation, scope, drying, invoice.
2 KPIs: time-to-invoice, override rate.

Scope: lib/telemetry/progress.ts + dashboard component + no Progress rollout without this live.`,
  },
  {
    m: "M-18",
    owner: "Either",
    title:
      "Carrier integration working group (Guidewire + DocuSign procurement)",
    body: `Architect paper Motion 2. Procure API credentials + accounts for:
- Guidewire ClaimCenter (reserve update + attest_stabilisation submission)
- DocuSign eSign API (attestation envelopes)

Scope: non-code — comms, SOW, credential provisioning. Credentials land in Vercel env under GUIDEWIRE_* and DOCUSIGN_*.

Blocks M-19 and M-11 Xero-adjacent DocuSign flows.`,
  },
  {
    m: "M-19",
    owner: "PC1",
    title:
      "Stabilisation Authority Packet prototype (Guidewire + Tier-2 pilot)",
    body: `Claims paper Motion 3. End-to-end prototype of attest_stabilisation → carrier submission, tested against Guidewire sandbox + one Tier-2 insurer (Youi or Hollard) pilot.

Scope: lib/progress/integrations/stabilisation-packet.ts + e2e test + pilot case study.

Blocked by M-18.`,
  },
  {
    m: "M-20",
    owner: "PC1",
    title:
      "Backfill strategy for in-flight jobs + manager-review-flag (Principal amendment)",
    body: `Architect paper R1 + Principal amendment. Cron creates ClaimProgress rows for all existing Reports:
- COMPLETED Reports → ClaimProgress in CLOSEOUT (or CLOSED if Invoice PAID)
- In-progress Reports → ClaimProgress in DRYING_ACTIVE with **manager-review-flag** raised

Manager-review-flag means human confirms state in 1-click; never silent state assignment.

Scope: /api/cron/backfill-progress/route.ts + UI flag component on dashboard + one-run completion marker.`,
  },
  {
    m: "M-21",
    owner: "PC1",
    title:
      "Sprint 1 umbrella: foundation (schema + service layer + 2 API routes + tests)",
    body: `Architect paper Sprint 1 scope. Commences immediately upon M-5 merge. Ships:
- lib/progress/state-machine.ts (pure guard functions, no I/O)
- lib/progress/service.ts (init, transition, getState, getHistory with optimistic locking)
- lib/progress/permissions.ts (canPerformTransition)
- POST /api/progress/[reportId]/init
- POST /api/progress/[reportId]/transition
- GET /api/progress/[reportId]
- Unit tests (vitest) + type-check clean

Zero UI. Zero integration fan-out. Retrofit POST /api/inspections/[id]/submit to call progressService.init().

Scope: depends on M-1..M-5 landing first. Parent of sub-tickets for each lib file.`,
  },
];

const out = { epic: null, tickets: [] };

console.log("Creating epic...");
const epic = await createIssue({
  title: "RA-Progress: Stage-Gated Claim Lifecycle (Board-Approved Framework)",
  description: EPIC_DESC,
  parentId: null,
});
out.epic = epic;
console.log(`  EPIC: ${epic.identifier}  ${epic.url}`);

for (const motion of MOTIONS) {
  const title = `[Progress] ${motion.m} — ${motion.title}`;
  const description = `**Motion:** ${motion.m} · **Default PC:** ${motion.owner} · **Epic:** ${epic.identifier}

${motion.body}

---

**Claim protocol:** Post [CLAIM] swarm=<PC1|PC2> agent=<pm-name> role=<role> on this ticket before starting. See work-together.md §2.

**Board reference:** .claude/board-2026-04-18/00-board-minutes.md §8 Motion ${motion.m}.

**Default ownership:** ${motion.owner}. Either PC may claim by posting [COORD] if deviating from default.`;

  const issue = await createIssue({
    title,
    description,
    parentId: epic.id,
  });
  out.tickets.push({
    motion: motion.m,
    owner: motion.owner,
    id: issue.id,
    identifier: issue.identifier,
    url: issue.url,
    title: motion.title,
  });
  console.log(
    `  ${motion.m} (${motion.owner}) → ${issue.identifier}  ${issue.url}`,
  );
}

await writeFile(
  ".claude/swarm/progress-tickets.json",
  JSON.stringify(out, null, 2),
);
console.log("\nWrote .claude/swarm/progress-tickets.json");
console.log(`Total: 1 epic + ${out.tickets.length} motion tickets`);
