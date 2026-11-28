# RestoreAssist — Planned Mode to ShipIt

**Version:** 2.0 (public-repo copy) · **Status:** PLANNED — not execution authority · **Baseline:** `CleanExpo/RestoreAssist` `main` @ `3c0c06e6` · **Replaces:** v1.0 · **Evidence for every change:** `research-and-swot.md` in the RestoreAssist Walkthroughs Project (not in this repo)

Stage 0 security items are listed by ticket number only. Details are in Linear.

---

## Read this first

- **What this is.** The path from a plan to a shipped, watched RestoreAssist. It authorises planning only. Building, deleting, spending, external messages, merging and deploying still need the authority in section 1.
- **What "shipped" means.** ShipIt 1 is the ten Founding Trial businesses running real jobs on production (RA-7717). CRM and add-ons (RA-8218) are ShipIt 2 and later, down the same path.
- **The order.** Make it safe → one source of truth → finish discovery → fix the core journeys → polish → prove → ship → watch.
- **Biggest change from v1.0.** v1.0 started from zero. This starts from what exists: a known repo, a release gate that already runs, a 25-journey register, and named open blockers.
- **One in, one out.** Nothing new is added without something being retired (section 3).
- **Six decisions are yours** (section 12). Each has a recommended answer and a default, so work does not stop while you decide.

---

## 1. Mission and operating contract

Build a commercially viable, evidence-led restoration platform for Australia and New Zealand that is effortless to use, secure, resilient, extensible and capable of governed continuous improvement.

- **Preserve** existing customer workflows, data, entitlements and scientific integrity.
- **Outcome, for all six users** — business owner, admin, manager, accounts, field technician, home or business owner. Each can do their whole job start to finish without unnecessary re-entry, navigation, waiting or manual coordination.
- **Stays explicit:** consent, safety decisions, professional judgement and approvals. These are never optimised away.
- **Never fabricate** readings, standards, citations, customer data, dates or test receipts. An empty field stays empty and visible.
- **Wording:** reports say "aligned with" a standard, never "compliant" or "certified". Every standard is cited by its exact published edition (section 6).
- **Spend:** existing subscriptions only. Metered spend stays inside the standing A$5 a day. Any reviewer or tool that costs money is named, with its cost, before it is used. No silent paid fallback.
- **Authority (recommended; see D1):**
  - Routine changes merge when the existing release gate passes. No founder step.
  - Founder-only: spending, production credentials and settings, destructive or irreversible data changes, external communication, and putting a real business on production.
- **No builder certifies its own work.**

---

## 2. Verified starting position

| Fact | State |
|---|---|
| Canonical repo | `CleanExpo/RestoreAssist`, public, `main` protected |
| Branches | 100+, almost all machine-made mesh branches; 6 open PRs |
| Release gate | Already running: required check `nexus/release-receipt`, independent cross-vendor review on the exact change, secret-scan config, e2e suite |
| Nightly check | SPM posts PASS/FAIL on the Linear project |
| Requirements | 25 journeys (J1–J25) from the six-user walkthrough: 1 verified, 9 partial, 6 structural only, 2 missing, 7 unknown |
| Unfinished audits | Accounts, Technician, Operations |
| Apps | Web, plus iOS and Android in the same repo |
| Open safety items | RA-7588, RA-7703, RA-7449, RA-8620, RA-7861, RA-7704 |
| Release target | RA-7717 Founding Trial — Todo |
| Next product direction | RA-8218 CRM with add-ons — Backlog |

**Unknown until checked:** what production is configured with and where it is hosted; whether the twelve blockers from the last walkthrough are still live; whether ticket statuses match the code; what one JEV run costs.

---

## 3. One in, one out

| v1.0 introduced | v2.0 uses instead | Retired |
|---|---|---|
| A 12-state machine | Linear statuses + the five evidence states from the walkthrough register | The 12-state machine |
| Weighted score ≥95 as the pass mark | Hard gates + every mandatory check passing | The weighted pass rule |
| A new completion receipt | The existing release receipt, plus three fields | The separate template |
| "Locate the repo", machine inventory | The estate consolidation already under way | Those tasks |
| A 1956–2026 AI research wiki | Question-led evidence notes in the existing knowledge layer | The wiki and corpus |
| Phases P0–P9 | Stage 0–8. "P0/P1/P2" now means defect severity only | The phase labels |
| A deadline on every issue | Next action and blocker | The deadline field |
| Percentage usability targets | Counts against a measured baseline | The percentages |

