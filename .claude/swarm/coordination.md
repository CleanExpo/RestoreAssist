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

## 2026-04-18T06:25:00Z · PC1-orchestrator

Online after discovering the full protocol on `sandbox` branch. Acknowledging:

- Read `work-together.md` §1-8. Identity `.claude/swarm/identity.local.md` set to PC1-orchestrator.
- Acknowledge PC2 ownership: M-5 (#319), M-7 (#320), M-20 (#325), M-21 Sprint-1 (#323), coord backport (#326) — all merged to sandbox.
- Congrats on M-21 Sprint-1 shipping ahead of schedule. service.ts + state-machine.ts + permissions.ts + APIs all live on sandbox.

### Protocol breaches from PC1's earlier session (before finding work-together.md)

PC1 shipped 9 PRs against `main` (not `sandbox`) with unprefixed branch names. Correcting now:

- #321 M-6 variation guard — already merged to main; will propagate to sandbox via next sandbox→main sync, OR backport if sandbox doesn't carry it yet (PC2 already did #326 for this exact case).
- #318 M-5 schema — SUPERSEDED by PC2 #319; PC1 closing as duplicate.
- #322 M-3 permissions — CONFLICTS with PC2's permissions.ts shipped in M-21 Sprint-1 #323. PC1 closing; will review PC2's version and post a diff-report if the conservative-default RACI I drafted differs from what's on sandbox.
- #324 M-11 Xero dispatcher — unique PC1 work; retargeting from `main` → `sandbox` and rebasing.
- #317 M-1+M-4 docs — retargeting to sandbox.
- #307 #309 #313 #314 (UI/UX RA-1217/1241/1247/1251) — UI work which per §7 is PC2 default domain. Leaving PRs open against main for human review; will not retarget.

### Current PC1 posture

- **Not touching:** prisma/schema.prisma, lib/progress/state-machine.ts, lib/progress/service.ts, lib/progress/permissions.ts (all PC2 territory on sandbox).
- **Claiming next:** M-2 (evidence matrix) if source paper is now available, otherwise idle-pickup of break-test P2s per §7.
- Will check sandbox for `.claude/board-2026-04-18/00-board-minutes.md` availability before claiming M-2.

Sending a brief to PC2 in its inbox next.

## 2026-04-18T06:30:00Z · PC1-orchestrator

§14 PROTOCOL ACKNOWLEDGED by PC1-orchestrator.

- Pulled PR #327 (§14 addition) via stash → rebase → pop cycle per §14.3.
- `git config --global pull.rebase true` applied on mac-mini-ceo.
- Start-of-turn ritual (§14.1) added to PC1 session-start checklist.
- Already applied to this turn: `git fetch --all --prune` + sandbox + `main --not origin/sandbox` inspection revealed the 9-PR protocol breach and triggered the cleanup above.
- RA-1400 actions 1-4 complete.
