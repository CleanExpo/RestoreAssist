/**
 * Video Composer Orchestrator
 *
 * High-level pipeline:
 *   Video (DB, DRAFT) → resolve script variables → ElevenLabs TTS → Remotion Lambda → DB (READY)
 *
 * Called by POST /api/videos/[id]/render — fire-and-forget, non-blocking.
 *
 * Error handling:
 *   - Any failure → Video.status = FAILED (can be retried via another POST to /render)
 *   - ElevenLabs errors → logged, thrown (user sees "render failed" in dashboard)
 *   - Remotion errors → same
 */

import { prisma } from '@/lib/prisma'
import { generateNarration, type VoiceGender } from './elevenlabs-tts'
import { renderVideo } from './remotion-renderer'

// ── Variable resolution ───────────────────────────────────────────────────────

function resolveVariables(
  scriptText: string,
  companyName: string,
  technicianName = 'your technician'
): string {
  return scriptText
    .replace(/\{\{companyName\}\}/g, companyName)
    .replace(/\{\{technicianName\}\}/g, technicianName)
}

// ── Main composer ─────────────────────────────────────────────────────────────

/**
 * Compose a CET video end-to-end.
 *
 * @param videoId    - Video.id from the database (must be in DRAFT or FAILED status)
 * @param voiceGender - Optional voice override; defaults to 'female' (Charlotte)
 */
export async function composeVideo(
  videoId: string,
  voiceGender: VoiceGender = 'female'
): Promise<void> {
  // Load video + library branding in one query
  const video = await prisma.video.findUniqueOrThrow({
    where: { id: videoId },
    include: {
      library: {
        select: {
          companyName: true,
          brandingMode: true,
          logoUrl: true,
          primaryColour: true,
        },
      },
    },
  })

  // Mark as rendering — prevents duplicate concurrent renders
  await prisma.video.update({
    where: { id: videoId },
    data: { status: 'RENDERING' },
  })

  try {
    // 1. Resolve variable slots in the script
    const resolvedScript = resolveVariables(
      video.scriptText,
      video.library.companyName
    )

    // 2. Generate TTS narration via ElevenLabs (Australian voice)
    const { audioUrl, durationSeconds } = await generateNarration(
      resolvedScript,
      voiceGender
    )

    // 3. Determine branding
    const primaryColour = video.library.primaryColour ?? '#00F5FF'  // RestoreAssist cyan
    const logoUrl =
      video.library.brandingMode === 'CUSTOM'
        ? (video.library.logoUrl ?? undefined)
        : undefined  // DEFAULT_RA: no custom logo, Remotion uses RA default branding

    // 4. Render video via Remotion Lambda
    //    durationInFrames = durationSeconds × 30fps
    const { videoUrl, thumbnailUrl } = await renderVideo({
      compositionId: 'StandardSlide',
      inputProps: {
        title: video.title,
        scriptText: resolvedScript,
        audioUrl,
        companyName: video.library.companyName,
        logoUrl,
        primaryColour,
      },
      durationInFrames: durationSeconds * 30,
    })

    // 5. Persist final URLs and set status to READY
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'READY',
        audioUrl,
        videoUrl,
        thumbnailUrl,
        durationSeconds,
      },
    })
  } catch (err) {
    // On any failure, mark as FAILED so the dashboard shows a retry button
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'FAILED' },
    })
    // Re-throw so the caller can log the error
    throw err
  }
}
