---
title: DigitalOcean production release
owner: RestoreAssist release owner
last_reviewed: 2026-08-25
---

# DigitalOcean production release

> **STATUS: FAILED / BLOCKED. There is no repository-owned production deploy
> action. Do not deploy this release from GitHub or the DigitalOcean console.**

Production must not follow `main` automatically. The committed App Platform
contract sets `github.deploy_on_push: false`, and the platform health check is
`/api/health/migrations`. Critical environment variables are enforced by the
production startup preflight before Next.js can become healthy.

DigitalOcean's official GitHub source contract accepts a branch name, not a
commit SHA. Its Create Deployment API then pulls the latest branch revision.
Checking `main` immediately before or after that call cannot close the race, and
post-hoc SHA verification can observe the wrong build only after production has
already been mutated. The repository therefore contains a deliberately failing
`Deploy — DigitalOcean Production (BLOCKED)` workflow with no credentials and
no provider call.

## Controls that still require protected setup

Before using the repository workflow, an owner must complete these protected
configuration changes. They are production actions and require explicit owner
approval:

1. In DigitalOcean App Platform, apply the `.do/app.yaml` source settings so
   `deploy_on_push` is off and the service health path is `/api/health/migrations`.
2. In GitHub, create or update the `production` environment with required
   reviewers, enable **Prevent self-review**, and set
   `can_admins_bypass: false`. The read-only parity workflow checks all three
   controls and refuses production access when any is absent.
3. Store `DIGITALOCEAN_ACCESS_TOKEN`, `DIGITALOCEAN_APP_ID`, and
   `PRODUCTION_DIRECT_URL` as environment-scoped secrets. Do not expose their
   values in logs or repository files.
4. Confirm the saved live App Platform settings show auto-deploy off and
   `/api/health/migrations`. This reduces accidental deployment risk but does not create a
   safe release path while the source remains a mutable branch.

Until the requirements below are implemented and attacked independently, the
production deployment path is **FAILED**, not merely unproven.

## Requirements before a deploy workflow may act

1. Build the reviewed SHA into an image without production credentials.
2. Publish it under an immutable `sha256:` digest and verify the registry
   receipt binds that digest to the reviewed Git SHA and repository.
3. Change the App Platform service source from `github.branch` to
   `image.digest`; tags and image push-to-deploy must be absent or disabled.
4. Have a separate protected job validate the release report artifact, exact
   digest, critical App Platform spec (including region), migration
   compatibility and rollback target before any mutation.
5. Bind verification to the exact deployment ID returned by DigitalOcean.
   Failure or timeout must cancel that exact deployment before it can activate.
6. Run exact-SHA production health and the strict `@smoke` user-flow suite after
   activation. A missing route (`404`) or method (`405`) is a failure, not an
   authentication success.
7. Independently attack the build, deploy, cancellation, rollback and smoke
   paths. Only then may the intentionally blocked workflow be replaced.

## Rollback

No protected, pre-activation compatibility-checked rollback workflow exists.
Manual console rollback is therefore not an approved release path. Production
rollout remains blocked until rollback can validate the exact target deployment,
database compatibility, health and smoke before protected activation. Never
re-enable deploy-on-push to work around this blocker.
