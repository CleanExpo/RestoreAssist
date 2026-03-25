/**
 * CET Video Script Templates
 *
 * Ten base scripts, one per VideoCategory.
 * Each script:
 *   - Opens with the mandatory disclaimer (2 sentences — legal requirement)
 *   - Cites Australian law verbatim where relevant (ICA 1984, AFCA, SafeWork AU, IICRC)
 *   - Uses {{companyName}} and {{technicianName}} variable slots
 *
 * PREFERRED_SUPPLIER_RIGHTS ships first and is the most important — it cites
 * Insurance Contracts Act 1984 s.54 and AFCA Complaint Resolution Standard 7.2.
 *
 * Sources are logged in the Video.contentSources field for audit trail.
 */

// ── Mandatory disclaimer ───────────────────────────────────────────────────────

export const DISCLAIMER =
  'This information is provided for educational purposes only. ' +
  'Please consult your insurance policy documents for your specific coverage details.'

// ── Template interface ─────────────────────────────────────────────────────────

export interface ScriptTemplate {
  category: string
  title: string
  /** Approximate duration at 130wpm */
  durationEstimateSecs: number
  /**
   * Script text with variable slots: {{companyName}}, {{technicianName}}.
   * First two sentences are always DISCLAIMER.
   */
  script: string
  /** Australian law / government URLs cited verbatim in this script */
  sources: string[]
}

// ── Templates ──────────────────────────────────────────────────────────────────

