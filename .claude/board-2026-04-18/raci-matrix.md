# RACI Matrix — Progress Framework Authorisation Contract

**Board motion:** M-3 ([RA-1379](https://linear.app/unite-group/issue/RA-1379))
**Approved:** 2026-04-18
**Enforcement code:** [`lib/progress/permissions.ts`](../../../lib/progress/permissions.ts)
**UI lookup helper:** [`lib/progress/raci.ts`](../../../lib/progress/raci.ts)
**Test coverage:** [`lib/progress/__tests__/raci.test.ts`](../../../lib/progress/__tests__/raci.test.ts)

---

## Legend

| Letter | Meaning                                                  |
| ------ | -------------------------------------------------------- |
| **R**  | Responsible — does the work / triggers the transition    |
| **A**  | Accountable — owns the outcome; sign-off rests here      |
| **C**  | Consulted — must provide input before the stage proceeds |
| **I**  | Informed — kept in the loop; no action required          |
| —      | Not party to this stage                                  |

## The matrix

| State                      | Tech | Tech-Jr | Manager | Admin | Accounting | Carrier              | Lawyer |
| -------------------------- | ---- | ------- | ------- | ----- | ---------- | -------------------- | ------ |
| **INTAKE**                 | R    | I       | R       | A     | —          | —                    | —      |
| **STABILISATION_ACTIVE**   | R    | R       | A       | A     | —          | —                    | —      |
| **WHS_HOLD**               | I    | —       | R       | A     | —          | —                    | —      |
| **STABILISATION_COMPLETE** | R    | —       | A       | A     | —          | I                    | —      |
| **SCOPE_DRAFT**            | C    | —       | R       | A     | —          | C                    | —      |
| **SCOPE_APPROVED**         | I    | —       | R       | A     | —          | **R**                | —      |
| **DRYING_ACTIVE**          | R    | R       | A       | A     | —          | —                    | —      |
| **VARIATION_REVIEW**       | C    | —       | R       | A     | —          | **R** (if threshold) | —      |
| **DRYING_CERTIFIED**       | R    | —       | A       | A     | —          | I                    | —      |
| **CLOSEOUT**               | I    | —       | A       | A     | C          | I                    | —      |
| **INVOICE_ISSUED**         | —    | —       | C       | A     | R          | I                    | I      |
| **INVOICE_PAID**           | —    | —       | I       | A     | R          | C                    | I      |
| **DISPUTED**               | —    | —       | C       | C     | C          | C                    | **A**  |
| **CLOSED**                 | I    | —       | I       | A     | I          | I                    | I      |
| **WITHDRAWN**              | —    | —       | I       | A     | I          | —                    | I      |

---

## Reading the matrix

### Where techs are R

Technicians carry the evidence-capture burden during operational phases — STABILISATION_ACTIVE and DRYING_ACTIVE. Juniors share the R for evidence but **cannot trigger stage-advance transitions** per Board M-16 (enforced in `canPerformTransition`).

### Where managers are A

Managers are accountable for every operational outcome — they countersign stabilisation attestation, scope approval, drying certification, and closeout. The M-3 contract makes it explicit: if it goes wrong in stabilisation through closeout, the manager owns it.

### Where admins are A

Admins are accountable in every state (all 15). They are the only role permitted to withdraw, reopen drying, and write-off. The `ADMIN` blanket A is the safety-valve for non-standard paths.

### Where carriers are R

Carriers become **Responsible** at two points:

1. **SCOPE_APPROVED** — carrier acceptance is the event; without their R, scope doesn't move.
2. **VARIATION_REVIEW** — when variation delta breaches the Board M-6 threshold (20% / $2,500), carrier R is required in addition to manager R.

Outside these two, carriers are C or I.

### Where lawyers are A

**DISPUTED** is the only state where `EXTERNAL_LAWYER` is accountable. The state is entered via `raise_dispute` from INVOICE_ISSUED, and only the lawyer or admin can resolve or write-off.

### Where accounting is R

Accounting owns INVOICE_ISSUED and INVOICE_PAID. They are C (consulted) during CLOSEOUT because the pre-invoice completeness check (RA-876) runs at that boundary; they are I on DISPUTED because the financial impact is visible but the legal dispute is not their lane.

---

## Relationship to permissions.ts

RACI is the authorisation **contract**; `permissions.ts` is the **enforcement**.

- A role with `R` or `A` in a state typically has **W** (write / transition) permission.
- A role with `C` typically has **R** (read) + possibly **A** (attest) permission.
- A role with `I` has **R** only.
- A role with "—" has no permission (403 from the API).

Exceptions to the "R/A → W" rule:

- **TECHNICIAN_JUNIOR never has W.** Board M-16 hard-block — juniors contribute evidence but cannot promote stages. Still R in the RACI because the evidence they capture is their responsibility; seniors/managers attest.
- **CARRIER in DISPUTED is C, not R** — dispute is lawyer-led; carrier's C input is not transition-triggering.

---

## Edge case — what if a role has no RACI entry for a state?

`getRACI(role, state)` returns `null`. The UI should render no badge for that role in that state. The API returns 403 on any transition attempt.

Example: a technician attempting to `issue_invoice` on `CLOSEOUT`:

- `getRACI("TECHNICIAN", "INVOICE_ISSUED")` → `null`
- `canPerformTransition("TECHNICIAN", "CLOSEOUT", "issue_invoice")` → `false`
- POST /api/progress/[reportId]/transition → 403

---

## Governance

Per Board M-15, if the 5% override-rate is breached on any gate, the RACI entry driving that gate is reviewed. Changes to this matrix require:

1. A new board motion
2. Amendment of `lib/progress/raci.ts`
3. Amendment of `lib/progress/permissions.ts` to match
4. Amendment of this document with updated version note

---

**Version:** 1.0 · 2026-04-18 · M-3 adopted
