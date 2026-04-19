# GST Treatment Matrix — RA-859 Task 1

> **Status:** Reference document. Authoritative source for GST classification of every line item type produced by the scope engine.
> **Jurisdiction:** Australia (ATO GSTR 2000/10 + GSTR 2003/12).
> **Scope:** Invoicing under the RestoreAssist NIR pipeline.
> **Reviewed:** 2026-04-19 (Session 2 swarm). Re-review annually against ATO amendments + each time a new scope generator lands.

## Classification key

- **OUTPUT** — Supply is taxable. GST is collected from the client at 10 % and remitted to the ATO. Default for labour, equipment hire, own consumables.
- **INPUT** — Acquisition is a creditable import, but the cost is passed through to the client at-cost. Contractor claims the input-tax credit; the client sees the raw cost without the contractor's markup attracting a second round of GST.
- **OUT_OF_SCOPE** — Transaction is not a supply (e.g. insurance excess collected on the insurer's behalf). Flagged `taxType: NONE` so it does not appear in the BAS.

All pass-through lines must also carry `isPassThrough: true` so the Xero sync knows not to apply the standard markup-plus-GST rule.

## Item type matrix

| Item type (generator source)                                                         | Treatment                | Notes                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `mobilisation` (scope-prelims)                                                       | OUTPUT                   | Own-staff attendance fee. Taxable.                                                                           |
| `daily_monitoring` (scope-prelims)                                                   | OUTPUT                   | Own-staff labour. Taxable.                                                                                   |
| `waste_disposal_standard` (scope-prelims)                                            | OUTPUT                   | Tipping fees marked up by contractor. Taxable under contractor's GST registration.                           |
| `waste_disposal_contaminated` (scope-prelims)                                        | OUTPUT                   | As above. Contaminated-waste carriers invoice the contractor; markup stays taxable.                          |
| `safety_ppe` / `ppe_standard` / `ppe_premium` (scope-prelims, scope-biohazard)       | OUTPUT                   | Own consumables. Taxable.                                                                                    |
| `project_management` (scope-prelims)                                                 | OUTPUT                   | Own-staff labour.                                                                                            |
| `equipment_transport` (scope-prelims)                                                | OUTPUT                   | Own equipment delivery.                                                                                      |
| Fire cleaning items (scope-fire)                                                     | OUTPUT                   | Labour + consumables.                                                                                        |
| Ozone / hydroxyl treatment (scope-fire)                                              | OUTPUT                   | Own equipment hire charged at the daily rate.                                                                |
| Mould Class 1-4 items (scope-mould)                                                  | OUTPUT                   | Own labour + equipment.                                                                                      |
| `hvac_inspection` (scope-mould, NADCA)                                               | **INPUT**                | Typically a licensed NADCA inspector invoices the contractor; pass-through to client. `isPassThrough: true`. |
| `clearance_testing` / `post_remediation_verification` (scope-mould, scope-biohazard) | **INPUT**                | Independent IEP/consultant fee. Pass-through. `isPassThrough: true`.                                         |
| Storm extraction + drying (scope-storm)                                              | OUTPUT                   | Own equipment + labour.                                                                                      |
| `temporary_weatherproof` (scope-storm)                                               | OUTPUT                   | Own labour + consumables.                                                                                    |
| `structural_inspection` (scope-storm)                                                | **INPUT**                | Licensed structural engineer invoices contractor. Pass-through.                                              |
| Cat 3 sanitation + antimicrobial (scope-storm, scope-biohazard)                      | OUTPUT                   | Own treatment. Taxable.                                                                                      |
| `biohazard_handling_compliance` (scope-biohazard)                                    | OUTPUT                   | SWMS preparation is own-labour.                                                                              |
| `licensed_disposal` / `sharps_disposal` / `specialist_disposal` (scope-biohazard)    | **INPUT**                | Licensed clinical/hazardous waste carrier. Pass-through. `isPassThrough: true`, `taxType: INPUT`.            |
| `epa_waste_manifest` (scope-biohazard)                                               | OUTPUT                   | Own admin fee for tracking/submitting the manifest.                                                          |
| Decomposition odour bomb / enzyme / porous removal (scope-biohazard)                 | OUTPUT                   | Own labour + consumables.                                                                                    |
| Chemical neutralisation + chemical_identification (scope-biohazard)                  | OUTPUT                   | Own labour + consumables.                                                                                    |
| Insurance excess collection (billing module)                                         | OUT_OF_SCOPE             | Not a supply from the contractor to the client — the contractor is collecting on behalf of the insurer.      |
| Discount line item                                                                   | OUTPUT (negative amount) | Negative OUTPUT so GST refund is captured. Fixed under M-4.                                                  |

## Pass-through rules

A line item is a pass-through when **all three** are true:

1. The contractor pays a third party directly for the underlying service.
2. The third party's invoice is reimbursed by the client at-cost (no markup).
3. The third party is GST-registered, so an input-tax credit is available.

Pass-through lines MUST carry:

```ts
isPassThrough: true,
taxType: "INPUT",
```

If any of the three conditions is not met, the line is treated as OUTPUT and marked up per the contractor's normal rate. Common example: a contractor who adds a 10 % markup on subcontractor labour is treating that line as OUTPUT, not INPUT.

## Auditing the matrix

Run this script quarterly:

```bash
npx vitest run lib/billing/__tests__/gst-treatment-matrix.test.ts
```

The test confirms every `itemType` produced by the scope generators has an entry in this matrix. A new scope line that isn't classified here fails the build — forces a conscious classification decision before the line can appear on an invoice.

## References

- ATO GSTR 2000/10 — GST on insurance payouts.
- ATO GSTR 2003/12 — Disbursements and reimbursements.
- ATO GSTR 2001/4 — Professional service disbursements.
- Safe Work Australia — Hazardous Chemicals CoP (informs pass-through classification for specialist disposal).

## Change log

| Date       | Change                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| 2026-04-19 | Initial matrix for the scope-library items shipped in Session 2 (prelims, fire, mould, storm, biohazard). |
