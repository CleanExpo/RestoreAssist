# RestoreAssist — Broker/Assessor Persona: Video Research Brief

**Prepared:** 2 June 2026
**Persona:** Insurance Broker / Loss Assessor
**Product:** RestoreAssist (S500/S520/S540/S700 compliance platform)
**CEO:** Phill McGurk
**Tone:** Operational, trustworthy, conservative, fieldwork-grade
**Positioning:** Evidence-based tooling for assessors — not a sales pitch

---

## 1. Claims Assessment Workflow — Top 5 Compliance Decision Points

These are the critical moments in an assessor's workflow where proof of compliance and documentation quality directly determines whether a claim is approved, queried, or denied.

### Moment 1: Initial Notification & Scope Validation

- **What happens:** Assessor receives first notification of loss (FNOL) and reviews the contractor's initial damage assessment.
- **Compliance gate:** Does the report categorise water damage per IICRC S500 Category (1/2/3) and Class (1–4) correctly? Is the scope of works justified by documented evidence?
- **Decision impact:** Incorrect categorisation can inflate or deflate the claim by 30–60%. Assessors must validate that the contractor's classification is defensible before forwarding to the insurer.
- **RestoreAssist proof:** AI-drafted reports automatically cite the relevant S500 section for each categorisation decision, creating an auditable rationale.

### Moment 2: Photographic Evidence Review

- **What happens:** Assessor reviews pre-mitigation and in-progress photos to confirm damage extent and that proposed works are proportionate.
- **Compliance gate:** Are photos time-stamped, geolocated, and tamper-evident? Do they show moisture readings, affected materials, and room-by-room condition matching the written scope?
- **Decision impact:** Photos without chain-of-custody are inadmissible in disputes. Missing angles or generic stock-style images trigger re-inspection requests, delaying payment by weeks.
- **RestoreAssist proof:** SHA-256 cryptographic hashing on every photo creates an immutable chain-of-custody. Assessors can independently verify no image has been altered post-capture.

### Moment 3: Moisture Mapping & Drying Verification

- **What happens:** Assessor reviews moisture readings and drying logs to confirm that the property has reached acceptable equilibrium moisture content (EMC) or that continued drying is justified.
- **Compliance gate:** Are readings taken per S500 Section 10 methodology (psychrometrics, grain depression, vapour pressure differential)? Are readings at regular intervals with equipment calibration logs?
- **Decision impact:** Incomplete drying logs are the most common reason for supplementary claims. Assessors need to see that the contractor followed the standard, not just that the job was done.
- **RestoreAssist proof:** Structured moisture mapping with timestamped readings, psychrometric calculations, and equipment logs — all formatted to S500 documentation requirements.

### Moment 4: Cost & Scope Reconciliation

- **What happens:** Assessor cross-references the contractor's invoice against the documented scope, checking for over-servicing, phantom line items, or deviations from the approved works.
- **Compliance gate:** Does every line item on the invoice trace back to a documented decision in the report? Are materials and labour hours proportional to the damage class and affected area?
- **Decision impact:** Scope creep without documentation is the primary driver of disputes between assessors and contractors. Each unverified line item becomes a negotiation point that delays settlement.
- **RestoreAssist proof:** Full audit trail linking each scope item to its originating evidence (photo, moisture reading, S500 citation), enabling assessors to reconcile costs against documented need.

### Moment 5: Final Certification & Report Submission to Insurer

- **What happens:** Assessor compiles the contractor's documentation into a final report for the insurer, certifying that the restoration was conducted per industry standards.
- **Compliance gate:** Is the final report formatted to IICRC standards? Does it include all required sections (executive summary, methodology, evidence register, drying verification, clearance statement)?
- **Decision impact:** A poorly formatted or incomplete final report reflects on the assessor's credibility with the insurer. Assessors bear reputational risk — they are certifying the work met standard.
- **RestoreAssist proof:** AI-generated final reports output in S500-compliant structure with all required sections populated, citations verified, and a complete evidence index attached.

---

## 2. Pain Points — Broker/Assessor Perspective

### 2.1 Incomplete Reports

