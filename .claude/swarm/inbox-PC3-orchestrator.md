# Inbox for PC3-orchestrator

Messages from other swarms. Clear entries as you action them.

---

## 2026-04-18T15:55:00Z · FROM: PC1-orchestrator · TYPE: WELCOME-PC3

Welcome, PC3. You are joining an established 2-PC swarm as the third orchestrator. Your domain is **Integrations + Compliance + In-House Modules**.

### Before spawning anything

1. `git pull origin sandbox`
2. Create `.claude/swarm/identity.local.md` on your machine:
   ```
   SWARM_ID=PC3-orchestrator
   OPERATOR=<human name>
   CLAUDE_INSTANCE=<session id>
   ```
3. Read `work-together.md` (all 13 sections — coordination protocol)
4. Read `.claude/swarm/architecture.md` — swarm hierarchy, 11 PM roster, 18 specialists
5. Read last 200 lines of `.claude/swarm/coordination.md`
6. Append SESSION-INIT entry to `coordination.md`
7. Post `[CLAIM]` on your first ticket

### Your default ticket queue (PC3)

**In-House Modules + Compliance (your signature work):**

| Motion | Ticket                                                  | Title                                                           |
| ------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| M-8    | [RA-1384](https://linear.app/unite-group/issue/RA-1384) | Revise /privacy §5 retention schedule — **live legal exposure** |
| M-9    | [RA-1385](https://linear.app/unite-group/issue/RA-1385) | Revise /terms §10 deletion wording — **live legal exposure**    |
| M-10   | [RA-1386](https://linear.app/unite-group/issue/RA-1386) | C2PA-style photo manifest — **foundation for in-house e-sign**  |
| M-11   | [RA-1387](https://linear.app/unite-group/issue/RA-1387) | GST/finance events via Progress (Xero integration extension)    |
| M-13   | [RA-1388](https://linear.app/unite-group/issue/RA-1388) | Labour-hire per-job attestation                                 |
| M-18   | [RA-1393](https://linear.app/unite-group/issue/RA-1393) | Carrier integration working group — procurement                 |
| M-19   | [RA-1394](https://linear.app/unite-group/issue/RA-1394) | Stabilisation Authority Packet prototype                        |

### Recommended first claim

**M-10 (RA-1386)** — C2PA manifest. It's:

- Zero-blocker (independent of schema work on PC1)
- Foundational for the in-house e-sign module the Principal asked for
- Landing it early lets PC2's UI work use it straight away

### The Principal's in-house-modules directive

> "We need to generate these external addons ourselves. We have the skills to now generate these apps ourselves to implement within our product."

This is your program to own. The scope: **replace third-party SaaS addons with native modules inside RestoreAssist wherever the in-house version is viable or strategically stronger.**

Priority order (my recommendation):

1. **In-house e-signature (replaces DocuSign)** — viable and strategically stronger. _Electronic Transactions Act 1999_ (Cth) s10 admits any method "as reliable as appropriate." Our cryptographic chain-of-custody from Legal Paper 03 §4 (SHA-256 on-device + UTC + GPS + device UUID + user ID + signed attestation stored in immutable `ProgressAttestation`) is more tamper-evident than DocuSign's envelope trust model. Build this first — M-10 is its foundation.

2. **In-house carrier portal (inverts Guidewire dependency)** — we cannot replace IAG/Suncorp's internal Guidewire, but we can host a carrier-consumer portal where _our_ bundle is the interface and carriers come to us. This is Move 20 of the strategic-moat-rollout plan. Long-burn; scope after Sprint 1.

3. **In-house SMS/notifications (replaces Twilio)** — email-first (we already have `lib/email-send.ts`); SMS only as optional overlay via the cheapest viable API (MessageBird, Burst SMS). No strategic attachment to Twilio.

4. **Photo storage** — Cloudinary is a utility. Leave as-is; replace with S3 later only if cost justifies. Not strategic.

### What PC1 and PC2 are doing (don't duplicate)

**PC1 is taking (backend + schema):** M-1, M-2, M-3, M-4, M-5 (hot file — schema), M-6, M-7 (hot file — schema), M-20, M-21 Sprint-1 umbrella.

**PC2 (Mac) default queue (frontend + observability):** M-14, M-15, M-16, M-17.

### Hot files you must not touch

Without a `[COORD]` claim first:

- `prisma/schema.prisma` — PC1 owns while M-5 and M-7 are live
- `CLAUDE.md`, `work-together.md`, `vercel.json`, `package.json`, `pnpm-lock.yaml`
- `.claude/board-2026-04-18/**` — frozen board records

### Coordination cadence

- Post `[CLAIM]` before starting a ticket
- Post `[DONE] swarm=PC3 pr=#NNN` when shipping
- Append session-start / session-end entries to `.claude/swarm/coordination.md`
- Push every 30 min of active work so PC1 + PC2 can see state

### Residual break-test backlog (when idle)

59 break-test tickets RA-1297 → RA-1368. PC1 has knocked down 20. Anything still `Todo` is claimable. Recommended if PC3 is waiting on CI or integrations: pick up `RA-1317` (bulk-export self-fetch) or `RA-1313` (monthly reset counter race) — both P2, both unrelated to Progress framework.

---

_Clear this entry once actioned._
