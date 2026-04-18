# Task Brief

[HIGH] Extend NRPG_RATE_RANGES with 14 new rate field definitions

Description:

## Overview

Extend `lib/nrpg-rate-ranges.ts` and `lib/nir-cost-estimation.ts` with guard-rail ranges for all 14 new CompanyPricingConfig fields added in [RA-848](https://linear.app/unite-group/issue/RA-848/m1-schema-foundation-all-new-typed-fields-xeroaccountcodemapping-model).

## Files to modify

- `lib/nrpg-rate-ranges.ts` — add entries for: `rateNegativeAirMachine`, `rateHEPAVacuum`, `rateOzoneGenerator`, `rateHydroxylUnit`, `rateMouldRemediation`, `rateFireRestoration`, `rateStormWaterExtraction`, `rateBiohazardClean`, `rateMobilisation`, `rateMonitoring`, `rateWasteDisposal`, `rateContentsPack`, `rateContentsClean`, `rateDehumidifierLarge`
- `lib/nir-cost-estimation.ts` — update `SCOPE_ITEM_NRPG_CONFIG` mapping + `CompanyPricingRates` interface to include new fields
- `app/api/pricing-config/route.ts` — add default values for new fields in GET response

## NRPG guard-rail values (national AU averages)

| Field                    | Min | Max |
| ------------------------ | --- | --- |
| rateNegativeAirMachine   | 85  | 185 |
| rateHEPAVacuum           | 45  | 95  |
| rateOzoneGenerator       | 75  | 165 |
| rateHydroxylUnit         | 85  | 175 |
| rateMouldRemediation     | 65  | 145 |
| rateFireRestoration      | 85  | 195 |
| rateStormWaterExtraction | 55  | 125 |
| rateBiohazardClean       | 95  | 225 |
| rateMobilisation         | 150 | 450 |
| rateMonitoring           | 35  | 85  |
| rateWasteDisposal        | 45  | 125 |
| rateContentsPack         | 35  | 85  |
| rateContentsClean        | 45  | 115 |
| rateDehumidifierLarge    | 95  | 215 |

## Acceptance criteria

- `validateRateInRange()` returns error for any value outside listed bounds
- `midpoint()` returns sensible defaults for seeding
- `pnpm type-check` passes
- Blockedby: [RA-848](https://linear.app/unite-group/issue/RA-848/m1-schema-foundation-all-new-typed-fields-xeroaccountcodemapping-model) (schema must exist first)

Linear ticket: RA-861 — https://linear.app/unite-group/issue/RA-861/extend-nrpg-rate-ranges-with-14-new-rate-field-definitions
Triggered automatically by Pi-CEO autonomous poller.

## Session: fd8499334abf
