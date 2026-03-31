import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const CRON_JOBS = [
  { id: 'advance-workflows', name: 'Advance Workflows', description: 'Progresses inspection workflows to next stage', path: '/api/cron/advance-workflows' },
  { id: 'cleanup', name: 'Cleanup', description: 'Removes stale/orphaned data', path: '/api/cron/cleanup' },
  { id: 'cleanup-expired-files', name: 'Cleanup Expired Files', description: 'Deletes expired upload files', path: '/api/cron/cleanup-expired-files' },
  { id: 'dead-letter-review', name: 'Dead Letter Review', description: 'Reviews and requeues failed jobs', path: '/api/cron/dead-letter-review' },
  { id: 'process-emails', name: 'Process Emails', description: 'Sends queued email notifications', path: '/api/cron/process-emails' },
  { id: 'sync-invoices', name: 'Sync Invoices', description: 'Syncs invoices with accounting integrations', path: '/api/cron/sync-invoices' },
]

// GET — list all cron jobs
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ jobs: CRON_JOBS })
}

// POST — manually trigger a cron job
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { jobId } = await request.json()
  const job = CRON_JOBS.find(j => j.id === jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}${job.path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` }
    })
    return NextResponse.json({ success: res.ok, status: res.status })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
