# RestoreAssist — Manual Onboarding Playbook

**Issue:** RA-613
**Owner:** Phill McGurk (concierge v0.1 — expand with field notes from each pilot)
**Purpose:** Step-by-step guide for onboarding the first 20 pilot companies. This document becomes the spec for H2 provisioning automation.
**Target:** 1 new pilot onboarded per concierge session (~3 hours: 1h pre-demo, 1h setup, 1h walkthrough)

---

## Pre-Flight Checklist (before every pilot)

Run this before each new company's onboarding session:

- [ ] Company ABN validated (11 digits, active on ABR) — check at abr.business.gov.au
- [ ] Contact person confirmed (name, role, mobile)
- [ ] Demo account credentials ready (admin login on restoreassist.app)
- [ ] Seed inspection loaded in demo environment (Category 2, Class 3, 3-room residential)
- [ ] Browser incognito window ready for insurer portal demo
- [ ] Screen share software tested (Zoom or Teams — 1080p, no notifications)
- [ ] Stripe test mode off — pilot account will be created in production
- [ ] Your calendar blocked for 90 min (60 min onboarding + 30 min buffer for questions)

---

## Phase 1 — Pre-Demo Prep

**Timeline: 30 minutes, 24–48 hours before the call**

### 1.1 Research the Company

Look up the company before the call. Know:

- How many technicians they have (field team size)
- Whether they are IICRC certified and which certifications (WRT, ASD, AMRT, CDS)
- What states they operate in (relevant for jurisdiction-specific reporting requirements)
- Who their primary insurers are, if visible on their website
- Any visible awards, industry association memberships

Use this to personalise the demo flow. A company with 2 techs needs simplicity. A company with 10+ needs team coordination features.

### 1.2 Confirm Data Sovereignty Region

RestoreAssist stores all data in Australian data centres (Supabase Sydney region). Confirm this with the pilot before account creation — some insurers require written confirmation of AU data residency for claim file data.

**Script:** "Before we create your account — RestoreAssist stores all inspection data in Australian data centres. Your clients' site data never leaves Australia. Is that consistent with your current requirements?"

If they need a written statement, send the one-liner: "RestoreAssist by Unite-Group Nexus Pty Ltd (ABN 95 691 477 844) stores all customer data exclusively in Australian AWS data centres (ap-southeast-2, Sydney)."

### 1.3 Prepare the Pilot Account Parameters

Gather these before the call:

| Field                  | Value                              |
| ---------------------- | ---------------------------------- |
| Company legal name     | As on their ABN registration       |
| ABN                    | 11-digit, verified on ABR          |
| Primary contact name   | Person on the call                 |
| Primary contact email  | Work email (becomes admin account) |
| Primary contact mobile | For 2FA setup                      |
| State / jurisdiction   | For building code defaults         |
| Number of technicians  | For seat count estimate            |
| Primary insurer(s)     | For sharing portal demo            |

---

## Phase 2 — Demo-to-Signup Conversion

**Timeline: 60 minutes on the call**

### 2.1 Opening (5 min)

Start by anchoring on their pain, not the product:

"Thanks for making the time. Before I show you anything — I want to understand your current reporting workflow. Walk me through what happens from the moment you arrive on-site to the moment the insurer has everything they need."

Listen for: time spent on paperwork, rework from insurer queries, lag between job completion and report delivery, compliance anxiety around S500 references.

**Note their answers** — use them verbatim in the demo to say "you mentioned X — here's how that works in RestoreAssist."

### 2.2 Demo Flow (35 min)

Follow the demo script from `PILOT-OUTREACH-KIT.md`. Key milestones:

1. **Inspection creation** — show the step-by-step form from field data capture to report
2. **S500:2025 citation auto-population** — show a water classification section with §7.1/7.2 references auto-filled
3. **Moisture readings table** — enter 3 readings live to show real-time workflow
4. **Equipment log** — show S500:2025 §14 auto-reference
5. **Insurer share portal** — open in incognito, highlight no-login access, 30-day validity
6. **PDF export** — download and open, show 10-section structure with edition reference

### 2.3 Objection Handling

| Objection                                  | Response                                                                                                                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "We already use Xactimate"                 | "Xactimate handles the scope and costing side — RestoreAssist handles the compliance documentation that goes alongside it: S500-compliant inspection reports, moisture logs, drying records. They're complementary, not competing." |
| "Our insurer has their own portal"         | "Most of our pilots' insurers use their portals for settlement, not for the technical documentation during the claim. The insurer share link covers the S500 compliance file — the bit that prevents disputes."                     |
| "We don't have time to learn new software" | "First report takes about 20 minutes. Second takes 8. We'll do your first one together on the onboarding call — you'll have a completed S500 report before we hang up."                                                             |
| "Is our data safe?"                        | Point to 1.2 above. Australian data centres, no offshore storage.                                                                                                                                                                   |
| "What's the cost after the pilot?"         | "During the pilot — no charge. We'll have a conversation about pricing before the pilot ends. Expect it to be in the same range as your current report software, but with full IICRC compliance built in."                          |