---

## 4. Status and evidence rules

- **Evidence states:** VERIFIED (seen working on the deployed commit), PARTIAL, STRUCTURAL_ONLY (code exists, no working path), MISSING, UNKNOWN.
- **No status moves on an agent's say-so.** A move needs a receipt (section 10).
- **Slice rule.** A change that delivers part of a ticket names the open ticket that owns the rest. The parent stays open.
- **Exception states:** BLOCKED (names the one decision needed, and the safe work that continues meanwhile), QUARANTINED, ROLLED_BACK.
- **Every ticket carries:** owner, dependency, acceptance test, evidence link, commit, environment, next action.
- **Lanes run in parallel.** A blocked lane does not stop unrelated work.
- **One decision register.** Escalations are de-duplicated into it. Only decisions that need real human authority go in.

---

## 5. Stages

### Stage 0 — Safety floor

Nothing below starts on customer-facing work until these are VERIFIED.

- [ ] **RA-7588** Details in Linear.
- [ ] **RA-7703** Details in Linear.
- [ ] **RA-7449** Details in Linear.
- [ ] **RA-8620, RA-7861** Remove every path that writes invented facts or dates into a real record.
- [ ] **RA-7704** Re-verify the launch-blocker list and the twelve blockers from the last walkthrough on current `main`. Record each as an evidence state.
- [ ] **History scan.** The repo is public, so everything ever committed is already readable. Scan full history for secrets, customer data and paid standards text. Anything found is rotated or reported; history rewriting needs separate approval (D2).
- [ ] **Privacy position.** Get a qualified answer on two points: whether the Australian automated-decision disclosure rule applies to the AI scope, estimate and report features; and how homeowners in New Zealand are told their details were collected through a restorer or insurer.
- **Exit:** every item VERIFIED on the deployed commit by a reviewer who did not build it. Zero cross-business reads in negative tests across API, database and storage.

### Stage 1 — One source of truth

Runs inside the estate consolidation. This plan adds only what is specific to RestoreAssist.

- [ ] Classify the 100+ branches: merged, open PR, or abandoned with unique commits. Delete only merged-and-proven. Tag and archive the rest. No deletion by age or name.
- [ ] Agree how mesh runners behave during clean-up so open PRs do not churn.
- [ ] Manifest every other copy on the three machines and external drives: path, last commit, unique changes. Mac mini disk is a hard limit; backups go to external or cloud storage, encrypted, with a tested restore.
- [ ] Record what production runs: host, region, setting names (not values), scheduled jobs, backups. Settle whether the DigitalOcean files or `vercel.json` describe the live site.
- [ ] No customer data, secrets, paid standards or private datasets in Git.
- **Exit:** a clean clone installs, builds and passes tests; migrations replay and roll back on a scratch database; no unique work lost; production configuration written down; before and after counts for branches, size, build time and dependencies.

### Stage 2 — Finish discovery, freeze the requirements

- [ ] Requirements list = J1–J25, plus mobile apps, accounting sync, Margot and offline capture.
- [ ] Complete the Accounts, Technician and Operations audits.
- [ ] One signed-in walk of all six users on the deployed commit. Each journey gets an evidence state.
- [ ] Mark each requirement critical or not. Critical = touches money, privacy, separation between businesses or customers, evidence, or report calculations.
- [ ] Measure the baseline per journey: time, manual actions, duplicate entry, backtracking, waiting, handoffs.
- **Exit:** no UNKNOWN rows; critical list frozen; baseline recorded.

### Stage 3 — Core workflow repair and redesign

Reference journey: sign in → create or import claim → property and room setup → floor plan → capture readings and photos → validate evidence → estimate and scope → review exceptions → approve → PDF, export, share → follow-up and closure.

- [ ] One source of truth per job, room, reading, photo and document. No duplicate entry. Autosave, resumable sessions, visible sync status, safe repeat-writes, undo for reversible actions.
- [ ] Next-action prompts, smart defaults that show where they came from, templates, batch capture, shortcuts, deep links, useful empty, error and loading states.
- [ ] Offline-first capture where it fits. Originals and photo metadata preserved, display rotation corrected, large uploads, retries, interrupted sessions and conflicts handled. Evidence is never silently overwritten.
- [ ] Role hand-backs work: owner and manager can finish a technician's job; a staff member leaving never takes jobs, clients or reports with them.
- [ ] State changes are explicit, role-checked, safe under two people editing at once, and leave an audit trail. Cancel, reopen and recover all work.
- [ ] Australia and New Zealand both correct: tax rate, currency and labels identical on screen and in the PDF.
- [ ] Priority regression checks: floor-plan sketch, room-based evidence, storage multi-select, upload-to-estimate and PDF, minimal room capture. These are earlier concerns, not newly verified defects.
- [ ] Test with consented or synthetic jobs: water, mould, sewage, fire, biohazard, multi-room, incomplete data, revised scope, disputed evidence. No unsupported professional conclusions.
- **Exit:** every critical journey VERIFIED in a six-user walk.