- Contractors submit reports missing critical sections (psychrometric data, equipment logs, clearance statements).
- Assessors spend 30–90 minutes per report chasing missing information via phone and email.
- Incomplete reports cannot be forwarded to the insurer, creating bottlenecks in the claims pipeline.
- **Severity:** High — directly delays claim settlement and creates SLA breaches with insurers.

### 2.2 Missing or Unusable Photos

- Photos arrive with no room labels, no moisture meter in frame, no before/after pairing.
- Some contractors submit blurry, poorly lit, or obviously post-edited images.
- No way to verify when a photo was actually taken versus when it was uploaded.
- **Severity:** High — photographic evidence is the backbone of claim defensibility. Without it, assessors cannot justify scope to the insurer.

### 2.3 Non-Compliant S500 Formatting

- Reports use outdated S500 editions, mix terminology from different IICRC standards, or fail to cite any standard at all.
- Categorisation decisions lack supporting rationale (e.g., "Category 3 water" with no contamination source identified).
- Drying logs missing psychrometric calculations or using ambient-relative-humidity-only methodology.
- **Severity:** Medium-High — assessors must either reformat reports themselves (absorbing the risk) or reject and request revision, adding days to the cycle.

### 2.4 Delayed Documentation

- Contractors complete works but take 5–14 days to submit reports, photos, and invoices.
- Assessors cannot close the claim file, and insurers escalate for status updates.
- Late documentation also means moisture readings and site conditions cannot be retrospectively verified.
- **Severity:** Medium — operational friction that compounds across a portfolio of active claims.

### 2.5 Contractor Credibility

- Assessors have limited visibility into whether a contractor is IICRC-certified, insured, or operating to standard.
- Some contractors inflate scopes, use unqualified technicians, or subcontract work without disclosure.
- Assessors who recommend a non-compliant contractor bear reputational and potentially liability risk.
- **Severity:** Medium-High — trust is the currency of the assessor-broker relationship. One bad contractor recommendation can cost an assessor their panel position.

### 2.6 Scope Disputes

- Contractor proposes works that exceed what the damage documentation supports.
- Disagreements over whether materials are salvageable (restoration vs. replacement) without objective evidence.
- Assessors caught between insurer cost-containment pressure and contractor advocacy.
- **Severity:** High — disputes are the most time-consuming aspect of the role and the most likely to result in formal complaints or Ombudsman escalation.

---

## 3. Feature-to-Need Mapping

| Assessor Need | RestoreAssist Feature | How It Resolves the Need |
|---|---|---|
| **S500-compliant reports without manual reformatting** | AI-drafted reports with S500 citations | Reports auto-generated with correct IICRC S500 (current edition) structure, terminology, and section citations. Assessor receives a document they can forward with confidence. |
| **Verifiable photographic evidence** | SHA-256 photo chain-of-custody | Every photo hashed at capture with timestamp and device metadata. Assessor can independently verify image integrity — no tampering, no misattribution. |
| **Current IICRC standard compliance** | IICRC edition discipline | Platform locked to current IICRC S500/S520/S540/S700 editions. No outdated terminology, no legacy references. Assessor knows the report references the live standard. |
| **Real-time visibility into job progress** | Client portal transparency | Assessor can view job status, photos, and drying logs in real-time via secure portal. No need to chase the contractor for updates. Full visibility without phone calls. |
| **Audit-ready documentation trail** | Complete audit trail | Every action, decision, reading, and photo is timestamped and logged. If a claim is disputed or audited, the evidence chain is complete and defensible. |
| **Scope validation against evidence** | Traceable scope-to-evidence linking | Each scope line item links to specific photos, moisture readings, and S500 citations. Assessors can verify that every dollar claimed is supported by documented need. |
| **Contractor credibility verification** | Compliance certification records | Platform records which IICRC certifications the contractor holds and whether the technician on-site was appropriately qualified. |

### Conservative Positioning Notes

- RestoreAssist does **not** replace the assessor's professional judgement. It provides better evidence for that judgement.
- The AI drafts reports based on documented inputs — an IICRC-qualified professional reviews and certifies all outputs.
- SHA-256 hashing proves an image has not been altered since capture; it does **not** prove the image accurately represents the site condition at the time (that remains the contractor's and assessor's professional responsibility).
- The platform enforces formatting compliance, not operational compliance. A correctly formatted report can still describe incorrect methodology — the assessor's review remains essential.

