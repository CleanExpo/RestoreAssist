# Floor-plan custody escaped-defect ledger

## 2026-08-28 — Track B pre-release attack review

Status: contained before release.

The review found that reference floor-plan artwork could reach legacy report
routes, a partial sketch update could bypass provenance processing, child sketch
records were not always bound to the parent inspection, and the private storage
bucket granted every authenticated user bucket-wide read access.

A second attack pass found that arbitrary client PNG bytes could be relabelled
as a report render, sketch deletion could detach floor-level custody history,
JSONB key ordering could invalidate a legitimate receipt, and the identical
source image could not be re-attested after removal.

Containment and prevention:

- reference imports now use one inspection-scoped server transaction with exact
  stored-byte SHA-256, rights attestation, actor, source and storage custody;
- reference pixels remain visibly watermarked and are excluded from clean claim
  reports; only technician-confirmed, calibrated geometry can cross the export
  firewall;
- every canonical report PNG is now generated server-side from allowlisted
  geometry into an immutable content-addressed path; arbitrary client-render
  upload is retired;
- report eligibility reads custody history by inspection and floor, so deleting
  and recreating a sketch cannot detach the floor from a prior reference event;
- verification uses canonical JSON hashing that is stable across PostgreSQL
  JSONB key reordering, and repeated identical imports create new attestation
  events while safely reusing the content-addressed stored bytes;
- the legacy partial update and unbound attestation routes fail closed;
- evidence, moisture, hazard and insurance child mutations verify the complete
  inspection → sketch → room/element relationship;
- sketch-media browser policies bind object paths to an inspection the current
  user owns or actively belongs to; browser writes cannot target underlays;
- `npm run check:floorplan-custody` is an enforcing PR gate, with route tests for
  the rejected cross-tenant and bypass attempts.

Release evidence still required: apply the Prisma and Supabase migrations in an
ephemeral Supabase-equivalent environment and run the signed-URL acceptance test.
