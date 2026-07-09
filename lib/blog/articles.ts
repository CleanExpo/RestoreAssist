/**
 * Blog article content + registry.
 *
 * SUBSTANTIATION NOTE (nexus-copywriter cite-or-cut discipline):
 * Every checkable factual claim in this file is sourced from the repository,
 * not invented. IICRC clause references are copied from lib/nir-standards-mapping.ts
 * (derived from the owner's licensed ANSI/IICRC source documents) and use the
 * edition+section form required by CLAUDE.md rule #12/#14 — e.g. "S500:2021 §10.4.1".
 * The only quantitative industry figure used (~250,000 annual AU restoration
 * claims) is the single SOURCED claim in lib/nir-evidence-architecture.ts
 * (CLAIM-001, Insurance Council of Australia). HYPOTHESIS/DERIVED figures in
 * that register (cost-per-claim, re-inspection rates, cycle-time reductions)
 * are deliberately NOT used. Product pricing figures come from lib/pricing.ts.
 *
 * This module is pure data (no server-only imports) so the client listing
 * page, the server article route, and the route-integrity test can all import
 * it.
 */

export interface ArticleSection {
  /** Optional H2 heading for the section. */
  heading?: string;
  paragraphs: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
}

export interface ArticleReference {
  /** Short citation label, e.g. "IICRC S500:2021 §10.4.1". */
  label: string;
  /** What the reference substantiates. */
  detail: string;
}

export interface Article {
  slug: string;
  title: string;
  /** Card excerpt on the listing page. */
  excerpt: string;
  category: string;
  /** Human-readable publication date, e.g. "9 July 2026". */
  date: string;
  /** ISO date for <time> and OpenGraph metadata. */
  isoDate: string;
  readTime: string;
  author: string;
  authorCredential: string;
  /** SEO meta description. */
  description: string;
  keywords: string[];
  /** Lead paragraphs rendered before the first section. */
  intro: string[];
  sections: ArticleSection[];
  keyTakeaways?: string[];
  references?: ArticleReference[];
  /** Only published articles get a route + a listing link. */
  published: boolean;
}

const AUTHOR = "RestoreAssist Editorial Team";
const AUTHOR_CREDENTIAL =
  "Reviewed against ANSI/IICRC S500-2021 and the RestoreAssist standards registry. Restore Assist by Unite-Group Nexus Pty Ltd.";
const PUBLISH_DATE = "9 July 2026";
const PUBLISH_ISO = "2026-07-09";

