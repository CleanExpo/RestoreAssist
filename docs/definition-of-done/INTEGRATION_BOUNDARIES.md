# RestoreAssist Integration Boundaries

## Scope
This is a local boundary document for media, voice, Synthex, and other integration dependencies. It does not call external services and does not authorize production integration action.

## Boundary model
- Media/video assets: local code/docs/evidence can be reviewed; external rendering/publishing requires separate approval.
- Voice migration lane: remains BLOCKED-OP until 1Password CLI authentication is green; no OP retry in this batch.
- Synthex proxy/direct dependencies: must have route/test/evidence mapping before any completion claim.
- Supabase/data dependencies: production access remains prohibited in this batch.

## Evidence requirement
Every integration-dependent completion claim must include:
- route or local source pointer
- test or static validation pointer
- evidence packet pointer
- explicit external/production gate status