### Stage 4 — UI/UX and accessibility

- [ ] Consistent responsive components, navigation, type, focus states, touch targets, feedback, readable charts, units and contrast. Target WCAG 2.2 AA, by automated and manual check.
- [ ] Test desktop, tablet and phone, both orientations, keyboard-only, screen reader, zoom, reduced motion, slow networks, glare and one-handed use.
- [ ] Cover sign-up, login, recovery, onboarding, role switching, billing, cancellation, capture, validation, search, reports, share and support, including empty, loading, stale, error, partial-success and permission-denied states.
- [ ] Plain Australian English at about a Year 5 reading level for navigation and help. Precise scientific and legal terms stay in reports, with explanations.
- [ ] Real users, not only AI personas. The pilot businesses are the test group.
- [ ] **Report counts, not percentages.** Ten businesses cannot prove a percentage: it takes 59 clean attempts in a row to show 95% completion with confidence. Every unassisted failure on a critical task is logged as a defect.
- **Exit:** no dead ends; no critical accessibility failures; no unexplained duplicate entry; core-task time better than the Stage 2 baseline, or the exception written down.

### Stage 5 — Security, privacy, compliance and evidence integrity

- [ ] Threat model: assets, trust boundaries, separation between businesses, AI tool privileges, **and the agent runners and tools that build the product**.
- [ ] Verify against the pinned editions in section 6.
- [ ] Test sign-in, MFA where appropriate, recovery, session expiry and revocation, roles, direct-object access, separation between businesses, service roles, storage rules and privilege escalation. Negative tests are mandatory across API, database and storage.
- [ ] Test injection, XSS, CSRF, SSRF, upload abuse, malicious files, path traversal, rate limits, replay, signed links, webhook signatures, dependency findings, secrets and supply chain. Produce a software bill of materials and check licence duties.
- [ ] AI tests: prompt injection through photos, PDFs and web content; data leakage; tool misuse; retrieval across businesses; fabricated references; runaway cost. Outside content is untrusted data. Least privilege is enforced outside the model.
- [ ] Evidence integrity: encryption in transit and at rest, key rotation, tamper-evident custody records, time sync, original evidence hashes, access logs, report version history. Deletion and retention checked against real obligations and legal holds.
- [ ] Privacy: data minimisation, consent, purpose limits, export, deletion and incident response all tested. Breach runbook includes the 30-day assessment duty. Hosting region and every third party that touches customer data are listed.
- [ ] Qualified review of Australian and New Zealand privacy law and applicable building, restoration, safety and consumer duties. A finished checklist is not a compliance claim.
- [ ] Independent penetration test proportional to risk, scope and leftover risk recorded (D3).
- **Exit:** zero unresolved critical or high exploitable issues; zero cross-business leaks; zero exposed live secrets.

### Stage 6 — AI intelligence, governed learning and self-healing

Keep the parts separate: fixed guardrails, retrieval, bounded reasoning, tool use, verification, feedback. Production models never train on customer data automatically. Any tuning needs data rights, isolation, consent where required, offline evaluation and approval.

**Pipeline**
1. Capture authorised context and evidence. Check units, quality, source and permissions.
2. Generate candidate actions or answers within supported tools, professional scope and policy.
3. Verify calculations with fixed functions. Check each citation against the real source passage.
4. Abstain or escalate when evidence is thin or risk is over policy. Say what is missing.
5. Take only reversible, authorised actions, inside budgets, safe to repeat. Log the outcome and the rollback reference.
6. Score results against a frozen rubric and known answers, not model confidence.

**Learning loop:** observe → consent and filter → label → hypothesise → offline experiment → independent evaluation → shadow → approved canary → monitor → promote or roll back.

