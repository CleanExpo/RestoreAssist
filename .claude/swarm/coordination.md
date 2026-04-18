# Swarm Coordination Log

Append-only. Order by UTC timestamp. Both PCs write here.

See `work-together.md` (repo root) for protocol.

---

## 2026-04-18T14:58:00Z · PC1-orchestrator · SESSION-INIT

Bootstrapping the multi-PC swarm protocol per Principal instruction.

**Intent this session (PC1):**

- Author `work-together.md` at repo root (DONE)
- Seed `.claude/swarm/coordination.md` (this file) + `.claude/swarm/inbox-PC2-orchestrator.md`
- Draft swarm architecture + specialist roster at `.claude/swarm/architecture.md`
- Stand by for Principal ruling on Board Minutes motions before executing Progress Phase A

**Claiming (PC1):**

- Hot file: `work-together.md` — release after this commit
- Hot file: `.claude/swarm/architecture.md` — new file, no conflict

**Not touching (PC1 won't):**

- Anything in `app/dashboard/**`, `components/**` — reserved for PC2
- `prisma/schema.prisma` — reserved until Board Motion M-5 signed
- Linear tickets tagged `[CLAIM]` by any other swarm

**Awaiting from Principal:**

- Board Minutes approval (21 motions — see `.claude/board-2026-04-18/00-board-minutes.md`)
- PC2 identity file `.claude/swarm/identity.local.md` created on PC2 host with `SWARM_ID=PC2-orchestrator`

**Current session stats (PC1, rolling):**

- 20 PRs merged into sandbox this session (#284–#303) — break-test backlog
- 59 tickets filed (RA-1297 → RA-1368) from 5 break-test agents
- 6 board papers authored (~14,800w total) + consolidated minutes + strategic rollout memo

---

## 2026-04-18T15:32:00Z · PC1-orchestrator · BOARD-APPROVED-GO

**Principal approved Board Minutes.** M-1..M-21 approved except M-12 deferred to Sprint-1 review; M-20 amended with manager-review-flag.

**Linear epic + 20 child tickets created:**

- Epic: [RA-1376](https://linear.app/unite-group/issue/RA-1376)
- Motion tickets: RA-1377 (M-1) → RA-1396 (M-21). Full list in `.claude/swarm/progress-tickets.json`.

**Workload split confirmed:**

- **PC1 claiming:** M-1..M-7, M-11, M-19, M-20, M-21 (schema + service + core APIs + backfill + Sprint-1 umbrella)
- **PC2 default queue:** M-10, M-13, M-14, M-15, M-16, M-17 (C2PA manifest, labour-hire attestation, gate classification, governance review, junior ring-fence, telemetry)
- **Shared (either, `[COORD]` first):** M-8, M-9 (privacy/terms — live legal exposure), M-18 (carrier procurement working group)

**PC1 first claim:** M-5 (RA-1381) — schema. **Hot file claim on `prisma/schema.prisma`.** Expected 15–30 min. M-7 and M-20 follow same hot-file claim; PC2 must not touch schema until PC1 posts `[DONE]` on each.

**PC2 recommended first claim:** M-17 (RA-1392) telemetry — independent of schema, zero blockers, foundational for M-14/M-15.

**New Principal directive received this session:**

> "We need to generate these external addons ourselves. We have the skills to now generate these apps ourselves to implement within our product."

Replace DocuSign / Guidewire / Twilio with in-house modules. PC1 drafting replacement architecture (`.claude/swarm/inhouse-modules.md`). Preview of findings:

- **E-signature (replaces DocuSign):** viable in-house. Legal paper §4 chain-of-custody model (SHA-256 on-device + UTC + GPS + device + user hash + signed attestation) is stronger than DocuSign's envelope trust model because we control the full chain, not a third party. The _Electronic Transactions Act 1999_ (Cth) s10 admits in-house e-sign when the method is "as reliable as appropriate." Our hash-chained immutable `ProgressAttestation` is arguably more reliable than DocuSign.
- **Carrier portal (inverts Guidewire dependency):** we can't replace IAG/Suncorp's internal Guidewire instance, but we CAN host a carrier-consumer portal where our bundle is the interface. Carriers come to us. This is Move 20 of the strategic rollout memo.
- **SMS/notifications (replaces Twilio):** email-first (we already have `lib/email-send.ts`); SMS only as optional overlay via any cheap SMS API (MessageBird, Burst SMS) — not a strategic dependency.
- **Photo storage (already in-house-capable):** Cloudinary is a utility, not a moat. Keep for now; replace later with S3-compatible storage if cost justifies.

PC1 will table the full replacement architecture in next coordination entry. **No code changes on this directive yet — architecture first.**

---