---

## 4. Video Format Recommendations

### 4.1 Case Study Format

**Recommended for:** Social proof and credibility building
**Structure:**
- Open with a real-world scenario (anonymised): "Assessor receives a Category 3 water loss report with 47 photos, no drying log, and a $38,000 scope."
- Walk through the pain: what made this report difficult to process, how long it took, what was missing.
- Show the RestoreAssist alternative: how the same scenario would look with compliant documentation, photo chain-of-custody, and traceable scope.
- Close with outcome: time saved, dispute avoided, claim settled in X days vs. Y days.

**Tone:** Measured, factual. No exclamation marks. No "game-changer" language.
**Length:** 3–4 minutes
**Distribution:** LinkedIn, email nurture, website

### 4.2 Feature Explainer

**Recommended for:** Educating assessors on specific capabilities
**Structure:**
- Problem-solution format: one pain point, one feature, one demonstration.
- Screen recording with voiceover showing the feature in action.
- Example: "Here's how SHA-256 photo verification works — from capture to assessor review."

**Tone:** Instructional, calm, competent. Show the tool, don't sell the tool.
**Length:** 2–3 minutes per feature
**Distribution:** YouTube, embedded in product pages, sent directly to assessors on enquiry

### 4.3 Compliance Certification Showcase

**Recommended for:** Panel qualification and trust-building
**Structure:**
- Position RestoreAssist as a compliance infrastructure provider, not just a reporting tool.
- Show the IICRC standards the platform supports, the audit trail it creates, and how it helps contractors and assessors meet their obligations.
- Brief appearance by Phill McGurk (CEO) or an IICRC-certified professional explaining why edition discipline matters.

**Tone:** Authoritative, institutional. This is the video you send to a loss adjusting firm's compliance officer.
**Length:** 2–3 minutes
**Distribution:** Direct outreach to panel firms, website homepage, LinkedIn

### 4.4 Recommended Production Approach

- **Style:** Dark-first visual identity, clean screen recordings, minimal motion graphics. No stock footage of smiling office workers.
- **Audio:** Professional voiceover (Australian accent preferred, neutral regional). Clear, unhurried pacing.
- **Graphics:** Annotations, callouts, and highlights on the product UI. Data visualisations for audit trails.
- **Music:** Subtle, atmospheric. No upbeat corporate tracks. Think documentary, not advertisement.
- **Call to action:** Understated. "Request a compliance demonstration" — not "Get started today!"

---

## 5. Script Outline — "How to Verify S500 Compliance in Under 5 Minutes"

**Format:** Screen recording walkthrough + voiceover
**Target:** Insurance assessors who need to validate a contractor's restoration report before approving payment
**Length:** 4:30–5:00
**Tone:** Calm, instructional, respectful of the assessor's expertise

---

### COLD OPEN (0:00–0:15)

**Visual:** Dark screen. White text appears: "You have 23 claims on your desk. Three contractors just sent reports. One is compliant. One is close. One needs to be rejected."

**Voiceover:**
> "As an assessor, your job isn't to write reports — it's to verify them. And that verification is only as strong as the documentation in front of you. This is how RestoreAssist makes that process defensible, in under five minutes."

---

### SECTION 1: THE REPORT STRUCTURE CHECK (0:15–1:15)

**Visual:** RestoreAssist report view. Assessor sees a completed restoration report with all S500 sections visible in a structured layout.

**Voiceover:**
> "First, the structure. A compliant S500 report requires specific sections: executive summary, water category and class determination, scope of works, moisture mapping, drying methodology, equipment log, and clearance statement."

**Action:** Cursor highlights each section. A green indicator shows "Complete" next to each.

> "RestoreAssist enforces edition-locked S500 structure. If a section is missing or incomplete, the report cannot be submitted. You will never receive a report with gaps that you have to chase."

**Key message:** Structure is binary. It's either compliant or it isn't. The platform enforces this before the report reaches the assessor.

---

### SECTION 2: CATEGORY & CLASS VERIFICATION (1:15–2:15)

