# In-House Module Program

**Status:** DRAFT — PC1 initial architecture, pending Principal review.
**Opened:** 2026-04-18 · **Owner:** PC1-orchestrator · **Epic target:** TBD (new RA-… ticket).

## Principal directive

> "We need to generate these external addons ourselves. We have the skills to now generate these apps ourselves to implement within our product."

Scope: replace paid third-party SaaS dependencies with in-house modules that live inside the RestoreAssist monorepo, where viable and where the substitute genuinely serves us.

## Replace / keep / defer

Not every vendor should be replaced. The decision per vendor is **cost vs. control vs. time-to-ship vs. regulatory risk**.

### REPLACE (high leverage, feasible)

| Vendor | In-house replacement | Why | Foundation ticket |
|---|---|---|---|
| **DocuSign** (e-sign) | `modules/esign` — hash-chain + C2PA-manifest signing | We already build the chain-of-custody manifest (M-10 RA-1386). Legal paper §4 identifies that our hash chain is *stronger* than DocuSign's because we control every link. DocuSign's model is "third-party witnesses a hash"; ours is "the record itself is hash-evidenced, per attestation". Carrier/court evidentiary test met by both; ours costs ~$0/signature vs DocuSign's ~$0.60. | Blocked on M-10 RA-1386 shipping. |
| **Twilio** (SMS + voice) | `modules/notify` — email-first + SMS via a commodity SMS gateway (e.g. AWS SNS, MessageBird) | Twilio's product is fine; their *margin* is not. We use ≤5 notification types (claim ack, drying-day-N reminder, invoice-issued, dispute-opened, dispute-resolved). Thin wrapper over a cheaper SMS carrier + a retry/idempotency log table beats Twilio's priced API. | New ticket. |
| **Intercom / Zendesk** (in-app chat) | `modules/support` — thread UI + email bridge | Low complexity; commoditised. Owning the data + routing is a real win for our support ops. | New ticket. |

### KEEP (replacing is bad economics or bad engineering)

| Vendor | Why keep |
|---|---|
| **Stripe** | Payments is a regulated speciality. PCI, dispute handling, chargebacks, card-brand rules. Building an in-house replacement is a negative-ROI project. |
| **Xero** | Accounting is not our product. Customers expect to see claims in their own Xero. Replacing Xero means *forcing* our customers to give up *their* accountant's tool. Wrong direction. |
| **Cloudinary** | Image CDN + transforms. Could be replaced with Vercel Image Optimisation + Vercel Blob for the storage, and that migration is a separate cost-optimisation project (not an "in-house" project). Defer. |
| **Sentry** | Replacing an error-reporting SaaS with a bespoke log pipeline creates an SRE project we don't want. |
| **Anthropic / OpenAI** | Obvious keep — we consume, not produce, the model. |

### DEFER (revisit when core is stable)

| Vendor | Why defer |
|---|---|
| **Guidewire** (carrier integration) | Carrier-side integration is the hardest module because the counterparty (insurers) owns the interface. M-18 (RA-1393) is a procurement working group. Build the replacement only after carrier contracts are running through the stub, so we know what to build. |
| **MessageBird / Mailgun** (transactional email) | Only replace when `modules/notify` ships and we've measured Twilio-replacement savings. Sequential, not parallel. |

## Architecture

### Monorepo placement

```
modules/
  esign/          # M-10 C2PA-manifest e-sign
    lib/
    schema.prisma.partial   // merged into root by prisma-partial compose
    __tests__/
    README.md
  notify/         # SMS + email abstraction
    providers/
      sms-sns.ts
      sms-messagebird.ts
      email-postmark.ts
    lib/
    __tests__/
    README.md
  support/        # in-app chat + email bridge
  ...
```

One Prisma schema (root) — modules contribute via a compose step that concatenates `modules/*/schema.prisma.partial` into root `schema.prisma` pre-generate. This keeps the generated client monolithic but module authors edit their own schema chunk.

### Contract rules

Every in-house module must:

