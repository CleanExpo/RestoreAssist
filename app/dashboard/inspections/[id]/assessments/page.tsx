/**
 * Inspection assessments page — RA-1717 UI integration.
 *
 * Server-rendered list of the 7 assessment domains for a given
 * inspection. Each domain card surfaces the right form fields
 * (e.g. MOULD shows condition + RH; FIRE_SMOKE shows smokeType +
 * charLevel) and POSTs to /api/inspections/[id]/assessments/[type]/generate.
 *
 * Tenancy: assertInspectionTenancy — owner OR active workspace member
 * (or admin). Failure → /dashboard/claims (or /login).
 *
 * Most-recent persisted generation per domain is displayed alongside
 * the form so the user can see what they already have.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { listDomains } from "@/lib/assessments/registry";
import AssessmentDomainCard from "@/components/assessments/AssessmentDomainCard";

export const metadata = {
  title: "Assessments — RestoreAssist",
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InspectionAssessmentsPage({ params }: Props) {
  const { id: inspectionId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const tenancy = await assertInspectionTenancy(session, inspectionId);
  if (!tenancy.ok) {
    redirect("/dashboard/claims");
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      propertyPostcode: true,
    },
  });
  if (!inspection) {
    redirect("/dashboard/claims");
  }

  // Latest persisted generation per domain, in one query.
  // The generate endpoint always creates a new row (no upsert), so history
  // accumulates over the inspection's life. Bound the query with a newest-first
  // window: take 200 and dedupe to latest-per-domain in JS below. A domain's
  // latest is only missed if 200+ newer generations of OTHER domains exist —
  // far beyond real usage (7 domains). take must NOT be lowered near 7: Prisma
  // applies it as SQL LIMIT before the in-memory dedupe, so a small take could
  // return N rows of a single domain and silently hide other domains' latest.
  const generations = await prisma.assessmentGeneration.findMany({
    where: { inspectionId },
    orderBy: { generatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      assessmentType: true,
      generatedAt: true,
      modelUsed: true,
    },
  });
  const latestByDomain = new Map<
    string,
    { id: string; generatedAt: Date; modelUsed: string | null }
  >();
  for (const g of generations) {
    if (!latestByDomain.has(g.assessmentType)) {
      latestByDomain.set(g.assessmentType, {
        id: g.id,
        generatedAt: g.generatedAt,
        modelUsed: g.modelUsed,
      });
    }
  }

  const domains = listDomains();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <Link
          href={`/dashboard/inspections`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Inspections
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Assessments</h1>
        <p className="text-sm text-muted-foreground">
          {inspection.propertyAddress}
          {inspection.inspectionNumber
            ? ` · ${inspection.inspectionNumber}`
            : null}
        </p>
        <p className="text-xs text-muted-foreground pt-1">
          Each domain pulls existing inspection data + standards-grounded
          calculators to produce a report + scope + estimate. No re-typing.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {domains.map((d) => (
          <AssessmentDomainCard
            key={d.domain}
            inspectionId={inspectionId}
            domain={d.domain}
            label={d.label}
            latest={latestByDomain.get(d.domain) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
