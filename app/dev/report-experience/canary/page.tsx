import { testHelpersBlocked } from "@/app/api/test/_helpers";
import { notFound } from "next/navigation";
import { isProductionBuild } from "@/lib/env";
import { ReportDesignStudio } from "@/components/report-experience/ReportDesignStudio";
import { alignedStandardForClaimType, standardCite } from "@/lib/nir-standards-mapping";
import { canarySnapshot, isCanaryAudience } from "@/lib/report-experience/canary/scenario";

export const metadata = {
  title: "RestoreAssist | Report theme canary (synthetic)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ audience?: string | string[] }> };

/**
 * RA-8110: the page the report theme canary drives in a real browser.
 *
 * Same two-key switch as the RA-8107 visuals page: a 404 unless
 * ALLOW_TEST_HELPERS=true, and still a 404 on a production deploy. It renders
 * only the synthetic scenario. With no `audience` it is the synthetic studio;
 * with `?audience=technician` (and the other four) it is the studio fed that
 * audience's snapshot. An unknown audience is a 404, never a default.
 */
export default async function ReportThemeCanaryPage({ searchParams }: PageProps) {
  // Merging to main deploys production, so this page is never served by a production build, even
  // where the test-helper switch is on (the sandbox deploy sets it). CI boots `next dev`, which is
  // not a production build, so the canary still runs there.
  if (isProductionBuild()) notFound();
  if (testHelpersBlocked()) notFound();
  const { audience } = await searchParams;
  if (audience !== undefined && !isCanaryAudience(audience)) notFound();

  const standard = alignedStandardForClaimType("water");
  return (
    <>
      <ReportDesignStudio snapshot={audience === undefined ? undefined : canarySnapshot(audience)} />
      <section aria-label="Standards referenced" data-testid="canary-standards" style={{ padding: "1rem 2rem", maxWidth: "64rem", margin: "0 auto" }}>
        <p>
          {standard
            ? `Water damage work is aligned to IICRC ${standardCite(standard)}. This is a reference, not a compliance claim.`
            : "No single IICRC standard governs this claim type."}
        </p>
      </section>
    </>
  );
}
