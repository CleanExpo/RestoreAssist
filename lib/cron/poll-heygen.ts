/**
 * HeyGen Render Status Polling
 *
 * Finds ContentJobs stuck in VIDEO_RENDERING state and checks HeyGen's
 * status API. Updates videoUrl + status on completion, marks FAILED after
 * 2-hour timeout.
 *
 * Called by: /api/cron/poll-heygen (every 5 minutes)
 */

import { prisma } from '@/lib/prisma'
import type { CronJobResult } from './runner'

const HEYGEN_STATUS_API = 'https://api.heygen.com/v1/video_status.get'
const MAX_RENDER_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours

interface HeyGenStatusResponse {
  data?: {
    status: 'processing' | 'completed' | 'failed'
    video_url?: string
    error?: string
    duration?: number
  }
  error?: string
}

export async function pollHeygenRenders(): Promise<CronJobResult> {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) {
    return { itemsProcessed: 0, metadata: { error: 'HEYGEN_API_KEY not configured' } }
  }

  // Find all jobs in VIDEO_RENDERING state with a render job ID
  const renderingJobs = await prisma.contentJob.findMany({
    where: {
      status: 'VIDEO_RENDERING',
      heygenRenderJobId: { not: null },
      updatedAt: {
        // Only poll jobs updated in the last 24 hours (safety bound)
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true,
      heygenRenderJobId: true,
      createdAt: true,
    },
  })

  if (renderingJobs.length === 0) {
    return { itemsProcessed: 0, metadata: { message: 'No rendering jobs to poll' } }
  }

  let completed = 0
  let failed = 0
  let stillProcessing = 0

  for (const job of renderingJobs) {
    try {
      // Check if render has exceeded 2-hour timeout
      const age = Date.now() - job.createdAt.getTime()
      if (age > MAX_RENDER_AGE_MS) {
        await prisma.contentJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: `HeyGen render timed out after ${Math.round(age / 60000)} minutes`,
          },
        })
        failed++
        console.warn(`[poll-heygen] Job ${job.id} timed out (${Math.round(age / 60000)}m)`)
        continue
      }

      // Query HeyGen status API
      const url = `${HEYGEN_STATUS_API}?video_id=${job.heygenRenderJobId}`
      const response = await fetch(url, {
        headers: { 'X-Api-Key': apiKey },
      })

      if (!response.ok) {
        console.error(`[poll-heygen] HeyGen API ${response.status} for job ${job.id}`)
        continue // Skip this job, try again next cycle
      }

      const json = (await response.json()) as HeyGenStatusResponse

      if (json.data?.status === 'completed' && json.data.video_url) {
        // Render finished — update job with video URL
        await prisma.contentJob.update({
          where: { id: job.id },
          data: {
            videoUrl: json.data.video_url,
            status: 'VIDEO_READY',
          },
        })
        completed++
        console.log(`[poll-heygen] Job ${job.id} completed: ${json.data.video_url}`)
      } else if (json.data?.status === 'failed') {
        // Render failed on HeyGen side
        await prisma.contentJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: `HeyGen render failed: ${json.data.error || 'Unknown error'}`,
          },
        })
        failed++
        console.error(`[poll-heygen] Job ${job.id} failed: ${json.data.error}`)
      } else {
        // Still processing
        stillProcessing++
      }
    } catch (err) {
      console.error(`[poll-heygen] Error polling job ${job.id}:`, err)
    }
  }

  return {
    itemsProcessed: completed + failed,
    metadata: { completed, failed, stillProcessing, total: renderingJobs.length },
  }
}
