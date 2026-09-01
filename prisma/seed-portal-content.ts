/**
 * Seed the CLIENT_EDUCATION portal library.
 *
 * The client portal already ships three free explainer articles and six free
 * videos. This adds the expanded set that the $11/month CLIENT_EDUCATION add-on
 * buys, so a technician can hand the homeowner a tablet instead of stopping work
 * to answer the same questions on every job.
 *
 * Every row here is `requiresAddon: true`. The pre-existing free rows are left
 * untouched — gating those would take away something clients already have.
 *
 * WHAT IS DELIBERATELY NOT HERE:
 *
 *   - The company introduction. `Organization.aboutCopy`, `name` and `logoUrl`
 *     already carry it and are already rendered on the portal. A
 *     PLATFORM_DEFAULT row cannot name the firm anyway, and duplicating it here
 *     would give every client two different company blurbs to disagree with.
 *   - The technician's identity. That is per-job data, not an article.
 *   - Any clause or section number from a standard. This is plain-language
 *     copy for a homeowner, and IICRC text is licensed — see
 *     `.claude/STANDARDS.md` and `lib/standards/copyright-guard.ts`. Where a
 *     standard is relevant the copy says what it requires in ordinary words
 *     rather than quoting or citing it.
 *   - Advice about a specific policy. See the note on the insurance article.
 *
 * Idempotent: upserts on the (scope, slug) unique. Safe to re-run, and re-runs
 * refresh the copy without duplicating rows.
 *
 *   DATABASE_URL=... npx tsx prisma/seed-portal-content.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString, max: 2 })),
});

interface Article {
  slug: string;
  category: string;
  mdxContent: string;
  videoSlug?: string;
}

const ARTICLES: Article[] = [
  {
    slug: "what-restoration-is",
    category: "education",
    mdxContent: `## What a restoration company actually does

A restoration company is not a cleaning company and not a builder. The job is to
stop the damage getting worse, work out how far it has spread, dry or clean the
building back to a safe condition, and record what was found and done well enough
that your insurer can rely on it.

Most of that work is invisible. Water travels through wall cavities, under
flooring and into insulation, so what you can see is usually the smallest part of
the problem. The measuring and monitoring is how your technician knows where it
went.

## Why the work is measured, not guessed

Australia and New Zealand both work to published restoration standards. They set
out how to categorise the damage, how to dry a building properly, and when it is
safe to say the work is finished.

That is why your technician takes readings on each visit rather than deciding by
eye. "It looks dry" is not a finding. A moisture reading, taken in the same place
each day and trending down to a documented target, is.`,
  },
  {
    slug: "why-training-matters",
    category: "education",
    mdxContent: `## Who trained the people in your home

Restoration technicians hold certifications from bodies such as the IICRC, and in
Australia and New Zealand many train through CARSI. The certifications cover
water damage, mould, fire and smoke, and the health and safety side of the work.

## Why it matters to you

Restoration decisions are health decisions. Whether water is treated as clean,
contaminated or grossly contaminated changes what can be dried and kept and what
has to be removed. Whether mould is treated as a containment job changes who can
safely be in the building.

Someone guessing at those calls can leave contaminated material in a home that
looks finished. Ask to see your technician's certifications — a professional will
be glad you did.`,
  },
  {
    slug: "your-equipment-on-site",
    category: "equipment",
    mdxContent: `## What the machines are doing

**Air movers** are the low, angled fans. They are not there to make you
comfortable. They break up the still, damp layer of air sitting against wet
materials so that moisture can leave them and enter the air.

**Dehumidifiers** then take that moisture back out of the air. Without them the
air movers would simply move damp air around the building.

**Air scrubbers** (also called air filtration devices) pull air through a HEPA
filter. They are used where there is mould or contamination, so that particles
are captured rather than spread.

The two work as a pair. Turning fans off overnight, or opening windows while the
dehumidifiers run, undoes the day's drying.

## Why it is loud, and why it stays

Equipment normally runs continuously for **three to five days**, and longer for a
badly affected building or dense materials like concrete and hardwood. Drying is
not finished on a schedule — it is finished when the readings say so.

Please do not switch machines off or move them. If the noise or the heat is
genuinely unmanageable, tell your technician. There are usually options.

## What "done" looks like

Drying is complete when the affected materials reach a documented target — the
same reading as similar unaffected material elsewhere in your building, held
stable rather than caught on one lucky day.

Your technician records those readings on each visit. Completion is a number they
can show you, not an opinion.`,
  },
  {
    slug: "what-a-smooth-claim-looks-like",
    category: "process",
    mdxContent: `## The shape of the job

**Day 1 — make safe and assess.** Stop the source, make the site safe, find how
far the damage has spread, and record the starting condition with photographs and
readings.

**Days 1 to 2 — extraction and set-up.** Remove standing water and any material
that cannot be saved, then place the drying equipment.

**Days 2 to 5 — monitoring.** A technician returns to take readings and adjust
the equipment. Numbers going down means it is working.

**Completion.** Readings hit target, equipment comes out, and the documentation
is finalised for your insurer.

**Repairs.** Rebuilding is a separate stage, often a different trade. Restoration
gets the building dry and safe; it does not put the kitchen back.

## What slows a claim down

Almost always one of three things: access, decisions, or scope changes. If nobody
can let the technician in, drying stalls and the job takes longer. If an insurer
needs to approve additional work, the job waits. And if hidden damage is found —
which is common — the scope has to be revised and re-approved.

None of those are anyone behaving badly. Knowing they exist is what makes them
tolerable when they happen.`,
  },
  {
    slug: "safety-while-we-work",
    category: "process",
    mdxContent: `## Staying safe around the work

Restoration sites carry real hazards, and your technician is legally required to
manage them under Australian and New Zealand work health and safety law.

**Electrical.** Water and power do not mix. Drying equipment draws a lot of
current, so leads may be run to specific circuits. Do not unplug equipment to
charge something.

**Slips and trips.** Wet floors, hoses and leads. Take particular care with
children, elderly family members and pets.

**Containment.** If plastic sheeting goes up, the area behind it is sealed for a
reason. Do not open it, and keep pets out.

**Chemicals.** Antimicrobials and cleaning products used on site are applied at
controlled rates. Your technician can tell you what has been used in any area and
provide the safety data sheet on request.

If something on site worries you, say so at the time. It is easier to explain
than to undo.`,
  },
  {
    slug: "understanding-your-claim",
    category: "insurance",
    mdxContent: `## General information, not advice about your policy

Every policy is different, and only your insurer can tell you what yours covers.
Nothing here is financial or legal advice. It is background, so the conversation
with your insurer is a more informed one.

## Things people are often surprised by

**Damage and cause are treated separately.** Many policies cover the damage water
caused while excluding the failed item that caused it. A cover decision on the
damage does not mean the pipe or appliance is covered.

**Gradual damage is usually treated differently from a sudden event.** A pipe
that burst on Tuesday and one that has been weeping for a year are not the same
claim, even when the damage looks identical.

**Making the damage worse can affect a claim.** Most policies expect you to take
reasonable steps to limit further damage — which is part of why the drying
equipment matters.

## You can usually choose your restorer

In Australia and New Zealand you are generally entitled to ask about your options
rather than accepting the first company allocated to you. Insurers may have
preferred suppliers, and there can be good reasons to use them, but it is
reasonable to ask.

## Questions worth asking your insurer

- What is my excess, and does it apply once or per event?
- Is temporary accommodation included if the building becomes unliveable?
- Is contents covered as well as the building, and are they separate limits?
- Will the repair be to the damaged area only, or matched to the rest of the room?
- Who do I contact if I disagree with a decision?

If you disagree with an outcome, insurers must have an internal complaints
process, and free external dispute resolution is available in both countries.`,
  },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const article of ARTICLES) {
    const existing = await prisma.portalContent.findUnique({
      where: { scope_slug: { scope: "PLATFORM_DEFAULT", slug: article.slug } },
      select: { id: true },
    });

    await prisma.portalContent.upsert({
      where: { scope_slug: { scope: "PLATFORM_DEFAULT", slug: article.slug } },
      create: {
        scope: "PLATFORM_DEFAULT",
        audience: "customer",
        category: article.category,
        slug: article.slug,
        mdxContent: article.mdxContent,
        videoSlug: article.videoSlug ?? null,
        requiresAddon: true,
        state: "PUBLISHED",
        publishedAt: new Date(),
      },
      // Deliberately does NOT touch `state` or `publishedAt` on update: an
      // operator who unpublished a row had a reason, and a re-seed must not
      // quietly republish it.
      update: {
        category: article.category,
        mdxContent: article.mdxContent,
        videoSlug: article.videoSlug ?? null,
        requiresAddon: true,
      },
    });

    if (existing) updated++;
    else created++;
  }

  console.log(
    `Portal education library: ${created} created, ${updated} refreshed ` +
      `(${ARTICLES.length} articles, all requiresAddon=true).`,
  );
}

main()
  .catch((err) => {
    console.error("[seed-portal-content] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
