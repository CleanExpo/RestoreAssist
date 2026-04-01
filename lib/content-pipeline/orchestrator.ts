/**
 * Content Pipeline Orchestrator
 *
 * Core engine that drives the automated content generation pipeline.
 * Handles the full lifecycle: topic selection -> script -> voice -> video.
 * Supports resuming stuck jobs from intermediate states.
 *
 * @module lib/content-pipeline/orchestrator
 */

import { prisma } from '@/lib/prisma'
import { generateScript } from './script-generator'
import { generateVoice } from './voice-generator'
import { submitVideo } from './video-submitter'
import { selectNextTopic } from './topic-selector'

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface PipelineResult {
  jobId: string
  finalStatus: string
}

interface ContentJob {
  id: string
  userId: string
  product: string
  angle: string
  platform: string
  duration: number
  status: string
  voiceoverText: string | null
  audioUrl: string | null
  heygenRenderJobId: string | null
}

// ─── RESUME HELPER ──────────────────────────────────────────────────────────

/**
 * Resume a pipeline job from its current status.
 * Continues processing from the stage that was last completed.
 */
async function resumePipeline(job: ContentJob): Promise<PipelineResult> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!voiceId) {
    throw new Error('ELEVENLABS_VOICE_ID is not configured')
  }

  try {
    // ── SCRIPT_READY → generate voice ─────────────────────────────────────
    if (job.status === 'SCRIPT_READY') {
      if (!job.voiceoverText) {
        throw new Error(`Job ${job.id} is SCRIPT_READY but has no voiceoverText`)
      }

      const audioUrl = await generateVoice({
        text: job.voiceoverText,
        voiceId,
        jobId: job.id,
      })

      await prisma.contentJob.update({
        where: { id: job.id },
        data: { audioUrl, status: 'VOICE_READY' },
      })

      // Continue to video submission
      const heygenRenderJobId = await submitVideo({
        audioUrl,
        voiceoverText: job.voiceoverText,
      })

      await prisma.contentJob.update({
        where: { id: job.id },
        data: { heygenRenderJobId, status: 'VIDEO_RENDERING' },
      })

      return { jobId: job.id, finalStatus: 'VIDEO_RENDERING' }
    }

    // ── VOICE_READY → submit video ────────────────────────────────────────
    if (job.status === 'VOICE_READY') {
      if (!job.audioUrl) {
        throw new Error(`Job ${job.id} is VOICE_READY but has no audioUrl`)
      }

      const heygenRenderJobId = await submitVideo({
        audioUrl: job.audioUrl,
        voiceoverText: job.voiceoverText ?? '',
      })

      await prisma.contentJob.update({
        where: { id: job.id },
        data: { heygenRenderJobId, status: 'VIDEO_RENDERING' },
      })

      return { jobId: job.id, finalStatus: 'VIDEO_RENDERING' }
    }

    // Job is in an unexpected state for resumption
    return { jobId: job.id, finalStatus: job.status }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown error in resumePipeline'

    await prisma.contentJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage },
    })

    return { jobId: job.id, finalStatus: 'FAILED' }
  }
}

// ─── MAIN ORCHESTRATOR ──────────────────────────────────────────────────────

/**
 * Run the full content pipeline.
 *
 * 1. Check for stuck jobs in SCRIPT_READY or VOICE_READY (resume first)
 * 2. If no stuck jobs, select a new topic
 * 3. Create ContentJob with PENDING status
 * 4. Generate script -> SCRIPT_READY
 * 5. Generate voice -> VOICE_READY
 * 6. Submit video -> VIDEO_RENDERING
 * 7. Mark topic as used
 *
 * @param systemUserId - User ID to attribute the content job to
 */
export async function runContentPipeline(
  systemUserId: string
): Promise<PipelineResult> {
  // ── 1. Check for stuck jobs that need resuming ──────────────────────────
  const stuckJob = await prisma.contentJob.findFirst({
    where: {
      userId: systemUserId,
      status: { in: ['SCRIPT_READY', 'VOICE_READY'] },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (stuckJob) {
    console.log(
      `[ContentPipeline] Resuming stuck job ${stuckJob.id} (status: ${stuckJob.status})`
    )
    return resumePipeline(stuckJob as ContentJob)
  }

  // ── 2. Select a new topic ───────────────────────────────────────────────
  const topic = await selectNextTopic()
  if (!topic) {
    console.log('[ContentPipeline] No eligible topics available')
    return { jobId: '', finalStatus: 'NO_TOPICS' }
  }

  console.log(
    `[ContentPipeline] Selected topic: "${topic.angle}" (${topic.platform}, ${topic.duration}s)`
  )

  // ── 3. Create ContentJob ────────────────────────────────────────────────
  const job = await prisma.contentJob.create({
    data: {
      userId: systemUserId,
      product: topic.product,
      angle: topic.angle,
      platform: topic.platform,
      duration: topic.duration,
      status: 'PENDING',
    },
  })

  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!voiceId) {
    await prisma.contentJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: 'ELEVENLABS_VOICE_ID is not configured' },
    })
    return { jobId: job.id, finalStatus: 'FAILED' }
  }

  try {
    // ── 4. Generate script ──────────────────────────────────────────────
    const scriptData = await generateScript({
      product: topic.product,
      angle: topic.angle,
      platform: topic.platform,
      duration: topic.duration,
    })

    const hashtags = JSON.stringify(scriptData.hashtags)

    await prisma.contentJob.update({
      where: { id: job.id },
      data: {
        hook: scriptData.hook,
        agitation: scriptData.agitation,
        solution: scriptData.solution,
        cta: scriptData.cta,
        voiceoverText: scriptData.voiceoverText,
        caption: scriptData.caption,
        hashtags,
        status: 'SCRIPT_READY',
      },
    })

    console.log(`[ContentPipeline] Script generated for job ${job.id}`)

    // ── 5. Generate voice ─────────────────────────────────────────────
    const audioUrl = await generateVoice({
      text: scriptData.voiceoverText,
      voiceId,
      jobId: job.id,
    })

    await prisma.contentJob.update({
      where: { id: job.id },
      data: { audioUrl, status: 'VOICE_READY' },
    })

    console.log(`[ContentPipeline] Voice generated for job ${job.id}`)

    // ── 6. Submit video ───────────────────────────────────────────────
    const heygenRenderJobId = await submitVideo({
      audioUrl,
      voiceoverText: scriptData.voiceoverText,
    })

    await prisma.contentJob.update({
      where: { id: job.id },
      data: { heygenRenderJobId, status: 'VIDEO_RENDERING' },
    })

    console.log(`[ContentPipeline] Video submitted for job ${job.id} (HeyGen: ${heygenRenderJobId})`)

    // ── 7. Mark topic as used ─────────────────────────────────────────
    await prisma.contentTopic.update({
      where: { id: topic.id },
      data: {
        lastUsedAt: new Date(),
        useCount: { increment: 1 },
      },
    })

    return { jobId: job.id, finalStatus: 'VIDEO_RENDERING' }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown error in content pipeline'

    console.error(`[ContentPipeline] Error for job ${job.id}:`, err)

    await prisma.contentJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage },
    })

    return { jobId: job.id, finalStatus: 'FAILED' }
  }
}
