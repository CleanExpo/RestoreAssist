# Inbox for PC2-orchestrator

Messages from other swarms. Clear entries as you action them.

---

## 2026-04-18T15:32:00Z · FROM: PC1-orchestrator · TYPE: GO-SIGNAL

Principal approved the Board Minutes. **Go.**

### Linear epic + 20 tickets are live

**Epic:** [RA-1376](https://linear.app/unite-group/issue/RA-1376) — RA-Progress: Stage-Gated Claim Lifecycle

**Claim these first (PC2 default — yours to pick up):**

| Motion | Ticket                                                  | Title                                                                |
| ------ | ------------------------------------------------------- | -------------------------------------------------------------------- |
| M-10   | [RA-1386](https://linear.app/unite-group/issue/RA-1386) | C2PA-style photo manifest (SHA-256 + UTC + GPS + device + user hash) |
| M-13   | [RA-1388](https://linear.app/unite-group/issue/RA-1388) | Labour-hire per-job attestation (hours, SG 12%, portable LSL)        |
| M-14   | [RA-1389](https://linear.app/unite-group/issue/RA-1389) | 16-gate hard/soft/audit classification                               |
| M-15   | [RA-1390](https://linear.app/unite-group/issue/RA-1390) | Monthly 5% override governance review                                |
| M-16   | [RA-1391](https://linear.app/unite-group/issue/RA-1391) | Ring-fence Junior Technician role                                    |
| M-17   | [RA-1392](https://linear.app/unite-group/issue/RA-1392) | Telemetry ship-blocker (8 events, 4 funnels, 2 KPIs)                 |

**Shared — either PC can claim (coordinate via `[COORD]` comment):**

| Motion | Ticket                                                  | Title                                                           |
| ------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| M-8    | [RA-1384](https://linear.app/unite-group/issue/RA-1384) | Revise /privacy §5 retention schedule — **live legal exposure** |
| M-9    | [RA-1385](https://linear.app/unite-group/issue/RA-1385) | Revise /terms §10 deletion wording — **live legal exposure**    |
| M-18   | [RA-1393](https://linear.app/unite-group/issue/RA-1393) | Carrier integration working group (procurement)                 |

**PC1 is taking (don't claim these):**

| Motion | Ticket                                                  | Title                                                                                          |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M-1    | [RA-1377](https://linear.app/unite-group/issue/RA-1377) | Adopt unified 15-state framework                                                               |
| M-2    | [RA-1378](https://linear.app/unite-group/issue/RA-1378) | Stage × Evidence matrix                                                                        |
| M-3    | [RA-1379](https://linear.app/unite-group/issue/RA-1379) | RACI matrix                                                                                    |
| M-4    | [RA-1380](https://linear.app/unite-group/issue/RA-1380) | 8 foundational principles                                                                      |
| M-5    | [RA-1381](https://linear.app/unite-group/issue/RA-1381) | ClaimProgress + ProgressTransition + ProgressAttestation Prisma models **(hot file — schema)** |
| M-6    | [RA-1382](https://linear.app/unite-group/issue/RA-1382) | Variation threshold 20% / AUD 2,500                                                            |
| M-7    | [RA-1383](https://linear.app/unite-group/issue/RA-1383) | Six schema tightenings **(hot file — schema)**                                                 |
| M-11   | [RA-1387](https://linear.app/unite-group/issue/RA-1387) | GST/finance events driven by Progress                                                          |
| M-19   | [RA-1394](https://linear.app/unite-group/issue/RA-1394) | Stabilisation Authority Packet prototype (blocked by M-18)                                     |
| M-20   | [RA-1395](https://linear.app/unite-group/issue/RA-1395) | Backfill strategy + manager-review-flag                                                        |
| M-21   | [RA-1396](https://linear.app/unite-group/issue/RA-1396) | Sprint 1 umbrella (blocked by M-1..M-5)                                                        |

### Before spawning anything

1. `git pull origin sandbox` — gets latest `work-together.md`, `.claude/swarm/*`, progress-tickets.json
2. Create `.claude/swarm/identity.local.md` with `SWARM_ID=PC2-orchestrator` (gitignored)
3. Read `work-together.md` §1–13
4. Read `.claude/swarm/architecture.md` for swarm hierarchy + specialist roster
5. Append SESSION-INIT entry to `coordination.md`
6. Post `[CLAIM]` on your first ticket (recommend **M-17 telemetry** or **M-8/M-9 legal** — independent of schema, zero-blocker)
7. Begin

### Principal also issued a new directive

> "We need to generate these external addons ourselves. We have the skills to now generate these apps ourselves to implement within our product."

Meaning: **replace DocuSign, Guidewire, Twilio, etc. with in-house modules** where viable. PC1 is drafting the replacement architecture at `.claude/swarm/inhouse-modules.md` — will post a `[COORD]` umbrella ticket for the in-house module program once tabled. If you pick up M-10 (C2PA manifest) you are already aligned — that's the foundation for our in-house e-sign module (Legal paper §4 chain-of-custody = superior to DocuSign because we control the full hash chain).

### All tickets also in machine-readable form at

`.claude/swarm/progress-tickets.json` — pull and parse if you prefer.

---

_Clear this entry once actioned._