1. **Ship a public TS interface** at `modules/<name>/lib/index.ts`. Internal code imports the interface, never the provider implementation.
2. **Expose a feature-flag kill switch** via `process.env.MODULE_<NAME>_ENABLED` (fail-closed when false → legacy vendor path runs).
3. **Have a shadow-mode phase.** Before cutting the vendor off, run the in-house module in parallel and diff the outputs. Minimum 2 weeks shadow.
4. **Maintain parity tests.** `modules/<name>/__tests__/parity.test.ts` asserts our module returns semantically equivalent output vs. the vendor response (fixture-based).
5. **Expose telemetry.** Per-call latency, error rate, per-1000-calls unit cost — piped to M-17 telemetry stream.
6. **Own its runbook.** `modules/<name>/RUNBOOK.md` — failure modes, rollback procedure (flip env flag), escalation contact.

### Migration phases per module

1. **Phase 0 — spike.** 1–2 day spike to prove the replacement's simplest path works. Output: a throwaway PR demonstrating feasibility.
2. **Phase 1 — implementation.** Full module, gated behind `MODULE_<NAME>_ENABLED=false`. Tests pass, parity fixtures written. PR reviewed.
3. **Phase 2 — shadow.** Flag flipped in staging. Both paths run; diff is logged. ≥2 weeks, ≥1000 calls observed.
4. **Phase 3 — canary.** Flag on for 10% of production traffic. Monitor telemetry for a week.
5. **Phase 4 — full cut.** Flag on 100%. Vendor billing switched off after 30 days of clean operation. Vendor account kept dormant for 90 days as rollback insurance.

### Rollback criteria

Any one of these reverts the flag:

- Error rate > 2× vendor's 7-day baseline over any 1-hour window
- p95 latency > 2× vendor's baseline over any 1-hour window
- Any correctness defect that triggers a manual claim correction
- Cost-per-1000-calls > vendor's (shouldn't happen; a guard against regressions in our infra)

## First delivery — `modules/esign`

Because M-10 (RA-1386) is already in PC2's queue, our in-house e-sign module is the natural first delivery. The ordering:

1. M-10 ships — C2PA manifest is the atomic unit.
2. This program's Phase 0 spike: prove we can produce a signed-PDF-equivalent artefact (manifest + human-visible rendering) that carriers + Legal + courts accept.
3. Phase 1 implementation of `modules/esign` gated behind `MODULE_ESIGN_ENABLED=false`.
4. Shadow mode running alongside DocuSign on new claims.
5. Flag flip per phase plan.

Legal paper §4 is the acceptance test. The carrier-authorisation step (M-2 transition #5 / `approve_scope`) is the first transition that replaces a DocuSign touch; closing that loop first proves the pattern.

## Governance

- Each in-house module replacement is a **formal board motion** (next minutes). The Principal decides whether the vendor gets replaced — this doc is the recommendation, not the decision.
- Module owners are named per module. Orphan modules (no named owner for 30 days) auto-revert to vendor path.
- Monthly review: dashboard showing per-module savings, error rate, rollback count — fed by M-15 governance review infrastructure.

## Open questions

1. **Esign evidentiary weight.** Need Legal to confirm that a C2PA-manifest signature is admissible under Electronic Transactions Act 1999 (Cth). First-party hash-chain = stronger than third-party witness *technically*, but AU court precedent favours the known-vendor path. Ask Legal before Phase 4.
2. **Notify — SMS gateway selection.** AWS SNS vs MessageBird vs AU-regional provider. Depends on AU A2P delivery rate + per-message cost at our volume. Procurement working group.
3. **Support — thread storage.** Reuse existing ClaimProgress schema or separate table? Recommend separate; support threads shouldn't bloat claim audit surface.

## Next steps

1. Principal ruling on this doc (Replace / Keep / Defer columns).
2. File new Linear Epic "RA-IHM: In-House Module Program" with one motion per REPLACE row.
3. M-10 RA-1386 ships → Phase 0 spike for `modules/esign` begins.
4. Board minute drafted for next governance review.

— PC1-orchestrator
