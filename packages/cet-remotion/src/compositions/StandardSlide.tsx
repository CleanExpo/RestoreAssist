import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import React from 'react'

/**
 * StandardSlide
 *
 * The main CET video composition.
 * Structure:
 *   - OLED #050505 background
 *   - Animated top-left accent bar (slides in over 2 seconds)
 *   - Company logo or name (top right)
 *   - Title card (bottom third, fades in after 1.5s)
 *   - Full audio track from ElevenLabs TTS
 *
 * Duration is set per-video (durationInFrames = durationSeconds × 30fps).
 * The first 90 frames (3s) are the DisclaimerFrame — rendered separately and
 * concatenated by the composer, or rendered inline via the opening slate.
 *
 * Note: for simplicity in v1, the disclaimer is rendered as static text at
 * the top of this composition for the first 90 frames, then transitions to
 * the main slide. This avoids needing Remotion's `<Series>` composition for
 * a single Lambda function call.
 */

export interface StandardSlideProps {
  title: string
  scriptText: string
  audioUrl: string
  companyName: string
  logoUrl?: string
  primaryColour: string
  /** Whether to show the disclaimer slate at the start (default: true) */
  showDisclaimer?: boolean
}

const DISCLAIMER_FRAMES = 90  // 3s at 30fps

export const StandardSlide: React.FC<StandardSlideProps> = ({
  title,
  audioUrl,
  companyName,
  logoUrl,
  primaryColour,
  showDisclaimer = true,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Is this still in the disclaimer phase?
  const inDisclaimer = showDisclaimer && frame < DISCLAIMER_FRAMES
  const contentFrame = Math.max(0, frame - (showDisclaimer ? DISCLAIMER_FRAMES : 0))

  // Animations for the main slide
  const barProgress = spring({ frame: contentFrame, fps, config: { damping: 100, stiffness: 200 }, from: 0, to: 1 })
  const titleOpacity = interpolate(contentFrame, [30, 75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const titleY = interpolate(contentFrame, [30, 75], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Disclaimer fade
  const disclaimerOpacity = inDisclaimer
    ? interpolate(frame, [0, 20, DISCLAIMER_FRAMES - 15, DISCLAIMER_FRAMES], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0

  return (
    <AbsoluteFill style={{ backgroundColor: '#050505', overflow: 'hidden' }}>
      {/* Audio track — plays throughout the full video */}
      <Audio src={audioUrl} />

      {/* ── Disclaimer slate ── */}
      {showDisclaimer && (
        <AbsoluteFill
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 80,
            opacity: disclaimerOpacity,
            zIndex: inDisclaimer ? 10 : 0,
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 900 }}>
            <div style={{ width: 60, height: 4, backgroundColor: primaryColour, margin: '0 auto 40px', borderRadius: 2 }} />
            <p style={{ color: '#ffffff', fontSize: 32, lineHeight: 1.5, fontFamily: 'sans-serif', fontWeight: 300, margin: 0 }}>
              This information is provided for educational purposes only.
            </p>
            <p style={{ color: '#8a8a8a', fontSize: 24, lineHeight: 1.5, fontFamily: 'sans-serif', fontWeight: 300, marginTop: 20 }}>
              Please consult your insurance policy documents for your specific coverage details.
            </p>
          </div>
        </AbsoluteFill>
      )}

      {/* ── Main slide (visible after disclaimer) ── */}
      {!inDisclaimer && (
        <>
          {/* Animated accent bar — top left, slides across */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: 5,
              width: `${barProgress * 100}%`,
              backgroundColor: primaryColour,
            }}
          />

          {/* Company logo or name — top right */}
          <div style={{ position: 'absolute', top: 50, right: 70 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName}
                style={{ height: 70, maxWidth: 250, objectFit: 'contain' }}
              />
            ) : (
              <span
                style={{
                  color: primaryColour,
                  fontSize: 26,
                  fontWeight: 700,
                  fontFamily: 'sans-serif',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                {companyName}
              </span>
            )}
          </div>

          {/* Title card — bottom left, fades and slides up */}
          <div
            style={{
              position: 'absolute',
              bottom: 130,
              left: 70,
              right: 70,
              opacity: titleOpacity,
              transform: `translateY(${titleY}px)`,
            }}
          >
            {/* Short accent line above title */}
            <div
              style={{
                width: 56,
                height: 4,
                backgroundColor: primaryColour,
                marginBottom: 28,
                borderRadius: 2,
              }}
            />

            <h1
              style={{
                color: '#ffffff',
                fontSize: 58,
                fontWeight: 300,
                lineHeight: 1.2,
                fontFamily: 'sans-serif',
                margin: 0,
                letterSpacing: -0.5,
              }}
            >
              {title}
            </h1>

            <p
              style={{
                color: '#555555',
                fontSize: 22,
                fontFamily: 'sans-serif',
                fontWeight: 400,
                marginTop: 18,
              }}
            >
              {companyName}
            </p>
          </div>

          {/* Subtle bottom gradient */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 200,
              background: 'linear-gradient(to top, #050505 0%, transparent 100%)',
            }}
          />
        </>
      )}
    </AbsoluteFill>
  )
}