- [ ] Capture corrections, accepted and rejected suggestions, task success, friction, support incidents and verified outcomes. Clicks, acceptance and speed are not correctness.
- [ ] Personalise per user and per business with no leakage between customers. Provide reset, opt-out and explanation.
- [ ] Version prompts, indexes, policies, model IDs, datasets and experiments. Freeze held-out tests. Guard against test leakage, reward gaming, poisoned feedback and regression.
- [ ] Try the simplest method first. A fixed rule beats retrieval, and retrieval beats an agent, whenever results are equal. Record accuracy, task success, speed, cost and uncertainty for each.
- [ ] Test calculations, units (including WME and g/kg), missing readings, outliers, contradictory evidence, source grounding, unsafe advice, provider outage and hostile input.
- [ ] Label every AI statement SOURCE, INFERRED or UNVERIFIED, as the mould verification work already does.
- [ ] Keep a register of which AI outputs feed decisions about people. It supplies the privacy-policy wording from Stage 0.
- [ ] Self-heal only bounded, pre-authorised, reversible failures: retry with backoff, refresh expired non-privileged context, resume checkpoints, isolate failed jobs, switch to an approved equivalent path. Circuit breakers, retry limits, spend limits, watchdogs, dead-letter queues and kill switches are mandatory.
- [ ] Never self-modify security policy, billing, production data or deploy authority.
- [ ] Fault tests: partial writes, process kill, network loss, duplicate delivery, timeouts, malformed replies. Recovery keeps evidence and never reports false success.
- [ ] Standards text in AI answers follows D4.

### Stage 7 — Commercial

**ShipIt 1 — Founding Trial**
- [ ] One documented action grants the trial and opens what the offer promises. Seats, rates and add-ons work without a payment prompt.
- [ ] Billing belongs to the owner. Staff cannot reach checkout or the billing portal.
- [ ] Test payment success and failure, duplicate and out-of-order webhooks, expired cards, prorations, refunds, lapse, access changes, export and graceful degradation.
- [ ] Cancelling is as easy as signing up, with clear renewal notices. Build to the Australian subscription rules now rather than later.
- [ ] A customer's own retained evidence is never locked behind a paywall without lawful policy review.
- [ ] Support docs, onboarding, demo business, service status, incident contacts and a support route that reaches a named person.
- [ ] Pilot businesses come on one at a time.

**ShipIt 2 and later — CRM and add-ons**
- [ ] Follow the founder rulings in RA-8218: CRM core, import from the old CRM, bookkeeping link, full bring-your-own-key, then SMS and voice.
- [ ] Each add-on proves demand, attach rate, willingness to pay, cost to serve and support load before it is built out.
- [ ] Add-ons sit behind feature flags and cannot weaken core security or break base workflows.
- [ ] Customer keys: secure storage, revocation, provider budgets. No surprise charges.

### Stage 8 — ShipIt and operations

- [ ] Freeze scope and the release commit. Produce a traceable build, migration plan, release notes, known risks and an evidence index.
- [ ] Deploy to a staging copy that matches production, with safe data. Run every mandatory suite and the independent release review. Reconcile CI, GitHub and ticket status against real receipts.
- [ ] Canary or feature-flag rollout. Watch error rates, speed, separation indicators, AI correctness and cost. Halt or roll back automatically inside the approved runbook when a threshold is crossed. Migrations are backward-compatible or have a tested recovery.
- [ ] Live smoke tests, billing and report outputs with authorised test accounts. Record the production commit, environment, monitoring and incident owner.
- [ ] **Watch period, by events not hours:** three nightly SPM passes in a row on the released commit, and the first three real pilot jobs closed end to end with no gate breached. Then a follow-up review before the release is called complete.
- [ ] Hand over: user guide, operator runbook, security report, test report, architecture, dependency list, known limits, prioritised backlog.
- [ ] Never delete evidence because a task says it is finished. Archive logs only after verified closure and retention checks.

### Track R — Research (parked, off the critical path)

- A research question is opened only when a Stage 6 decision cannot be made without it.
- Each question records: the product decision it serves, search terms, sources, inclusion rules, what was found, what was not, and the experiment it leads to.
- Notes live in the existing knowledge layer. No new wiki. Link to lawful copies; store full text only where permitted.
- A method is adopted only if it beats a defined baseline on held-out product tests at acceptable cost and safety.
- A paper is never an instruction to execute. No claim of complete coverage is ever made.
- Lineage leads from v1.0 (symbolic, statistical, reinforcement, evolutionary, deep learning, agentic, continual learning, alternative computation) are kept as a reading list only.

