import { notFound } from "next/navigation";
import { ReportDesignStudio } from "@/components/report-experience/ReportDesignStudio";

export const metadata = {
  title: "RestoreAssist | Report Experience Studio (synthetic prototype)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * RA-8106: non-production-only ten-theme gallery.
 * Never serve a synthetic preview as a live claim or expose client data.
 */
export default function ReportExperienceDesignStudioPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ReportDesignStudio />;
}