### 2.4 Consent and Signup (10 min)

If they want to proceed:

1. **Confirm consent verbally:** "Just to confirm — you're happy for me to create a RestoreAssist account for [Company Name] with your details. You'll receive a welcome email with your login. The pilot is at no charge."
2. **Capture BYOK preference:** Ask if they want to connect their own cloud storage (Supabase Storage/S3) for photo and document backup. For the first 20 pilots, hosted storage is provided — note their preference for H2 self-serve setup.
3. **Discuss subscription tier:** All pilots start on TRIAL status, which has full feature access. Explain: "You have full access to every feature during the pilot. At the end we'll talk about what continues to make sense for your volume."

---

## Phase 3 — Tenant Provisioning

**Timeline: 30–60 minutes, same day as the demo call**

Do this while they're still engaged, ideally during the call or within an hour of it.

### 3.1 Create the Company Record

In the admin dashboard (`/dashboard/admin` — requires admin role):

1. Navigate to **Companies** → **New Company**
2. Fill in:
   - Company name (exactly as on ABN registration)
   - ABN (11 digits — system will validate format)
   - State (sets default jurisdiction for building codes)
   - Contact email (primary admin)
   - Subscription status: set to **TRIAL**
3. Save. Note the company ID (UUID) for your records.

### 3.2 Create the Admin User Account

1. Navigate to **Users** → **New User**
2. Fill in:
   - Email: primary contact's work email
   - Name: full name
   - Role: **admin** (they can add techs themselves)
   - Company: select from step 3.1
3. Trigger the welcome email (system sends password reset / onboarding email)
4. Confirm with the pilot that they received it. Walk them through the first login if needed.

### 3.3 Set Default IICRC Vocabulary

RestoreAssist ships with IICRC S500:2025 terminology pre-loaded. Confirm with the pilot that they're using the 2025 edition (not 2021 or earlier). If they have a specific state jurisdiction requirement:

- QLD: default (standard S500:2025)
- NSW: confirm building code reference (BCA Volume 2 for residential)
- VIC: confirm building code reference
- WA/SA/NT: confirm variations with `lib/nir-jurisdictional-matrix.ts` reference

For first 20 pilots: note any jurisdiction-specific variations in your field notes. These will inform the H2 jurisdiction configuration feature.

### 3.4 Load a Sample Inspection Seed

Create one seed inspection so the pilot has a reference point:

1. Navigate to **Inspections** → **New Inspection**
2. Use these values:
   - Property: "123 Demo Street, [City] [State] [Postcode]"
   - Loss event: Water damage (Category 2, Class 3)
   - Insurer: leave blank for now
   - Technician: assign to the admin user
3. Add 3 moisture readings with clearly different values (e.g., 18%, 22%, 31%) across 2 rooms
4. Add 1 piece of equipment (dehumidifier) with S500 §14 reference
5. Generate the report — confirm it renders correctly with S500:2025 citations
6. Share the report URL with the pilot as their reference example

---

## Phase 4 — First-Inspection Walkthrough

**Timeline: 30 minutes, within 7 days of account creation**

Schedule a separate 30-minute call for this. Don't assume they'll figure it out alone.

### 4.1 Moisture Meter Calibration Check

Before the first real inspection, confirm:

- Their moisture meter make and model (on file in their company profile)
- That calibration records are current (RestoreAssist doesn't enforce this but the S500 requires it)
- Walk them through the moisture reading entry form — show how material type affects the reading interpretation

**Field note for H2:** Add a calibration reminder feature — prompt techs to confirm calibration date when adding a new meter to their profile.

### 4.2 First Photo Label Capture

Walk them through adding a photo to an inspection:

1. In the inspection form → **Evidence** tab
2. Upload a photo (show from desktop if they're not on mobile yet)
3. Add a label: location, date, context note
4. Show how the photo appears in the generated PDF report

If they're using mobile:

1. Open restoreassist.app in mobile browser (or the Capacitor app if installed)
2. Walk through the same steps
3. Confirm photos upload correctly on their mobile connection

**Common issue:** Photos failing to upload on slow site connections. Workaround: use Wi-Fi at office to upload batched photos from field.

### 4.3 Complete a Real Inspection (Live Walkthrough)

Walk them through their first real job in RestoreAssist:

1. Create the inspection (client name, address, loss type)
2. Enter water classification (Category + Class)
3. Add moisture readings from their actual field data
4. Add equipment placed
5. Write the narrative (show the AI-assist feature)
6. Generate the report
7. Review for S500:2025 compliance — check that all section references appear
8. Share with insurer via the portal link

**Time target:** First real report in under 25 minutes on the phone together.

---

## Phase 5 — First Report QA

**Timeline: Review within 24 hours of first generated report**

Before the pilot shares their first report with a real insurer, review it:

### 5.1 S500:2025 Compliance Check

Open the generated report and verify:

- [ ] Water classification section includes Category (1/2/3) and Class (1/2/3/4) with §7.1/7.2 citation
- [ ] Moisture readings table present with material type and acceptable range reference
- [ ] Equipment log present with S500:2025 §14 citation
- [ ] Psychrometric data included if drying monitoring was entered
- [ ] Technician credentials listed (IICRC cert number if applicable)
- [ ] Company ABN present on the report
- [ ] Report date matches inspection date

### 5.2 Content QA

- [ ] No placeholder text left (e.g., "[client name]", "[address]")
- [ ] Property address is complete (street, suburb, state, postcode)
- [ ] Loss narrative is coherent and professional (at least 3 sentences)
- [ ] All photos have descriptive labels
- [ ] PDF renders cleanly (no cut-off text, all sections visible)

### 5.3 Feedback to Pilot

After review, send a brief email:

> "Reviewed your first report — looks clean. [Note 1 specific compliment]. One thing to add for next time: [1 specific improvement]. Ready to share with the insurer — use the portal link rather than the PDF for the initial share if possible. Saves a back-and-forth."

If you spot a compliance gap: fix it together on a 10-minute call before they share it. Never let a non-compliant first report leave the system.

---

## Phase 6 — 14-Day Check-In

**Timeline: Day 14 after account creation**

Book a 20-minute call. Use this script:

### 6.1 Questions to Ask

1. "How many inspections have you entered so far?"
   - If 0: "What got in the way? Let's unblock it now."
   - If 1–3: "What was the hardest part? What took the longest?"
   - If 4+: "You're tracking well. What would make it faster?"

2. "Have you shared a report with an insurer yet?"
   - If yes: "Did they respond? Any questions from their end?"
   - If no: "Is there a job in flight we can use? I'd like to see a report go out during the pilot."

3. "Is there a feature you expected to find that wasn't there?"
   - Note everything. No promises, but every gap becomes a Linear issue.

4. "How are your technicians finding the mobile experience?"
   - If they haven't used mobile: walk through it on the call.
   - If friction: troubleshoot live.

### 6.2 What to Fix Before Day 30

Based on their feedback, prioritise:

| Priority | Issue type                            | Action                                             |
| -------- | ------------------------------------- | -------------------------------------------------- |
| P1       | Can't generate a compliant report     | Fix immediately — this is the core value prop      |
| P1       | Data loss (inspection not saving)     | Escalate to engineering immediately                |
| P2       | Mobile upload failing                 | Troubleshoot, document workaround                  |
| P2       | Missing jurisdiction-specific content | Note for H2 jurisdiction config feature            |
| P3       | UI confusion                          | Note in field notes, no action needed during pilot |
| P3       | Feature request (nice to have)        | Log in Linear as Backlog                           |

---

## Phase 7 — 30-Day Retention Check

**Timeline: Day 30 after account creation**

This is the pilot close-out and conversion conversation.

### 7.1 Usage Metrics to Review (before the call)

Pull from the admin dashboard:

- Total inspections created
- Total reports generated
- Total reports shared via insurer portal
- Number of active users (have techs logged in, or just the admin?)
- Last login date

**Green signal:** 5+ inspections, 3+ reports shared with insurers, multiple users active.
**Yellow signal:** 2–4 inspections, reports generated but not shared, single user.
**Red signal:** 0–1 inspections, last login >10 days ago.

### 7.2 Retention Conversation Script

Open with the data:

"You've created [X] inspections over the past 30 days. [Personalise based on green/yellow/red signal.] I want to understand: is RestoreAssist replacing your current reporting workflow, or are you running it in parallel?"

**If green:** Move to pricing conversation. "You're clearly getting value. Let's talk about what continued access looks like."

**If yellow:** Identify the friction point. "What's the main reason you haven't used it more? Is it a workflow fit issue, a time issue, or a features issue?" Fix what you can before proposing paid access.

**If red:** Be direct. "It looks like this hasn't clicked yet. Tell me what happened. If there's a specific reason RestoreAssist didn't fit, I'd rather know now and fix it than pretend the pilot went well."

### 7.3 Conversion to Paid

If they're converting:

1. Upgrade their account status from TRIAL to ACTIVE in the admin panel
2. Create their Stripe subscription (or direct them to the billing page)
3. Confirm their plan: solo vs team (based on technician count)
4. Send a receipt and welcome email confirming their subscription

If they're not converting:

1. Capture the reason in detail (1–3 sentences minimum)
2. Note what would need to change for them to convert in 90 days
3. Set a reminder to follow up at Day 90 with "we've shipped X — ready to try again?"
4. Keep their data active for 90 days (do not delete the account)

---

## Field Notes Template

Copy this for each pilot. Fill in after each phase:

```
## [Company Name] — Onboarding Notes

**ABN:**
**Contact:**
**State:**
**IICRC certs:**
**Technician count:**
**Primary insurer(s):**

### Phase 1 notes (pre-demo)
Data sovereignty confirmed: Y/N
BYOK preference noted: Y/N — details:

### Phase 2 notes (demo-to-signup)
Key pain point they mentioned:
Objection raised:
Consent given: Y/N — date:

### Phase 3 notes (provisioning)
Company record created: Y/N — date:
Admin user created: Y/N — email:
Seed inspection created: Y/N
Jurisdiction variations noted:

### Phase 4 notes (first walkthrough)
Moisture meter: make/model:
First photo label captured: Y/N
First real report completed: Y/N — date:

### Phase 5 notes (report QA)
QA passed: Y/N
S500 compliance issues found:
Content issues found:
Feedback sent: Y/N

### Phase 6 notes (14-day check-in)
Inspections created:
Reports shared with insurer: Y/N
Top friction point:
Fixes applied:

### Phase 7 notes (30-day retention)
Inspections created (total):
Reports shared (total):
Active users:
Usage signal: Green / Yellow / Red
Conversion outcome: Active / Extended pilot / Not converting
Reason (if not converting):
```

---

## Pilot Roster

| #   | Company | Contact | State | ABN | Status | Account created | 14-day check-in | 30-day outcome |
| --- | ------- | ------- | ----- | --- | ------ | --------------- | --------------- | -------------- |
| 1   |         |         |       |     |        |                 |                 |                |
| 2   |         |         |       |     |        |                 |                 |                |
| 3   |         |         |       |     |        |                 |                 |                |
| 4   |         |         |       |     |        |                 |                 |                |
| 5   |         |         |       |     |        |                 |                 |                |
| 6   |         |         |       |     |        |                 |                 |                |
| 7   |         |         |       |     |        |                 |                 |                |
| 8   |         |         |       |     |        |                 |                 |                |
| 9   |         |         |       |     |        |                 |                 |                |
| 10  |         |         |       |     |        |                 |                 |                |
| 11  |         |         |       |     |        |                 |                 |                |
| 12  |         |         |       |     |        |                 |                 |                |
| 13  |         |         |       |     |        |                 |                 |                |
| 14  |         |         |       |     |        |                 |                 |                |
| 15  |         |         |       |     |        |                 |                 |                |
| 16  |         |         |       |     |        |                 |                 |                |
| 17  |         |         |       |     |        |                 |                 |                |
| 18  |         |         |       |     |        |                 |                 |                |
| 19  |         |         |       |     |        |                 |                 |                |
| 20  |         |         |       |     |        |                 |                 |                |

---

## H2 Automation Spec Gaps (add to this as you learn)

This section captures everything you do manually that should eventually be automated. Each item becomes a Linear ticket for H2 provisioning.

| #   | Manual step                              | H2 automation target                                  | Notes |
| --- | ---------------------------------------- | ----------------------------------------------------- | ----- |
| 1   | Create company record in admin panel     | API-driven company creation from signup form          |       |
| 2   | Create admin user, trigger welcome email | Automated from billing checkout                       |       |
| 3   | Set jurisdiction defaults                | Auto-detect from ABN state registration               |       |
| 4   | Load seed inspection                     | Optional seed toggle in company settings              |       |
| 5   | First report QA review                   | AI pre-flight S500 check before share link is enabled |       |
| 6   | 14-day and 30-day check-in scheduling    | CRM-integrated reminder workflow                      |       |
| 7   | BYOK storage configuration               | Self-serve provider connection in workspace settings  |       |

---

_This document is version 0.1 — agent-drafted from the RA-613 spec. Phill: add field notes after your first pilot onboarding. Everything in this doc that turns out to be wrong or missing becomes a revision._