**Visual:** Close-up on the Category/Class determination section. S500 citation visible (e.g., "Per IICRC S500 4th Edition, Section 5.2").

**Voiceover:**
> "The categorisation decision is where most disputes originate. You need to see not just what category was assigned, but why."

**Action:** Cursor clicks into the categorisation rationale. Supporting evidence appears: source of water identified, contamination risk documented, affected materials listed.

> "RestoreAssist links every categorisation to the specific S500 section that governs it, and to the field evidence that supports the determination. If a contractor classifies water as Category 3, the platform requires documented evidence of the contamination source."

**Key message:** Categorisation without rationale is just an opinion. The platform makes it an evidence-based determination.

---

### SECTION 3: PHOTOGRAPHIC INTEGRITY VERIFICATION (2:15–3:15)

**Visual:** Photo gallery view in RestoreAssist. Each thumbnail shows a green lock icon and a hash string.

**Voiceover:**
> "Photographs are the most frequently disputed evidence in water damage claims. The question is always: can you trust what you're looking at?"

**Action:** Cursor hovers over a photo. Metadata overlay appears: capture timestamp, device ID, GPS coordinates, SHA-256 hash. Assessor clicks "Verify" — hash is recomputed and matched against the stored value.

> "Every photograph uploaded through RestoreAssist is hashed with SHA-256 at the point of capture. That hash is immutable. If anyone alters the image — even a single pixel — the hash won't match. You can verify this yourself, in seconds."

**Key message:** Photographic evidence that can be independently verified is evidence that holds up in disputes.

---

### SECTION 4: SCOPE-TO-EVIDENCE RECONCILIATION (3:15–4:15)

**Visual:** Split view — scope of works on the left, supporting evidence on the right.

**Voiceover:**
> "The final check: does the invoice match the evidence? This is where scope disputes live."

**Action:** Cursor selects a line item: "Remove and replace 12m² plasterboard — Bedroom 2." The right panel shows: three pre-demolition photos of Bedroom 2, moisture readings from the affected wall, and the S500 citation for material removal threshold.

> "Every line item in a RestoreAssist scope links directly to the evidence that justified it. Photos, moisture readings, standard citations — all traceable. If a line item cannot be supported by the documentation, it should not be there. And on this platform, it won't be."

**Key message:** Cost containment isn't about pushing back on contractors — it's about ensuring every dollar is supported by documented, standard-compliant evidence.

---

### CLOSING (4:15–4:50)

**Visual:** Full report view with all verification checkmarks green. Summary panel: "S500 Compliant — 4th Edition | Evidence Chain: Complete | Ready for Submission."

**Voiceover:**
> "Structure. Categorisation. Photo integrity. Scope reconciliation. Four checks. Under five minutes. And every step is documented in the audit trail — for your file, the insurer's file, and if it ever comes to it, for the Ombudsman."

**Pause.**

> "RestoreAssist doesn't make the decisions for you. It gives you the evidence to make defensible ones."

---

### END CARD (4:50–5:00)

**Visual:** RestoreAssist logo. Dark background. Text: "Request a compliance demonstration." URL. No countdown timer. No "limited spots."

**Voiceover:**
> "restoreassist.app"

---

## Appendix: Messaging Guardrails

These constraints should be observed in all Broker/Assessor-facing video content:

1. **Never claim the AI replaces professional judgement.** It drafts; humans decide.
2. **Never claim 100% compliance.** The platform enforces formatting and documentation standards; operational compliance remains the contractor's responsibility.
3. **Never disparage contractors.** The positioning is that better tooling protects all parties — assessor, contractor, and policyholder.
4. **Always reference the current IICRC S500 edition** and note that the platform updates when the standard is revised.
5. **Use Australian English throughout:** categorise, authorised, programme (where referring to structured processes), defence.
6. **No urgency language:** No "limited time," "act now," or "exclusive offer." Assessors are professionals making measured decisions.
7. **Phill McGurk appears only in content that warrants CEO authority** — compliance showcase or strategic positioning. He does not appear in feature explainers.

---

*Document prepared for RestoreAssist internal use. All claims positions are conservative and subject to review against current IICRC standards and Australian regulatory requirements.*