export const SCRIPT_TEMPLATES: Record<string, ScriptTemplate> = {
  // ── 1. PREFERRED_SUPPLIER_RIGHTS (ships first — QR shareable) ─────────────

  PREFERRED_SUPPLIER_RIGHTS: {
    category: 'PREFERRED_SUPPLIER_RIGHTS',
    title: 'Your Right to Choose Your Own Repairer',
    durationEstimateSecs: 90,
    script: `${DISCLAIMER}

Hello, and welcome. My name is {{technicianName}} from {{companyName}}. Before we begin today's inspection, I want to take a moment to make sure you understand your rights as a policyholder — because they matter, and we believe you deserve to know them.

Under the Insurance Contracts Act 1984, Section 54, your insurer cannot unreasonably refuse to pay a claim. The Australian Financial Complaints Authority — AFCA — Complaint Resolution Standard, Guideline 7.2, requires your insurer to act fairly when directing repairs.

In plain terms: you have the right to choose your own repairer. You are not required to use an insurer's "preferred supplier." If your insurer suggests — or pressures — you to use their panel repairer instead of your chosen contractor, you may request a written explanation under AFCA guidelines. If you remain unsatisfied, you can lodge a complaint with AFCA — the Australian Financial Complaints Authority — at afca.org.au, at no cost to you.

{{companyName}} is here because you, the policyholder, have chosen us. We work for you — not for the insurance company. If anyone contacts you suggesting otherwise, please do not hesitate to let me know immediately.

Thank you for trusting {{companyName}}. We are committed to restoring your property to its pre-loss condition, keeping you informed every step of the way.`,
    sources: [
      'https://www.legislation.gov.au/Details/C2023C00012',
      'https://www.afca.org.au/make-a-complaint/complaint-resolution-standards',
    ],
  },

  // ── 2. COMPANY_INTRO ──────────────────────────────────────────────────────

  COMPANY_INTRO: {
    category: 'COMPANY_INTRO',
    title: 'Welcome to {{companyName}}',
    durationEstimateSecs: 60,
    script: `${DISCLAIMER}

Welcome, and thank you for choosing {{companyName}}. My name is {{technicianName}}, and I will be your technician today.

{{companyName}} specialises in water, fire, and storm damage restoration. Our team is trained to IICRC standards — the Institute of Inspection, Cleaning and Restoration Certification — which is the international benchmark for restoration work in Australia.

Everything we do today will be documented in a detailed inspection report using the National Inspection Report format. This report will be submitted directly to your insurance company, and you will receive a copy as well.

We are here to make this process as straightforward as possible for you. If you have any questions at any point during today's inspection — about what we are doing, why we are doing it, or what happens next — please ask. There are no silly questions.

Let us get started.`,
    sources: ['https://iicrc.org/pages/iicrc-standards'],
  },

  // ── 3. CLAIM_PROCESS ──────────────────────────────────────────────────────

  CLAIM_PROCESS: {
    category: 'CLAIM_PROCESS',
    title: 'How the Claims Process Works',
    durationEstimateSecs: 90,
    script: `${DISCLAIMER}

Understanding how the claims process works can make a stressful situation much easier to manage. Here is what typically happens from the moment you make a claim to when your property is fully restored.

Step one is the initial assessment — what we are doing right now. We inspect the damage, take moisture measurements and temperature readings, photograph all affected areas, and prepare a detailed inspection report.

Step two: the report is submitted to your insurance company or their loss adjuster. The adjuster reviews our findings against your policy and approves the scope of work.

Step three: restoration begins. Depending on the type and extent of damage, this may include drying equipment, structural drying, or specialist repairs.

Step four: completion and sign-off. Once the work meets IICRC standards and all moisture readings are within acceptable limits, the property is signed off and our report is finalised.

At every step, {{companyName}} will communicate with you. You are not alone in this process. If you have questions about the timeline, costs, or progress at any stage, please contact us directly — our details are on the inspection report.`,
    sources: [
      'https://iicrc.org/pages/iicrc-standards',
      'https://www.afca.org.au/make-a-complaint/complaint-resolution-standards',
    ],
  },

  // ── 4. POLICY_UNDERSTANDING ───────────────────────────────────────────────

  POLICY_UNDERSTANDING: {
    category: 'POLICY_UNDERSTANDING',
    title: 'Understanding Your Insurance Policy',
    durationEstimateSecs: 75,
    script: `${DISCLAIMER}

Insurance policies can be complex documents. Understanding a few key concepts will help you know what to expect from your claim.

Your policy has a sum insured — the maximum amount your insurer will pay for a claim. It also has an excess — the amount you contribute to the cost before insurance covers the rest. Excesses vary by policy. Check your policy schedule to confirm your excess amount.

Some policies cover "sudden and accidental" damage only — meaning gradual deterioration, maintenance issues, or pre-existing damage may not be covered. Our inspection report will document the cause and nature of the damage to help support your claim classification.

Under the Insurance Contracts Act 1984, your insurer has a duty of utmost good faith — they must handle your claim honestly and promptly. If you believe your claim is being handled unfairly or is taking unreasonably long, you have the right to complain to the Australian Financial Complaints Authority at afca.org.au, free of charge.

{{companyName}} documents everything thoroughly so your claim has the strongest possible support from day one.`,
    sources: [
      'https://www.legislation.gov.au/Details/C2023C00012',
      'https://www.afca.org.au/',
    ],
  },

  // ── 5. EQUIPMENT_EXPLAINER ────────────────────────────────────────────────

  EQUIPMENT_EXPLAINER: {
    category: 'EQUIPMENT_EXPLAINER',
    title: 'Understanding Our Equipment',
    durationEstimateSecs: 75,
    script: `${DISCLAIMER}

You may notice our technicians using specialised equipment during the inspection. Let me explain what each piece of equipment does, and why it is important for your claim and your property's recovery.

Moisture meters measure the water content within walls, floors, and ceilings — even when surfaces appear completely dry. Hidden moisture is the leading cause of mould growth and structural damage following a water event. By mapping moisture levels room by room, we can identify all affected areas and confirm when drying is complete.

Thermo-hygrometers measure temperature and relative humidity in each room. These readings are essential for setting up drying equipment correctly and for classifying the drying standard required under IICRC S500 — the water damage restoration standard.

Laser distance measures allow us to accurately record room dimensions and affected areas so that scope-of-work quantities are precise and verifiable.

All readings are captured in real time and logged directly into your inspection report. This creates a transparent, auditable record that your insurance company, loss adjuster, and any reviewer can verify.`,
    sources: ['https://iicrc.org/pages/iicrc-standards'],
  },

  // ── 6. SAFETY_BRIEF ───────────────────────────────────────────────────────

  SAFETY_BRIEF: {
    category: 'SAFETY_BRIEF',
    title: 'Safety During the Restoration Process',
    durationEstimateSecs: 60,
    script: `${DISCLAIMER}

During the restoration process, your safety and the safety of your family are our highest priority. Please take note of the following.

Drying equipment — dehumidifiers, air movers, and desiccant dryers — will be operating in your property throughout the drying phase. These are safe devices, but they must remain running continuously for the drying process to be effective. Please do not switch them off or move them without first contacting {{companyName}}.

If we have cordoned off any areas due to structural concerns or elevated mould risk, please keep those areas clear — including children and pets.

Water-damaged properties can present hazards including weakened flooring, hidden electrical risks, and contaminated water. Our technicians are trained under SafeWork Australia guidelines to identify and manage these hazards. If you notice anything that concerns you during the restoration — unusual smells, visible mould growth, or structural movement — please contact us immediately.

Your safety matters. Do not hesitate to raise any concern with your {{companyName}} technician.`,
    sources: ['https://www.safeworkaustralia.gov.au/'],
  },

  // ── 7. TIMELINE_EXPECTATIONS ──────────────────────────────────────────────

  TIMELINE_EXPECTATIONS: {
    category: 'TIMELINE_EXPECTATIONS',
    title: 'What to Expect — Your Restoration Timeline',
    durationEstimateSecs: 75,
    script: `${DISCLAIMER}

One of the most common questions we receive is: how long will this take? Every property and damage event is different, but here are realistic timeframes to help you plan.

For water damage, the drying phase typically takes three to five days with our equipment running continuously. At the end of the drying phase, we conduct a final moisture verification inspection to confirm all readings are within acceptable limits under IICRC S500.

Once our report is submitted, insurance approval typically takes one to five business days — this varies by insurer and the complexity of your claim.

Physical repair and restoration work, once approved, can range from a few days for minor damage to several weeks for more extensive structural repairs.

{{companyName}} will keep you updated throughout. You will always know where things stand. If you have not heard from us within a timeframe we have agreed on, please do not hesitate to call us — we want this resolved for you as quickly as your insurer allows.`,
    sources: ['https://iicrc.org/pages/iicrc-standards'],
  },

  // ── 8. COMMON_QUESTIONS ───────────────────────────────────────────────────

  COMMON_QUESTIONS: {
    category: 'COMMON_QUESTIONS',
    title: 'Common Questions — Answered',
    durationEstimateSecs: 90,
    script: `${DISCLAIMER}

Here are the questions we hear most often from homeowners during a restoration claim.

Can I stay in my home during the drying process? In most cases, yes — for water damage, staying in the property is safe and does not affect the drying. However, if there is a safety risk such as structural damage, sewage contamination, or significant mould, temporary relocation may be recommended. Your policy may cover alternative accommodation costs — check your policy schedule.

Do I need to be home when the technicians visit? No. With your permission, our team can access the property to check equipment and take moisture readings. We will always notify you before attending.

What if my insurer disputes the scope of work? {{companyName}} provides a fully documented, standards-based report. If a dispute arises, we can provide supporting evidence. You may also engage an independent loss assessor, or lodge a complaint with AFCA if you believe your claim is being handled unfairly.

Who pays the excess? The excess is typically paid to {{companyName}} at completion of works, or directly to your insurer — your policy schedule will confirm the applicable method.

Do I need to do anything before you start? Not usually. Please ensure reasonable access to the property and, if possible, locate your policy schedule so you have your excess amount handy.`,
    sources: [
      'https://www.afca.org.au/',
      'https://www.legislation.gov.au/Details/C2023C00012',
    ],
  },

  // ── 9. INSURER_INTERACTION_TIPS ───────────────────────────────────────────

  INSURER_INTERACTION_TIPS: {
    category: 'INSURER_INTERACTION_TIPS',
    title: 'How to Communicate Effectively with Your Insurer',
    durationEstimateSecs: 75,
    script: `${DISCLAIMER}

Knowing how to communicate effectively with your insurer can make a real difference to your claim outcome. Here are practical tips based on experience.

Always keep a record. Write down the name, employee number, date, and time of every call you make to your insurer. If they make a decision about your claim, request it in writing.

Do not accept a settlement offer under pressure. You have the right to take time to review any offer. If you are unsure, seek independent advice before accepting.

Under AFCA guidelines, insurers must communicate clearly and respond within reasonable timeframes. If your claim has been delayed beyond thirty days without a clear explanation, that may constitute unreasonable delay — and you can raise a formal complaint with AFCA.

If your insurer tells you that you must use their preferred repairer, remember your rights under the Insurance Contracts Act 1984. You may choose your own repairer. If you encounter pressure on this point, document it and contact {{companyName}} — we can assist.

AFCA — the Australian Financial Complaints Authority — at afca.org.au is free, independent, and exists specifically to support policyholders like you.`,
    sources: [
      'https://www.afca.org.au/make-a-complaint/complaint-resolution-standards',
      'https://www.legislation.gov.au/Details/C2023C00012',
    ],
  },

  // ── 10. SCOPE_OF_WORKS_EXPLAINED ─────────────────────────────────────────

  SCOPE_OF_WORKS_EXPLAINED: {
    category: 'SCOPE_OF_WORKS_EXPLAINED',
    title: 'Understanding Your Scope of Works',
    durationEstimateSecs: 60,
    script: `${DISCLAIMER}

The scope of works is the detailed list of everything that needs to be done to restore your property to its pre-loss condition. It is one of the most important documents in your claim.

The scope is prepared by {{companyName}} based on the inspection findings, IICRC standards, and your state's building code requirements. Every line item includes a description of the work required, the area or quantity affected, and the estimated cost.

You have the right to review the scope of works before it is submitted to your insurer, and you can ask us to explain any item you do not understand.

Once the insurer approves the scope, it forms the agreed basis for all restoration and repair work. If additional damage is discovered during works — which sometimes happens as walls are opened or floors are lifted — any variation will be documented and submitted for approval before we proceed.

Transparency is central to everything we do at {{companyName}}. Your scope of works is not a surprise — it is a documented, evidence-based record of exactly what your property needs.`,
    sources: ['https://iicrc.org/pages/iicrc-standards'],
  },
}