---

## 6. Pinned standards and rules

| Area | Pin |
|---|---|
| Application security | OWASP ASVS 5.0.0 |
| API security | OWASP API Security Top 10 (2023) |
| AI security | OWASP Top 10 for LLM Applications (2025); OWASP Top 10 for Agentic Applications |
| Mobile security | OWASP MASVS — version pinned at execution |
| Accessibility | WCAG 2.2 AA (ISO/IEC 40500:2025) |
| Page speed | LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1, each at the 75th percentile |
| AI governance | Australian Guidance for AI Adoption — six practices, used as a checklist |
| Privacy, Australia | Privacy Act and APPs, including the automated-decision disclosure (APP 1.7–1.9) and the 30-day breach assessment |
| Privacy, New Zealand | Privacy Act 2020, including IPP 3A (indirect collection) |
| Consumer, Australia | Australian Consumer Law, including the subscription rules |
| Water damage | AS-IICRC S500:2025 (adopts and modifies ANSI/IICRC S500:2021) |
| Mould | ANSI/IICRC S520:2024 |
| Trauma and crime scene | ANSI/IICRC S540 (2023) |
| Fire and smoke | ANSI/IICRC S700:2025 |

Commencement dates and sources are in `research-and-swot.md`. Every pin is re-checked at the start of execution.

---

## 7. Test matrix

| Suite | Required coverage and evidence |
|---|---|
| Static and build | Types, lint, imports, secrets, dependencies, reproducible build, bill of materials |
| Unit and property | Calculations, units, boundaries, randomised invariants, rounding, state changes |
| Integration and contract | API, database, storage, migrations, queues, webhooks, provider contracts, backward compatibility |
| End to end | All six users, every critical journey, happy, negative and edge paths, offline, recovery |
| Mobile | iOS and Android builds, sign-in, capture, offline sync, store requirements |
| Visual and accessibility | Screenshot comparison across widths, keyboard, screen reader, manual checks |
| Security and privacy | Threat model, static and dynamic scans, separation, hostile AI input, penetration test, retention |
| Data quality | Completeness, accuracy, duplicates, reconciliation, missing values, schema drift, lineage |
| AI evaluation | Held-out labelled cases, grounded citations, calibration, abstention, repeated runs, red-team |
| Performance | p50, p95, p99, concurrency, realistic payloads, cold starts, upload throughput, quotas |
| Resilience | Fault injection, retries, safe repeats, outages, restore, rollback, failover |
| Compatibility | Supported browsers and devices, PDF rendering, exports and imports, integrations, time zone and locale |
| Scientific and reporting | Reference calculations, source validation, evidence custody, independent qualified review |
| Commercial | Entitlements, payments, tax for both countries, lifecycle, cancellation, support readiness |
| Operations | Alerts, trace IDs, service targets, log retention, incident drills, runbooks, ownership |

- Synthetic fixtures plus authorised, properly handled real evidence. Record seed, test version, commit, environment and result.
- A flaky test is investigated, not re-run until green.
- Every critical requirement from Stage 2 has a test.
- Proposed starting targets, each subject to baseline and host validation: ≥90% branch coverage on critical fixed-logic modules; p95 ≤500 ms for common interactive API calls under agreed load; recovery point ≤15 minutes and recovery time ≤60 minutes. Long AI tasks show progress and have their own measured targets.

---

## 8. Release gate

**The gate is what already runs**, with the hard gates below added.

- **Per change:** the required `nexus/release-receipt` check and its independent cross-vendor review.
- **Per night:** SPM pass or fail.
- **Per release:** the six-user walk on the deployed commit, plus an independent release review (D5).

**Hard gates. Any failure is NO SHIP.**
- No open P0 or P1 defects.
- No unresolved critical or high exploitable security risk.
- No leak between businesses or between customers.
- No fabricated evidence, reading, date or citation.
- Every critical journey and report calculation passes.
- Backup, restore and rollback verified.
- No unauthorised spend or data movement.
- No unapproved production change.
- Every standard cited by its exact edition, with "aligned with" wording.

**Dimension checklist.** Each dimension passes when every mandatory check in it passes with evidence. Missing evidence fails the dimension.

| Dimension | Reporting weight |
|---|---|
| Workflow and friction | 15% |
| UI/UX and accessibility | 12% |
| Security and privacy | 15% |
| Scientific accuracy and evidence | 15% |
| AI intelligence and learning | 12% |
| Reliability and recovery | 10% |
| Performance | 6% |
| Architecture and maintainability | 5% |
| Commercial readiness | 5% |
| Compliance and operations | 5% |

