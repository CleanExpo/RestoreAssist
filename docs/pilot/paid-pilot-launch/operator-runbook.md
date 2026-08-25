# Paid-pilot operator runbook

Run the gates in order. A blank checkbox is not evidence. Record the release
revision, environment, timestamp and evidence location in
[`pilot-evidence-record.md`](./pilot-evidence-record.md).

## Gate 0: release authority and production safety

- [ ] Reviewed release revision is an immutable commit, not a dirty worktree.
- [ ] Web release gate is fully green for that exact revision.
- [ ] Node version exactly matches `.nvmrc`.
- [ ] Production migration health returns HTTP 200 and its fingerprint equals
      the approved `EXPECTED_DATABASE_FINGERPRINT`.
- [ ] Live RLS isolation and DB-backed invite-concurrency tests pass.
- [ ] `TENANT_DATABASE_HOST_ALLOWLIST` contains only approved tenant database
      hosts and has been independently checked.
- [ ] The actual production scheduler invokes `/api/cron/provision-tenant-db`
      with `CRON_SECRET`, has a successful receipt, and only then is
      `TENANT_DATABASE_PROVISIONING_ENABLED=true` approved. DigitalOcean's
      current web-only spec leaves it `false`.
- [ ] Production alert routes have been fired in a safe environment and receipt
      is recorded.
- [ ] A protected immutable deployment path exists for the reviewed revision.
- [ ] A protected, compatibility-checked rollback target and procedure exist.
- [ ] There are no open P0/P1 pilot blockers.

If any item is not proven, stop. The present DigitalOcean runbook explicitly
blocks production deployment and rollback; do not work around it.

## Gate 1: local paid-pilot acceptance

```bash
nvm use
node scripts/pilot/run-paid-pilot-preflight.mjs --run
```

- [ ] Command exits 0.
- [ ] All six acceptance groups report `PASS`.
- [ ] Receipt records the exact Git revision and dirty/clean status.
- [ ] `git diff --check` exits 0.

## Gate 2: commercial and customer readiness

For each proposed customer, complete the customer record in
[`onboarding-revenue-feedback.md`](./onboarding-revenue-feedback.md).

- [ ] Legal company name, ABN and authorised decision-maker verified.
- [ ] Pilot price, billing frequency, GST treatment, start/end dates and exit
      terms approved by the owner and accepted by the customer.
- [ ] Privacy, data residency, support hours and pilot limitations stated using
      currently verified facts only.
- [ ] Customer has a commercial and technical contact.
- [ ] No production credentials or one-time passwords are stored in the repo,
      issue tracker or evidence bundle.
- [ ] Support owner and backup owner accept the monitoring window.

## Gate 3: internal production acceptance

Use an owner-controlled internal account before a customer account. Do not
reuse sandbox synthetic accounts as customer identities.

- [ ] Signup and login pass.
- [ ] Paid checkout, Stripe webhook and entitlement pass with the approved
      test/live mode clearly recorded.
- [ ] Owner invite, technician invite, resend rotation and invite acceptance
      pass.
- [ ] Inspection creation, report generation and export pass.
- [ ] Welcome, invite, receipt and password-reset email evidence pass without
      exposing tokens.
- [ ] Tenant provisioning validates target identity before and after tenant
      migrations.
- [ ] Logout and re-login preserve the correct organisation and entitlement.
- [ ] Revenue event appears once in both Stripe and `"SubscriptionEvent"`.

Any failure holds the launch. Do not compensate with a manual database edit.

## Gate 4: customer rollout

### Wave 1: customer 1

- [ ] Create the customer only after Gates 0–3 pass.
- [ ] Customer accepts their own invite; staff do not impersonate them.
- [ ] Complete all live acceptance cases in `acceptance-tests.md`.
- [ ] Monitor continuously during onboarding and at 1h, 4h, 12h and 24h.
- [ ] Collect one structured day-one feedback record.

Hold for 24 clean hours. Any stop threshold prevents expansion.

### Wave 2: customers 2–3

- [ ] Repeat the complete per-customer process; do not clone credentials or
      evidence.
- [ ] Confirm tenant isolation between each pair using approved test records.
- [ ] Reconcile revenue after each customer charge.
- [ ] Hold after customer 3 until the first weekly review.

### Wave 3: customers 4–5

- [ ] Open only if customers 1–3 remain green and no unresolved P1 exists.
- [ ] Repeat all per-customer acceptance and evidence.
- [ ] Complete day-seven commercial and product review.

## Gate 5: completion

- [ ] Stripe and database revenue counts match exactly for the pilot window.
- [ ] Every charge maps to one customer, one price and one subscription event.
- [ ] Refunds, cancellations and failed payments are reconciled.
- [ ] P0 count is zero and P1 count is zero.
- [ ] Feedback has an owner, decision and due date; raw customer statements are
      kept separate from interpretations.
- [ ] Pilot decision is explicitly `continue`, `hold`, `rollback` or `close`.
