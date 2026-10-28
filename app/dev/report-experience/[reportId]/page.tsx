import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ReportDesignStudio } from "@/components/report-experience/ReportDesignStudio";
import { authoriseReportExperienceRead } from "@/lib/report-experience/authorise";
import { buildVerifiedReportProjection, type OmittedEvidence } from "@/lib/report-experience/evidence-adapter";
import { buildReportExperienceSnapshot, type ReportExperienceSnapshot } from "@/lib/report-experience/snapshot";

export const metadata = {
  title: "RestoreAssist | Report Experience Studio (one report, development only)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ reportId: string }> };

type Outcome =
  | { ok: true; snapshot: ReportExperienceSnapshot; omitted: OmittedEvidence[] }
  | { ok: false; step: "gate" | "adapter" | "snapshot"; message: string }
  | { ok: false; refused: true };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * RA-8104: non-production-only view of ONE real report in the new design.
 *
 * The session is the only credential. No share token or grant is read from
 * the URL. A refused read is a plain 404 for 401 and 404 alike: this page is
 * a development tool, so it does not redirect to a login screen.
 */
async function load(reportId: string): Promise<Outcome> {
  let decision: Awaited<ReturnType<typeof authoriseReportExperienceRead>>;
  try {
    const session = await getServerSession(authOptions);
    decision = await authoriseReportExperienceRead({ reportId, session });
  } catch (error) {
    return { ok: false, step: "gate", message: messageOf(error) };
  }
  if (!decision.ok) return { ok: false, refused: true };

  let built: Awaited<ReturnType<typeof buildVerifiedReportProjection>>;
  try {
    built = await buildVerifiedReportProjection(decision.grant);
  } catch (error) {
    return { ok: false, step: "adapter", message: messageOf(error) };
  }
  try {
    const snapshot = buildReportExperienceSnapshot(built.projection, decision.grant, new Date().toISOString());
    return { ok: true, snapshot, omitted: built.omitted };
  } catch (error) {
    return { ok: false, step: "snapshot", message: messageOf(error) };
  }
}

export default async function ReportExperienceOneReportPage({ params }: PageProps) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { reportId } = await params;
  const outcome = await load(reportId);
  if ("refused" in outcome) notFound();
  if ("step" in outcome) {
    return (
      <main style={{ padding: "2rem", maxWidth: "48rem", margin: "0 auto" }}>
        <p role="alert">
          The {outcome.step} step refused this report: {outcome.message}
        </p>
      </main>
    );
  }
  return (
    <>
      <ReportDesignStudio snapshot={outcome.snapshot} />
      <section aria-label="Records not shown" style={{ padding: "1.5rem 2rem", maxWidth: "64rem", margin: "0 auto" }}>
        {outcome.omitted.length === 0 ? (
          <p>Every record found for this report was mapped.</p>
        ) : (
          <ul>
            {outcome.omitted.map((item, index) => (
              <li key={item.kind + ":" + (item.id ?? index)}>
                {"Not shown: " + item.kind + (item.id ? " " + item.id : "") + " - " + item.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
