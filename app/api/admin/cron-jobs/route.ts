import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";

const CRON_JOBS = [
  {
    id: "advance-workflows",
    name: "Advance Workflows",
    description: "Progresses inspection workflows to next stage",
    path: "/api/cron/advance-workflows",
  },
  {
    id: "cleanup",
    name: "Cleanup",
    description: "Removes stale/orphaned data",
    path: "/api/cron/cleanup",
  },
  {
    id: "cleanup-expired-files",
    name: "Cleanup Expired Files",
    description: "Deletes expired upload files",
    path: "/api/cron/cleanup-expired-files",
  },
  {
    id: "dead-letter-review",
    name: "Dead Letter Review",
    description: "Reviews and requeues failed jobs",
    path: "/api/cron/dead-letter-review",
  },
  {
    id: "process-emails",
    name: "Process Emails",
    description: "Sends queued email notifications",
    path: "/api/cron/process-emails",
  },
  {
    id: "sync-invoices",
    name: "Sync Invoices",
    description: "Syncs invoices with accounting integrations",
    path: "/api/cron/sync-invoices",
  },
  {
    id: "generate-content",
    name: "Generate Content",
    description:
      "Daily: topic selection → AI script → voiceover → avatar video",
    path: "/api/cron/generate-content",
  },
  {
    id: "poll-heygen",
    name: "Poll HeyGen",
    description: "Every 5 min: checks HeyGen render status, updates videoUrl",
    path: "/api/cron/poll-heygen",
  },
  {
    id: "distribute-content",
    name: "Distribute Content",
    description: "Every 15 min: uploads VIDEO_READY videos to YouTube",
    path: "/api/cron/distribute-content",
  },
  {
    id: "collect-analytics",
    name: "Collect Analytics",
    description: "Daily: fetches YouTube view/like/comment stats",
    path: "/api/cron/collect-analytics",
  },
];

// GET — list all cron jobs
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  return NextResponse.json({ jobs: CRON_JOBS });
}

// POST — manually trigger a cron job
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  const { jobId } = await request.json();
  const job = CRON_JOBS.find((j) => j.id === jobId);
  if (!job)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });

  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}${job.path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    return NextResponse.json({ success: res.ok, status: res.status });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