export const ARTICLES: Article[] = [
  {
    slug: "understanding-iicrc-s500-compliance",
    title: "Understanding IICRC S500 Compliance",
    excerpt:
      "A plain-English guide to the water categories, drying classes, moisture thresholds and documentation duties that ANSI/IICRC S500-2021 puts on every restoration job.",
    category: "Compliance",
    date: PUBLISH_DATE,
    isoDate: PUBLISH_ISO,
    readTime: "8 min read",
    author: AUTHOR,
    authorCredential: AUTHOR_CREDENTIAL,
    description:
      "A practical guide to ANSI/IICRC S500-2021 for Australian water damage restorers: water categories, drying classes, moisture and humidity targets, and the documentation the standard requires.",
    keywords: [
      "IICRC S500 compliance",
      "ANSI/IICRC S500-2021",
      "water damage categories",
      "water damage classes",
      "restoration standards Australia",
    ],
    intro: [
      "IICRC S500 is the Standard and Reference Guide for Professional Water Damage Restoration. It is the document adjusters, builders and courts reach for when they need to know whether a water damage job was scoped and executed the way the industry expects. RestoreAssist cites the fifth edition, published in 2021 (ANSI/IICRC S500-2021), and a further revision is expected around 2026.",
      "For a technician on site, S500 is not abstract. It defines how you classify the water, how you size the drying, and what you have to record. This guide walks through the parts of the standard that shape almost every water damage report, in the order you meet them on a job.",
    ],
    sections: [
      {
        heading: "Category: how dirty is the water?",
        paragraphs: [
          "S500 sorts water into three categories by contamination, defined in S500:2021 §10.4.1. Category 1 is clean water from a potable source, such as a broken supply pipe or rainwater on first contact. Category 2 is grey water carrying some contamination, from sources like a washing-machine or dishwasher overflow. Category 3 is black water that is grossly contaminated, including sewage and flooding from external water bodies.",
          "Category is not fixed for the life of a job. The standard notes that Category 1 water degrades to Category 2 once it has been standing for around 48 hours, because time and temperature let micro-organisms multiply. That single detail changes the scope: a clean-water loss left over a long weekend is not a clean-water loss any more, and the decontamination steps that follow are justified by the standard rather than by the estimator.",
        ],
      },
      {
        heading: "Class: how much has to dry?",
        paragraphs: [
          "Where category describes contamination, class describes the evaporation load — how much water the structure holds and how hard it will be to dry. S500:2021 §10.4.3 sets four classes. Class 1 is the least water and slowest evaporation, affecting less than about 10 per cent of the floor area with low-porosity materials. Class 2 is a fast-evaporation loss affecting roughly 10 to 40 per cent of a room, typically carpet and cushion. Class 3 is the fastest evaporation, with more than 40 per cent affected and moisture reaching walls, ceilings and insulation. Class 4 covers specialty drying situations — deeply held moisture in materials such as concrete, hardwood, plaster and brick.",
          "Class matters because it drives the drying plan. The class tells you the scale of the evaporation problem, which in turn shapes how much equipment the job needs and for how long.",
          "Class 4 is worth calling out on its own. It is not simply more water — it is moisture held deep inside low-permeance materials like concrete, hardwood, plaster and brick, which release it slowly and often need specialty drying methods and a longer timeframe than a standard air-mover-and-dehumidifier setup. Recognising a Class 4 element early is what stops a job being declared dry on the surface while moisture is still trapped in the substrate.",
        ],
      },
      {
        heading: "Moisture and humidity: setting a target you can defend",
        paragraphs: [
          "Drying is only finished when readings say it is finished, not when the calendar says so. RestoreAssist maps moisture readings to S500:2021 §10 and flags each one as normal, elevated or critical against a threshold for that specific material — the number that is acceptable in timber is not the number that is acceptable in plasterboard.",
          "The drying target itself comes from S500:2021 §5, which frames the goal in terms of the ambient outdoor conditions for the region: you are aiming to return the structure to a moisture and humidity state at or below what is normal for its environment. Because the target is calculated from recorded conditions rather than estimated, it is defensible if a drying decision is ever questioned.",
        ],
      },
      {
        heading: "Equipment: sized to the standard, not to the van",
        paragraphs: [
          "S500:2021 §6 governs the selection and sizing of drying equipment. The practical test the standard invites is simple: is the equipment on site adequate for the affected area and the class of loss? A drying setup that is under-specified for a Class 3 loss will not hit the target, and the standard gives an adjuster a basis to ask why. Tying equipment quantities back to §6 turns 'we brought what we had' into 'we brought what the class required'.",
        ],
      },
      {
        heading: "Documentation: the part that gets claims paid",
        paragraphs: [
          "The best drying job is worth little to an insurer if it is not documented. S500:2021 §9.2.5 covers project documentation and risk management. In practice that means photographs that are timestamped, geotagged and numbered in sequence, with coverage that includes the overview, the affected areas, moisture-meter placement and equipment placement.",
          "This is where a purpose-built system earns its place. RestoreAssist captures each field against its governing clause and carries the citation through to the report, so the finished document shows not just what was measured but which part of the standard requires it. That is the difference between a report a technician wrote and a report the standard wrote.",
        ],
      },
    ],
    keyTakeaways: [
      "S500 is the professional water damage standard; RestoreAssist cites ANSI/IICRC S500-2021 (5th edition), with a revision expected in 2026.",
      "Category (S500:2021 §10.4.1) grades contamination — Cat 1 clean, Cat 2 grey, Cat 3 black — and Category 1 degrades to Category 2 after about 48 hours standing.",
      "Class (S500:2021 §10.4.3) grades the evaporation load across four classes and drives the drying plan.",
      "Moisture (§10), humidity targets (§5) and equipment (§6) turn drying decisions into defensible, standard-backed calls.",
      "Documentation (§9.2.5) — timestamped, geotagged, sequenced photos — is what makes the work auditable for insurers.",
    ],
    references: [
      {
        label: "ANSI/IICRC S500-2021",
        detail:
          "Standard and Reference Guide for Professional Water Damage Restoration, 5th edition (2021). Edition and section references verified against the RestoreAssist standards registry (lib/nir-standards-mapping.ts).",
      },
      {
        label: "IICRC S500:2021 §10.4.1",
        detail: "Category of water (Category 1/2/3) and time-based degradation.",
      },
      {
        label: "IICRC S500:2021 §10.4.3",
        detail: "Class of water intrusion (Class 1 through 4).",
      },
      {
        label: "IICRC S500:2021 §5, §6, §9.2.5, §10",
        detail:
          "Drying goal, equipment selection and sizing, project documentation, and moisture assessment.",
      },
    ],
    published: true,
  },

  {
    slug: "water-damage-assessment-best-practices",
    title: "Best Practices for Water Damage Assessment",
    excerpt:
      "A repeatable on-site sequence — categorise, classify, map moisture, set a drying target, size equipment, document — that keeps every water damage assessment defensible against the standard.",
    category: "Best Practices",
    date: PUBLISH_DATE,
    isoDate: PUBLISH_ISO,
    readTime: "7 min read",
    author: AUTHOR,
    authorCredential: AUTHOR_CREDENTIAL,
    description:
      "A step-by-step water damage assessment method for Australian restorers, built on ANSI/IICRC S500-2021: classify the loss, map moisture, set a defensible drying target and document to standard.",
    keywords: [
      "water damage assessment",
      "restoration inspection checklist",
      "IICRC S500 assessment",
      "moisture mapping",
      "drying target",
    ],
    intro: [
      "A water damage assessment done well is repeatable. The same sequence, run the same way on every job, is what stops details from slipping and keeps the resulting report consistent enough for an adjuster to trust. The sequence below follows the structure of ANSI/IICRC S500-2021 so that each step produces a finding tied to a clause, not to a technician's memory.",
    ],
    sections: [
      {
        heading: "1. Make the building safe first",
        paragraphs: [
          "Before any measurement, the assessment starts with hazards. Standing water near electrical services, unstable materials and contamination risk all come before instruments come out of the bag. If the loss involves anything beyond clean water, personal protective equipment and containment decisions belong at the top of the job, not as an afterthought once the scope is written.",
        ],
      },
      {
        heading: "2. Categorise the water",
        paragraphs: [
          "Establish the source and grade the contamination against S500:2021 §10.4.1: Category 1 clean, Category 2 grey, Category 3 black. Record the source, because the source is what justifies the category. Note the time the water has been present, too — the standard treats Category 1 water as degrading to Category 2 after roughly 48 hours standing, so a loss discovered days later is scoped differently from one caught within the hour.",
        ],
      },
      {
        heading: "3. Classify the drying load",
        paragraphs: [
          "Next, classify the loss against S500:2021 §10.4.3 by working out how much of the space is affected and which materials hold the moisture. Less than about 10 per cent of floor area is Class 1; 10 to 40 per cent is Class 2; more than 40 per cent, with moisture into walls, ceilings and insulation, is Class 3; and deeply held moisture in materials like concrete, hardwood, plaster or brick is Class 4 specialty drying. The class you land on is the honest basis for the size of the drying plan.",
        ],
      },
      {
        heading: "4. Map moisture against material thresholds",
        paragraphs: [
          "Take moisture readings across the affected materials and record them against the threshold for each material type, per S500:2021 §10. A reading is only meaningful next to what is normal for that substrate, which is why RestoreAssist flags each reading as normal, elevated or critical rather than leaving a bare number on the page. Consistent placement and sequencing of readings also gives you a baseline to measure drying progress against later. Photograph each meter in place as you take the reading, so the number on the report is tied to a visible location rather than a note.",
        ],
      },
      {
        heading: "5. Set a drying target you can justify",
        paragraphs: [
          "Set the drying goal from S500:2021 §5 — a moisture and humidity state at or below the ambient outdoor conditions for the region. Deriving the target from recorded conditions, rather than picking a round number, means the endpoint of the job is defensible. When readings meet the calculated target, drying is done; until they do, it is not.",
        ],
      },
      {
        heading: "6. Size the equipment to the class",
        paragraphs: [
          "Specify drying equipment against S500:2021 §6 for the affected area and class. The question to answer in the file is whether the equipment is adequate for the loss in front of you. Recording the reasoning links every dehumidifier and air mover back to the class of loss, which is exactly what an insurer needs to see to accept the drying scope.",
        ],
      },
      {
        heading: "7. Document as you go",
        paragraphs: [
          "Finally, document to S500:2021 §9.2.5: photographs that are timestamped, geotagged and numbered in sequence, covering the overview, the affected areas, moisture-meter placement and equipment placement. Documenting during the assessment rather than reconstructing it afterwards is one of the surest ways to reduce disputes, because the evidence is captured at the moment it is true.",
          "Run this seven-step sequence the same way every time and the assessment stops being a matter of individual judgement and becomes a process. RestoreAssist is built around exactly this order of operations, capturing each field against its governing clause so the report is standard-backed by the time you leave site.",
        ],
      },
      {
        heading: "Confirm drying against the goal, and capture what makes a report submittable",
        paragraphs: [
          "The first assessment is not the end of the measurement. Drying is confirmed by re-reading moisture against the target set from S500:2021 §5 — daily where the job warrants it — and the readings, not the calendar, decide when the structure is dry. Recording that progression against the same points mapped on day one is what lets a restorer show an insurer that the drying goal was met rather than assumed.",
          "It is also worth knowing the floor for a report that can stand on its own. RestoreAssist treats a small set of fields as non-negotiable before an inspection can be submitted — the property address, at least one affected area, the water source, and at least one photograph — on the principle that a single photo is the absolute minimum for a submittable report. Other fields, such as environmental readings and equipment details, are flagged when missing but never block the record, on the view that a safe partial record captured in an emergency beats no record at all.",
        ],
      },
    ],
    keyTakeaways: [
      "Work a fixed sequence every job: safety, category, class, moisture, target, equipment, documentation.",
      "Category (§10.4.1) and class (§10.4.3) are the two classifications that set the scope; record the source and the elapsed time.",
      "Set the drying target from ambient outdoor conditions (§5) so the endpoint is calculated, not guessed.",
      "Confirm drying by re-reading against the target, and know the submittable floor: address, one affected area, water source and at least one photo.",
      "Capture timestamped, geotagged, sequenced photos (§9.2.5) during the assessment, not after.",
    ],
    references: [
      {
        label: "ANSI/IICRC S500-2021",
        detail:
          "Standard and Reference Guide for Professional Water Damage Restoration, 5th edition. Clause references verified against lib/nir-standards-mapping.ts.",
      },
      {
        label: "IICRC S500:2021 §5, §6, §9.2.5, §10, §10.4.1, §10.4.3",
        detail:
          "Drying goal, equipment, documentation, moisture assessment, water category and water class.",
      },
    ],
    published: true,
  },

  {
    slug: "building-trust-transparent-reports",
    title: "Building Trust with Transparent Reports",
    excerpt:
      "Trust with insurers is built on evidence, not adjectives. How standard-cited findings, disciplined photo documentation and an honest evidence register make a restoration report defensible.",
    category: "Industry",
    date: PUBLISH_DATE,
    isoDate: PUBLISH_ISO,
    readTime: "7 min read",
    author: AUTHOR,
    authorCredential: AUTHOR_CREDENTIAL,
    description:
      "How transparent, evidence-based restoration reports build trust with insurers: standard-cited findings, timestamped photo documentation, NRPG-aware pricing and a claims-honest evidence register.",
    keywords: [
      "restoration report",
      "insurance claim documentation",
      "transparent reporting",
      "IICRC evidence",
      "restoration trust",
    ],
    intro: [
      "Australians lodge a large volume of restoration and remediation insurance claims each year — the Insurance Council of Australia's claims reporting puts the annual figure at roughly 250,000. Behind each of those claims is a report that either earns an adjuster's trust or invites their questions. The difference is rarely the quality of the drying. It is the quality of the evidence.",
      "A transparent report is one where every material claim can be checked. That is a higher bar than a tidy PDF, and it is the bar that gets a scope approved on its merits.",
    ],
    sections: [
      {
        heading: "Cite the standard, not the technician",
        paragraphs: [
          "A reliable way to build trust is to remove the technician's opinion from the load-bearing parts of the report. When a report says a loss is Category 3, the useful version does not stop there — it points to S500:2021 §10.4.1 and the observed source that puts it there. When it specifies drying equipment, it ties the specification to S500:2021 §6 and the class of loss.",
          "RestoreAssist is built so that each field captured on site maps to its governing clause, and that citation travels through to the finished report. An adjuster reading it sees a pass or fail against a published standard, not a judgement call they have to take on faith. Findings become checkable, and checkable findings are trusted findings.",
        ],
      },
      {
        heading: "Photograph to a standard",
        paragraphs: [
          "Photographs are the primary evidence in most restoration disputes, and undated, unlabelled photos carry little weight. S500:2021 §9.2.5 sets the documentation bar: images timestamped, geotagged and numbered in sequence, with coverage that spans the overview, the affected areas, moisture-meter placement and equipment placement.",
          "Capturing photos to that standard as the job runs — rather than assembling them afterwards — means the visual record is anchored to the moment it was true. Before-and-after pairs shot from the same angles give an adjuster one of the most useful tools they have for resolving a query without a re-inspection.",
          "There is a discipline in this that pays off beyond any single claim. A restorer who always photographs to the same standard builds, job after job, a body of evidence that looks the same to every adjuster who reviews it — predictable, complete and easy to audit. Consistency is its own trust signal: a reviewer who knows a supplier's reports are always documented the same way spends less time checking and more time approving.",
        ],
      },
      {
        heading: "Price against a published guideline",
        paragraphs: [
          "Transparency extends to the numbers. RestoreAssist estimates costs from a company's own saved rates as the primary source and reports each line item's status against national rate guidelines, in Australian dollars and metric units. That lets an adjuster verify that rates sit within recognised ranges rather than taking a total on trust. A price that can be checked against a guideline is a price that starts a conversation, not an argument.",
          "The mechanism matters more than the promise. Each estimate line records whether its rate sits inside the recognised range, and any rate that falls outside is surfaced rather than buried, so the discussion about an unusual cost happens up front with the reasoning attached. An adjuster who can see, line by line, which rates are within guideline and which are flagged for explanation spends their time on the few items that need it, instead of re-checking the whole estimate on suspicion.",
        ],
      },
      {
        heading: "Be honest about what is measured and what is estimated",
        paragraphs: [
          "The hardest discipline in reporting is not overstating what you know. RestoreAssist takes this seriously enough to build it into the product: an internal evidence register classifies every quantitative claim as sourced, validated, a working hypothesis or a derived figure, and only sourced or validated claims are allowed into customer-facing material. Estimates are labelled as estimates, and unproven figures stay out of the report entirely.",
          "That restraint is itself a trust signal. A report that distinguishes a measured moisture reading from a projected drying time — and never dresses an estimate up as a fact — is a report an insurer can rely on. Over time, that reliability is what turns a restorer into a preferred supplier.",
        ],
      },
      {
        heading: "Let the report carry its own audit trail",
        paragraphs: [
          "The strongest transparency signal is a report that hands the reviewer the checklist. RestoreAssist generates a standards-referenced verification checklist built for adjuster and insurer review, where each item is tied to a tier and a governing clause, and the report only reads as meeting the minimum standard when every critical item passes. The document states plainly which standard clauses it has cited and which expected ones are missing because the data was not recorded — rather than quietly leaving a gap for the adjuster to find.",
          "That candour changes the review. An adjuster is not left reconstructing whether the job was done to standard; the report tells them, item by item, and flags its own shortfalls. A report that surfaces its missing pieces is far easier to trust than one that presents a clean face and hopes no one checks.",
        ],
      },
    ],
    keyTakeaways: [
      "Insurers trust reports where every material claim is checkable against a source.",
      "The report carries a standards-referenced verification checklist and declares its own cited-versus-missing clauses, so an adjuster is never left guessing.",
      "Tie findings to their governing clause (for example S500:2021 §10.4.1 for category) so the report cites the standard, not the technician.",
      "Photograph to S500:2021 §9.2.5 — timestamped, geotagged, sequenced — and keep before-and-after pairs.",
      "Show pricing against a published guideline and label estimates honestly; never present an estimate as a measured fact.",
    ],
    references: [
      {
        label: "Insurance Council of Australia",
        detail:
          "Annual restoration/remediation claims volume of approximately 250,000 (reported range 230,000-280,000). Recorded as the sole SOURCED industry figure in lib/nir-evidence-architecture.ts (CLAIM-001).",
      },
      {
        label: "IICRC S500:2021 §9.2.5",
        detail: "Project documentation and photographic evidence requirements.",
      },
      {
        label: "IICRC S500:2021 §6, §10.4.1",
        detail: "Drying equipment selection and water category classification.",
      },
    ],
    published: true,
  },

  {
    slug: "streamlining-restoration-workflow",
    title: "Streamlining Your Restoration Workflow",
    excerpt:
      "Most lost time in restoration is double-handling between the field and the office. How one connected system for capture, scope, reporting and billing removes the re-keying.",
    category: "Workflow",
    date: PUBLISH_DATE,
    isoDate: PUBLISH_ISO,
    readTime: "6 min read",
    author: AUTHOR,
    authorCredential: AUTHOR_CREDENTIAL,
    description:
      "How Australian restoration businesses cut double-handling between field and office: one connected system for standards-mapped capture, scope, reporting, exports and integrations.",
    keywords: [
      "restoration workflow",
      "field to office restoration",
      "restoration software Australia",
      "restoration reporting",
      "restoration business efficiency",
    ],
    intro: [
      "Ask a restoration business owner where their week disappears and the answer is rarely the drying. It is the re-keying: the field notes typed up again in the office, the scope re-entered into the estimate, the estimate copied into the accounting system, the same photos filed in three places. Every hand-off is a chance to introduce an error and a place for a job to stall.",
      "RestoreAssist is built around a single idea — office and field on one system — so that a fact captured once is used everywhere. Its stated purpose is to remove double-handling between field capture and office processing. Here is what that looks like across a job.",
    ],
    sections: [
      {
        heading: "Capture once, in the field",
        paragraphs: [
          "The workflow starts where the job does: on site, often somewhere with no signal. RestoreAssist queues captures on the device and syncs them automatically when the connection returns, so a technician can record the category, class, moisture readings and photographs directly against the governing IICRC clauses without waiting for a bar of reception. Because each field is mapped to its standard as it is entered, the information arrives structured and citeable, not as free text someone has to transcribe and interpret later.",
        ],
      },
      {
        heading: "Built for the reality of the field, not the demo",
        paragraphs: [
          "Restoration work happens in flooded basements and regional callouts where a signal is not guaranteed, so the capture has to survive the conditions. RestoreAssist queues writes on the device and drains them automatically when the connection returns, retrying failed syncs with a backoff rather than dropping them. Sketch work is protected the hardest of all: a floor sketch can represent half an hour of irrecoverable drawing, so it is retried far more persistently than a routine field before it is ever allowed to fail.",
          "Each record also shows the technician where it stands — synced, pending, in conflict, or offline — so nothing is silently lost between the van and the office. This is the unglamorous engineering that makes the single-system promise real: a workflow that only holds together on a strong connection is not a field tool, and the point of removing double-handling is that the record captured on site is the record the office receives, intact.",
        ],
      },
      {
        heading: "Turn capture into scope and report without re-entry",
        paragraphs: [
          "Once the assessment exists as structured data, the scope and the report draw from it directly. The same category and class that were recorded on site drive the scope items and the drying plan; the same photographs, already timestamped and sequenced to S500:2021 §9.2.5, populate the documentation. Nothing is typed twice. RestoreAssist applies one consistent report framework across water, mould, biohazard and fire work, each governed by its own IICRC standard, so the structure an adjuster reads is the same regardless of claim type.",
        ],
        bullets: [
          "Water damage governed by ANSI/IICRC S500-2021.",
          "Mould remediation governed by ANSI/IICRC S520-2024.",
          "Trauma and biohazard governed by ANSI/IICRC S540-2023.",
          "Fire and smoke governed by ANSI/IICRC S700-2025.",
        ],
      },
      {
        heading: "Export and hand off in the format each party expects",
        paragraphs: [
          "A finished report is only useful once it reaches the people who need it. RestoreAssist generates the report as a PDF and connects with the systems a restoration business already runs — accounting platforms including Xero, QuickBooks and MYOB, and insurer claim workflows through its Guidewire integration. The estimate that came out of the assessment can move to billing, and the report can move to the insurer, without being rebuilt by hand at each step.",
          "Handing off cleanly is where a lot of value quietly leaks away in restoration. A report that has to be re-typed into the insurer's system, or an estimate re-entered into the accounts, is one that can be transcribed wrong or left waiting while someone finds the time. Because the estimate and the report are built from the same structured inspection, the version that reaches the insurer and the version that reaches the accounts are the version the technician captured — not a re-keyed approximation of it.",
        ],
      },
      {
        heading: "The compounding effect of one system",
        paragraphs: [
          "The gain from any single one of these steps is modest. The gain from all of them together is not, because the errors that eat a restoration back-office are overwhelmingly transcription errors — the reading that got copied wrong, the scope item that got missed, the invoice that did not match the report. Removing the re-entry removes the class of error, not just the minutes. That is the practical meaning of the platform's promise of one system, fewer gaps and more confidence.",
          "None of this removes the operator from the loop — the point is the opposite. One record captured against the standard means a technician's judgement is recorded once and carried faithfully, instead of being re-interpreted at every hand-off by someone who was not on site. The office works from what the field actually found, the invoice matches the report it came from, and the whole job leaves a single consistent trail rather than three slightly different versions of the truth.",
        ],
      },
    ],
    keyTakeaways: [
      "Double-handling between field and office is one of the biggest workflow costs in restoration.",
      "Capturing standards-mapped data once, on site, lets scope, report and billing draw from the same record.",
      "Field capture is offline-first — queued on the device, auto-synced on reconnect, with sketch work retried hardest and every record's sync status visible.",
      "One report structure spans water (S500:2021), mould (S520:2024), biohazard (S540:2023) and fire (S700:2025).",
      "PDF reporting plus accounting (Xero, QuickBooks, MYOB) and insurer (Guidewire) integrations remove re-keying at the hand-offs.",
    ],
    references: [
      {
        label: "RestoreAssist product positioning",
        detail:
          "\"Office and Field. One System\" and the removal of double-handling between field capture and office processing (lib/brand.ts).",
      },
      {
        label: "Standards coverage",
        detail:
          "Water S500:2021, mould S520:2024, biohazard S540:2023, fire S700:2025 (lib/nir-standards-mapping.ts standards registry).",
      },
      {
        label: "Reporting and integrations",
        detail:
          "PDF report generation (lib/nir-report-generation.ts); accounting integrations for Xero, QuickBooks and MYOB, and insurer integration via Guidewire (lib/progress/integrations, lib/nir-guidewire-integration.ts).",
      },
    ],
    published: true,
  },

  {
    slug: "ai-in-restoration-assessment",
    title: "AI in Restoration Assessment: Assistant, Not Adjudicator",
    excerpt:
      "The useful role for AI in restoration is not to decide the classification — it is to remove the typing. Why the standard, not the model, should make the call.",
    category: "Technology",
    date: PUBLISH_DATE,
    isoDate: PUBLISH_ISO,
    readTime: "6 min read",
    author: AUTHOR,
    authorCredential: AUTHOR_CREDENTIAL,
    description:
      "A grounded look at AI in water damage restoration assessment: where AI genuinely helps (capture and drafting) and why classification decisions belong to the standard and the operator.",
    keywords: [
      "AI restoration assessment",
      "AI water damage",
      "restoration technology",
      "AI assists not replaces",
      "restoration compliance AI",
    ],
    intro: [
      "There is a lot of noise about AI transforming restoration. Most of it skips the question that actually matters on a job: who is accountable for the call? If a report says a loss is Category 3 and the scope follows from that, someone has to stand behind the classification — to an adjuster, and if it ever comes to it, in a dispute. That is not a decision to hand to a model.",
      "RestoreAssist takes a deliberate position on this. AI assists administration and field technicians; the decisions stay with the operator. Or, more bluntly: AI assists, never replaces. This article is about what that split looks like in practice.",
    ],
    sections: [
      {
        heading: "What AI is good at here: removing the busywork",
        paragraphs: [
          "The genuine, unglamorous wins from AI in the field are in capture and drafting — the work around the assessment, not the judgement at its centre. RestoreAssist uses AI vision to read a moisture meter's display straight from a photograph, so a technician can photograph the meter instead of squinting at a screen and thumbing the number into a phone. The same vision approach turns a hand-drawn floor sketch into a digital plan, and AI drafts the narrative sections of a report and a plain-language client summary from the structured inspection data.",
          "These are all tasks where an assistant that is fast, and occasionally wrong, is still a clear net gain — precisely because a human reviews the result before it counts. They compress the busywork around the assessment without touching the determinations that drive the scope.",
        ],
      },
      {
        heading: "The assisting work AI takes off the technician",
        paragraphs: [
          "The pattern repeats across the platform wherever there is structured busywork to absorb. AI can classify an evidence photo, group a set of moisture readings, pull a structured record out of an uploaded PDF report, and build a room-by-room contents manifest from photographs for an insurance claim. Each of these is a drafting or sorting task with a human check at the end, not a judgement that decides the scope.",
          "The test for any of these features is the same: does it show its working, and is a person still accountable for the result? An AI that drafts a contents list a technician then confirms is genuinely useful. An AI that silently decided which contents were a total loss would not be, because no one could show, later, why the call was made. Assistance that a human signs off on adds speed; automation that hides its reasoning subtracts trust.",
        ],
      },
      {
        heading: "What AI should not do: make the compliance call",
        paragraphs: [
          "The classification that drives a water damage scope is not a matter of taste. Category is defined in S500:2021 §10.4.1 and class in S500:2021 §10.4.3, against observable facts — the source of the water, the elapsed time, the affected area, the materials involved. Those determinations should be made by a deterministic engine applying the standard to recorded inputs, where the same inputs always produce the same result and the reasoning can be shown.",
          "That is how RestoreAssist is built. The standards engine, not a language model, maps a reading to its threshold and a loss to its category and class. The output is defensible because it is reproducible and cites the clause it came from. An AI that produced a plausible-sounding category with no traceable basis would be the opposite of what a restoration report needs.",
          "There is a practical reason to prefer the engine, too. A deterministic classifier can be tested: feed it the same source, elapsed time, affected area and materials and it returns the same category and class every time, and that repeatability is exactly what an auditor or a tribunal can rely on. A language model that might phrase the same facts differently on two runs cannot offer that guarantee, however fluent its output. For the parts of a report that carry legal and financial weight, reproducibility beats eloquence — and the deterministic path can also show, step by step, why a given classification was reached, which is the thing a disputed report most needs to do.",
        ],
      },
      {
        heading: "Why the split matters for compliance",
        paragraphs: [
          "Keeping AI on the assistance side of the line is not caution for its own sake — it is what keeps a report auditable. Every load-bearing claim in a RestoreAssist report can be traced to a standard clause and a recorded observation, which is only possible because those claims are not generated by a model that cannot show its working. The operator remains accountable for the decision, and the standard remains the authority behind it.",
          "The result is a workflow where AI does what it is good at and the standard does what it is for. Technicians get the time back that used to go into data entry; adjusters get reports whose findings hold up. That is a more useful future for AI in restoration than any promise to replace the assessor.",
        ],
      },
    ],
    keyTakeaways: [
      "In RestoreAssist, AI assists administration and field technicians; the decisions stay with the operator.",
      "AI's genuine value is capture and drafting — RestoreAssist uses AI vision to read moisture-meter photos, import hand-drawn sketches, and draft report narrative and client summaries.",
      "The same assist pattern repeats — photo classification, reading grouping, report extraction, contents manifests — always with a human sign-off, never a hidden decision.",
      "Category (S500:2021 §10.4.1) and class (S500:2021 §10.4.3) are decided by a deterministic standards engine, not a model, so the result is reproducible and cites its clause.",
      "Keeping AI in an assisting role is what keeps the report auditable and the operator accountable.",
    ],
    references: [
      {
        label: "RestoreAssist AI framing",
        detail:
          "\"AI assists administration and field technicians; the decisions stay with the operator\" and \"AI assists, never replaces\" (lib/brand.ts).",
      },
      {
        label: "AI vision and drafting",
        detail:
          "Moisture-meter reading extraction from photos, hand-drawn sketch import, and report/scope/summary drafting (app/api/vision/extract-reading, lib/services/ai/).",
      },
      {
        label: "IICRC S500:2021 §10.4.1, §10.4.3",
        detail:
          "Water category and class definitions applied by the deterministic classification engine (lib/nir-classification-engine.ts, lib/nir-standards-mapping.ts).",
      },
    ],
    published: true,
  },

  {
    slug: "regional-pricing-australian-restoration",
    title: "Regional Pricing in Australian Restoration",
    excerpt:
      "Restoration rates are not the same in every postcode. How to keep an estimate defensible across regions by pricing from your own rates and validating against national guidelines.",
    category: "Pricing",
    date: PUBLISH_DATE,
    isoDate: PUBLISH_ISO,
    readTime: "6 min read",
    author: AUTHOR,
    authorCredential: AUTHOR_CREDENTIAL,
    description:
      "How Australian restorers keep estimates defensible across regions: price from your own labour, equipment and material rates and validate every line item against national guidelines.",
    keywords: [
      "restoration pricing Australia",
      "regional restoration costs",
      "restoration estimate",
      "NRPG rates",
      "restoration cost guidelines",
    ],
    intro: [
      "The cost of restoring a water-damaged home is not the same in regional Queensland as it is in inner Sydney. Labour markets, travel distances, equipment availability and disposal costs all vary by region, and an estimate that ignores that variation is either leaving money on the table or pricing itself out of the work. The challenge is to reflect genuine regional differences without producing numbers an adjuster cannot check.",
      "The answer is not a single national price list. It is a pricing method that starts from your own real costs and stays honest against a recognised benchmark.",
    ],
    sections: [
      {
        heading: "Why regional variation is real",
        paragraphs: [
          "Restoration is a field trade, so its costs track local conditions. A job an hour past the edge of a city carries travel and callout costs a metropolitan job does not. Trade labour rates differ between markets. Waste disposal, especially for contaminated Category 3 losses, is priced by local facilities. None of this is padding — it is the actual cost of doing the work in that place, and a credible estimate has to carry it.",
          "The risk is that 'it costs more out here' becomes an unfalsifiable claim. That is exactly the kind of statement an insurer pushes back on, and rightly so. The fix is to make regional costs explicit and checkable rather than baked invisibly into a total.",
          "Australia makes this especially pointed. The distances between a capital city and the regional jobs around it are large by world standards, disposal infrastructure is unevenly distributed, and trade availability can swing sharply after a widespread event like a flood or storm, when every restorer in a region is booked at once. A pricing method that cannot bend to those realities will misprice work in exactly the conditions where accurate pricing matters most.",
        ],
      },
      {
        heading: "Price from your own rates, not a guess",
        paragraphs: [
          "RestoreAssist estimates costs from a company's own saved pricing configuration as the primary source. Your labour, equipment and material rates — the ones that reflect your region and your business — are what the estimate is built from. Where a company has not set a rate for a given item, the engine falls back to a national midpoint so the line still has a defensible starting figure rather than a blank.",
          "Working from your own rates is what lets an estimate reflect a region honestly. A restorer in a high-cost market prices from high-cost inputs; a restorer in a low-cost market prices from low-cost inputs; and in both cases the estimate is grounded in real numbers the business can stand behind.",
        ],
      },
      {
        heading: "Validate every line against a national guideline",
        paragraphs: [
          "Regional does not mean unaccountable. RestoreAssist reports each estimate line item's status against national rate guidelines, so both you and the adjuster can see whether a rate sits within recognised ranges. A rate above the guideline is not automatically wrong — a genuine regional cost can justify it — but it is flagged, which turns a potential dispute into a documented, explainable decision.",
          "That combination is the point: your own rates for accuracy, a national benchmark for accountability. Estimates are calculated in Australian dollars and metric units throughout, in keeping with how Australian claims are actually assessed.",
        ],
      },
      {
        heading: "Region is a rulebook, not just a rate",
        paragraphs: [
          "Region changes more than the numbers — it changes the rules. RestoreAssist encodes jurisdiction-specific requirements across Australia's eight states and territories, each mapped to its own building authority, from the Queensland Building and Construction Commission to the Victorian Building Authority. The obligations that flow from a loss are not uniform: the cutoff year that triggers a pre-renovation asbestos assessment, for instance, differs between Queensland and New South Wales, and cyclone-region requirements apply in the north that simply do not exist in the south.",
          "Pricing that ignores this is pricing half the job. An estimate in a cyclone region that has to meet cyclone-rated specifications carries costs a temperate-zone estimate does not, and those costs are defensible precisely because they trace to a jurisdictional requirement rather than a preference. Getting the region right is as much about scoping the correct obligations as it is about applying the correct rate.",
          "The platform reflects that complexity in the contingency it applies, too. A base allowance scales up for contaminated Category 2 or 3 work, for specialty testing such as asbestos or mould, and for large affected areas — within a capped range — so the buffer on an estimate is tied to the risk actually present rather than a flat guess.",
        ],
      },
      {
        heading: "Make the reasoning visible",
        paragraphs: [
          "Whatever the region, the estimate that gets approved with the least friction is the one whose reasoning is on the page. Line items tied to scope, rates sourced from a real configuration, and a clear indication of where a number sits against the national guideline together tell an adjuster not just what a job costs but why. Regional pricing done transparently is not a source of friction — it is a way to justify the true cost of the work without an argument.",
        ],
      },
    ],
    keyTakeaways: [
      "Regional cost differences in restoration are real — travel, labour, disposal and availability all vary by location.",
      "Price from your own saved rates as the primary source so the estimate reflects your region honestly.",
      "Validate every line item against national rate guidelines so above-guideline rates are flagged and explainable.",
      "Region is a rulebook: obligations like asbestos-assessment cutoffs and cyclone-rated specifications vary by state and belong in the scope, not just the rate.",
      "Estimates run in Australian dollars and metric units; visible reasoning is what gets a regional estimate approved.",
    ],
    references: [
      {
        label: "RestoreAssist cost estimation",
        detail:
          "Company pricing configuration used as the primary rate source, with a national-guideline midpoint fallback, complexity-scaled contingency, and per-line-item guideline-compliance reporting, in AUD and metric units (lib/nir-cost-estimation.ts).",
      },
      {
        label: "Jurisdictional coverage",
        detail:
          "State- and territory-specific building-code requirements and regulatory bodies across Australia's eight states and territories (lib/nir-jurisdictional-matrix.ts, lib/nir-building-codes.ts).",
      },
    ],
    published: true,
  },
];

/** Every article, in listing order. */
export function getAllArticles(): Article[] {
  return ARTICLES;
}

/** Look up a single article by slug. Returns undefined for unknown slugs. */
export function getArticleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

/** Slugs of published articles — the source of truth for static route params. */
export function getPublishedSlugs(): string[] {
  return ARTICLES.filter((article) => article.published).map(
    (article) => article.slug,
  );
}
