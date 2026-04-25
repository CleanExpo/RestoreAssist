/**
 * GET /api/whs/compliance-checks/[inspectionId]
 *
 * Returns all WHS compliance check results for an inspection:
 *   P1-WHS5 — Electrical Certificate of Compliance triggers (post-flood, per state)
 *   P1-WHS6 — Contamination registry advisory (EPA contaminated land)
 *   P1-WHS7 — Subcontractor Statement (SDS) requirements (AU)
 *   P1-WHS8 — Biosecurity flags (AU quarantine + NZ MPI)
 *
 * These checks are advisory — they do not integrate with external registers
 * (state EPA, EPA contamination DB) which require procured API access.
 * The endpoint codifies the regulatory logic so technicians see what's required.
 *
 * P1-WHS5/6/7/8 — RA-1130
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── STATE LOOKUP TABLES ──────────────────────────────────────────────────────

const ELECTRICAL_COC_BY_STATE: Record<string, { body: string; url: string; triggerNote: string }> = {
  VIC: {
    body: "Energy Safe Victoria (ESV)",
    url: "https://www.esv.vic.gov.au",
    triggerNote: "Electrical Certificate of Compliance required before habitation. Form B issued by licensed electrician.",
  },
  NSW: {
    body: "NSW Fair Trading",
    url: "https://www.fairtrading.nsw.gov.au",
    triggerNote: "Electrical Safety Certificate required. Licensed electrical contractor issues on completion.",
  },
  QLD: {
    body: "Electrical Safety Office (ESO)",
    url: "https://www.worksafe.qld.gov.au/electrical",
    triggerNote: "Electrical Safety Certificate required under Electrical Safety Act 2002.",
  },
  SA: {
    body: "Consumer and Business Services (CBS)",
    url: "https://www.cbs.sa.gov.au",
    triggerNote: "Certificate of Compliance (Electrical Work) required from licensed electrical contractor.",
  },
  WA: {
    body: "EnergySafety WA",
    url: "https://www.energy.wa.gov.au/energysafety",
    triggerNote: "Electrical Certificate of Compliance required. Licensed electrical contractor.",
  },
  TAS: {
    body: "Worksafe Tasmania",
    url: "https://www.worksafe.tas.gov.au",
    triggerNote: "Electrical work certificate required from licensed contractor before re-energising.",
  },
  ACT: {
    body: "Access Canberra",
    url: "https://www.accesscanberra.act.gov.au",
    triggerNote: "Electrical Safety Certificate of Compliance required.",
  },
  NT: {
    body: "NT WorkSafe",
    url: "https://worksafe.nt.gov.au",
    triggerNote: "Certificate of Electrical Compliance required after flood-affected electrical work.",
  },
  NZ: {
    body: "Electrical Workers Registration Board (EWRB)",
    url: "https://www.ewrb.govt.nz",
    triggerNote: "Electrical Certificate of Compliance (CoC) required under Electricity (Safety) Regulations 2010.",
  },
};

const BIOSECURITY_ZONES: Array<{ name: string; states: string[]; note: string }> = [
  {
    name: "Varroa mite emergency zone",
    states: ["NSW"],
    note: "NSW DPI Varroa mite emergency zone — check equipment movement restrictions at dpi.nsw.gov.au/biosecurity.",
  },
  {
    name: "Fire ant biosecurity zone",
    states: ["QLD", "NSW"],
    note: "Fire ant biosecurity zone — equipment and soil movement restrictions apply. See biosecurity.qld.gov.au.",
  },
  {
    name: "Myrtle rust zone",
    states: ["NSW", "VIC", "QLD", "SA", "WA"],
    note: "Myrtle rust present — check plant material movement restrictions if handling vegetation.",
  },
  {
    name: "NZ MPI biosecurity",
    states: ["NZ"],
    note: "NZ MPI biosecurity — cross-island equipment/contents transfer requires compliance with Biosecurity Act 1993.",
  },
];

// ─── STATE DETECTION ──────────────────────────────────────────────────────────

function postcodeToState(postcode: string): string {
  const p = parseInt(postcode, 10);
  if (postcode.length === 4) {
    if (p >= 1000 && p <= 2599) return "NSW";
    if (p >= 2619 && p <= 2899) return "NSW";
    if (p >= 2921 && p <= 2999) return "NSW";
    if (p >= 200 && p <= 299) return "ACT";
    if (p >= 2600 && p <= 2618) return "ACT";
    if (p >= 2900 && p <= 2920) return "ACT";
    if (p >= 3000 && p <= 3999) return "VIC";
    if (p >= 8000 && p <= 8999) return "VIC";
    if (p >= 4000 && p <= 4999) return "QLD";
    if (p >= 9000 && p <= 9999) return "QLD";
    if (p >= 5000 && p <= 5799) return "SA";
    if (p >= 5800 && p <= 5999) return "SA";
    if (p >= 6000 && p <= 6797) return "WA";
    if (p >= 6800 && p <= 6999) return "WA";
    if (p >= 7000 && p <= 7999) return "TAS";
    if (p >= 800 && p <= 999) return "NT";
    if (p >= 100 && p <= 199) return "NZ";
  }
  return "UNKNOWN";
}

function isFloodAffected(classifications: Array<{ category: string }>): boolean {
  return classifications.some((c) =>
    ["water", "flood", "storm", "sewage"].includes(c.category?.toLowerCase()),
  );
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { inspectionId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId } = params;

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      userId: true,
      propertyPostcode: true,
      propertyYearBuilt: true,
      classifications: { select: { category: true } },
      scopeItems: { select: { description: true } },
    },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const state = postcodeToState(inspection.propertyPostcode);
  const isFlood = isFloodAffected(inspection.classifications);

  // ── P1-WHS5: Electrical CoC ────────────────────────────────────────────────
  const electricalCoc = isFlood
    ? {
        required: true,
        state,
        authority: ELECTRICAL_COC_BY_STATE[state] ?? {
          body: "Local electrical safety authority",
          url: null,
          triggerNote: "Electrical Certificate of Compliance required before habitation. Contact your state electrical safety authority.",
        },
      }
    : { required: false, reason: "Not a flood/water job — electrical CoC not automatically triggered" };

  // ── P1-WHS6: Contamination ─────────────────────────────────────────────────
  const contaminationCheck = {
    advisory: true,
    message:
      "Check the EPA contaminated land register for this property address before proceeding. " +
      (state === "NSW"
        ? "NSW EPA: https://www.epa.nsw.gov.au/your-environment/land/contaminated-land/register"
        : state === "VIC"
          ? "VIC EPA: https://www.epa.vic.gov.au/for-community/environmental-information/land"
          : state === "QLD"
            ? "QLD: https://environment.des.qld.gov.au/management/land/contaminated"
            : state === "NZ"
              ? "NZ: https://www.epa.govt.nz/industry-areas/hazardous-substances/contaminated-land"
              : "Contact your state EPA for contaminated land register access."),
    note: "External API access to state EPA registers is not yet integrated — manual check required.",
  };

  // ── P1-WHS7: Subcontractor Statement ──────────────────────────────────────
  const hasSubcontractorScope = inspection.scopeItems.some((s) =>
    /subcontract|labour|hire|scaffold|demolit|hazmat/i.test(s.description),
  );
  const subcontractorStatement = state !== "NZ"
    ? {
        required: hasSubcontractorScope,
        description: "NSW Workers Comp + Payroll Tax + Superannuation Guarantee clearance required before paying subcontractors (AU).",
        form: "Subcontractor Statement (SS01 or similar per state)",
        reference: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/payroll-tax/subcontractors",
      }
    : { required: false, reason: "NZ jurisdiction — SDS not applicable" };

  // ── P1-WHS8: Biosecurity ───────────────────────────────────────────────────
  const applicableBiosecurity = BIOSECURITY_ZONES.filter((zone) =>
    zone.states.includes(state),
  );

  return NextResponse.json({
    inspectionId,
    state,
    isFloodAffected: isFlood,
    checks: {
      electricalCoc,
      contaminationCheck,
      subcontractorStatement,
      biosecurity: {
        flagged: applicableBiosecurity.length > 0,
        zones: applicableBiosecurity,
        note:
          applicableBiosecurity.length > 0
            ? "Biosecurity restrictions may apply — verify equipment and contents movement with relevant authority before transport."
            : "No active biosecurity restrictions identified for this state.",
      },
    },
  });
}