- The weighted score is a trend report between releases. It is never a pass mark.
- Mandatory checks for each dimension are written and frozen before the first scoring.
- The independent reviewer records disagreement, uncertainty and dissent.

---

## 9. Friction index

Lower is better. Each part is scaled 0 to 1 against the Stage 2 baseline and a fixed target.

F = 100 × (0.30 unnecessary manual actions + 0.25 duplicate entry + 0.20 avoidable backtracking + 0.15 avoidable waiting + 0.10 unnecessary handoffs)

- Not computed until the Stage 2 baseline exists.
- Feeds the "Workflow and friction" dimension as one mandatory check: F on the release is lower than F on the baseline, with no drop in quality.
- Safety and consent steps are excluded, never trimmed.
- What counts as "unnecessary" is confirmed with real users.

---

## 10. Receipt

Use the existing release receipt, bound to the change itself. Add three fields:

```
requirement: <J-number or ticket>
expected / actual: <criterion> / <measured outcome>
residual_risk and rollback: <description> / <reference>
```

A receipt is written by a reviewer who did not build the change.

---

## 11. Lanes and dependencies

| Lane | Delivers | Depends on |
|---|---|---|
| A Safety floor | Stage 0 items VERIFIED | RA-7588 (details in Linear) |
| B Custody | Branch clean-up, manifest, production record | Estate consolidation; D2 |
| C Discovery | Three audits, six-user walk, frozen requirements, baseline | Lane A for anything touching live data |
| D Workflow and UX | Stages 3 and 4 | Lane C |
| E Security and privacy | Stage 5 | Lane B production record; D3 |
| F AI and learning | Stage 6 | Lane C baseline; Lane E threat model; D4 |
| G Commercial | Stage 7 | Lanes A and D |
| H Release | Stage 8 verdict and package | All mandatory evidence; D1, D5 |
| R Research | Track R notes | A Stage 6 question only |

- Core revenue journeys, security and evidence integrity come before optional features.
- Small changes, one integration owner, no two agents in the same files.
- No invented timelines. Estimate after the Stage 2 baseline.

---

## 12. Decisions for the founder

| ID | Decision | Recommendation | Default if unanswered |
|---|---|---|---|
| D1 | Who may merge and deploy. Three standing rules disagree. | Routine changes merge on a passing gate. Founder-only for spend, production credentials and settings, destructive or irreversible data changes, external communication, and onboarding a real business. | Anything touching migrations or customer data waits for the founder; everything else merges on the gate. |
| D2 | Repo stays public or goes private. | Go private, after checking that CI stays inside the spend rule on a private repo. | Stay public; history scan is mandatory; no history rewrite. |
| D3 | Paid independent checks: penetration test and legal or privacy review. Subscription models cannot supply these. | Approve one fixed, scoped amount before the tenth pilot business. Usability testing comes free from the pilots. | Ship on the internal hostile-test suite only; the gap is written on the release record; no claim of independent testing is made. |
| D4 | Standards text in AI answers (RA-7684). | Until written permission is on file, AI gives the standard's name, edition and section reference only. No reproduced text. | Same. |
| D5 | JEV as the release reviewer. It is a metered lane. | Use it only if its cost per release is known and fits the daily limit. | The cross-vendor review already in the gate. |
| D6 | Research track. | Parked until ShipIt 1 is live and stable. | Parked. |

---

## 13. First execution checkpoint (once authorised)

- Lane A starts with RA-7588. Details in Linear.
- Lane B records what production runs and classifies branches, read-only.
- Lane C finishes the three audits and drafts test cases.
- One consolidated decision register comes back with D1–D6 and nothing else.

The plan is complete when saved and reviewed. The product is not complete until ShipIt and the watch period pass.

---

## 14. Assumptions and limits

- Built from read-only checks of GitHub, Linear and this Project's documents, and from primary web sources. No code was changed, no test run, nothing deployed.
- Ticket statuses are as Linear shows them. They may not match the code.
- Earlier walkthrough findings need re-verification on current `main`.
- Numerical targets and add-ons are proposals, subject to baseline, host, risk and commercial validation.
- Legal items state what the rules say. How they apply needs a qualified reviewer.
- No claim of legal compliance, complete research coverage or product readiness is made.
