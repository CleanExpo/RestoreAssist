---
title: DigitalOcean production release
owner: RestoreAssist release owner
last_reviewed: 2026-08-26
---

# DigitalOcean production release

> **STATUS: BLOCKED / UNPROVEN. DO NOT DISPATCH THE DEPLOY WORKFLOW.**
> The repository implementation is fail-closed, but production remains
> ineligible until the external controls and watchdog listed below are proven.

Production does not follow a branch or image tag. The repository builds the
reviewed `main` SHA without production credentials, pushes it to GHCR, records
its immutable `sha256:` digest, generates GitHub artifact provenance, and only
then offers a separate `production`-environment job for approval.

The reviewed `.do/app.yaml` is a non-deployable template. Its all-zero digest
and Git SHA sentinels are replaced only in the protected job. Secret values are
never committed or written to receipts. Immediately before the DigitalOcean
update, the controller carries forward the provider-encrypted values from the
current app spec in memory and refuses the release if any reviewed secret
cannot be preserved.

## Protected configuration

The GitHub `production` environment must enforce the reviewer policy validated
by `scripts/ci/verify-production-environment.mjs`, including prevent-self-review
and no administrator bypass. Store these values as environment-scoped secrets:

- `DIGITALOCEAN_ACCESS_TOKEN`
- `DIGITALOCEAN_APP_ID`
- `GHCR_PULL_CREDENTIALS` in `username:token` form, with read-only package scope
- `PRODUCTION_DIRECT_URL`
- `EXPECTED_DIRECT_DATABASE_HOST`
- `EXPECTED_DIRECT_DATABASE_NAME`
- `EXPECTED_DIRECT_DATABASE_SCHEMA`

Configure the repository variable
`NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID` for the public client value embedded
at image build time. It is deliberately not treated as a production secret.

The versioned production reviewer allow-list is currently empty, so the
protected job is guaranteed to stop before provider mutation. An owner must
approve a separately controlled GitHub user or team, configure the environment
to match it exactly, and update the reviewed allow-list before this blocker may
be removed.

DigitalOcean's current app spec must already contain provider-encrypted values
for every `SECRET` entry in `.do/app.yaml`. The controller does not create,
guess, print, or persist missing application secrets.

## Release procedure

1. Run `Release Gate` manually on the exact `main` SHA and retain its successful
   run ID. The receipt is accepted for at most 24 hours.
2. Dispatch `Deploy — DigitalOcean Production` from `main` with:
   - `release_gate_run_id`: that exact successful run ID.
   - `confirm_sha`: the full lowercase 40-character `main` SHA.
3. The unprotected build job verifies the release receipt, builds only that
   checkout, pushes `ghcr.io/cleanexpo/restoreassist:sha-<SHA>`, and attests the
   returned digest. It has no DigitalOcean or production database credentials.
4. Review and approve the waiting `production` environment job. Approval is for
   that workflow run, Git SHA, and resulting image digest only.
5. The protected job verifies the attestation, renders the digest-pinned spec,
   captures the exact active rollback deployment, and proves production
   migration parity plus logical database identity using the direct session
   connection. These database checks are read-only; the workflow never applies
   or resolves a migration.
6. The controller updates DigitalOcean, binds monitoring to the exact newly
   created deployment ID, and requires the returned provider spec to preserve
   the reviewed digest, Git SHA, region, domain, capacity, health route, and
   environment contract.
7. After activation, exact-SHA health, migration health, database identity, and
   the strict production `@smoke` user flows must pass. Redacted receipts are
   retained as a workflow artifact.

## Failure and rollback

- Before activation, failure or timeout cancels the exact created deployment.
- After activation, health failure invokes rollback to the exact deployment ID
  captured before mutation.
- If the full post-activation smoke fails, the workflow rolls back that same
  target and runs the production smoke again without claiming the failed SHA.
- A rollback that cannot restore healthy smoke is reported as critical. Do not
  retry blindly; preserve the receipts and inspect DigitalOcean deployment logs.

The production workflow intentionally fails closed when the current site is
degraded, migration health is unavailable, required environment-scoped secrets
are missing, production migrations differ from the reviewed repository, or the
provider already has a pending deployment. Resolve the specific preflight
failure before requesting another approval.

## Remaining release blocker

An independent reconciliation watchdog must be able to finish cancellation or
rollback if the GitHub runner is lost or the workflow is manually canceled
after the DigitalOcean update. Provider health checks reduce this risk but do
not prove the strict user-flow smoke completed. Until a durable action receipt
and independently triggered reconciler are implemented and attacked, this
workflow is not an approved live release path.
