import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import React from 'react'

/**
 * DisclaimerFrame
 *
 * Mandatory first 3 seconds of every CET video.
 * White text on OLED black with a single accent bar.
 * Fades in over the first 15 frames (0.5s at 30fps).
 *
 * "This information is provided for educational purposes only.
 *  Please consult your insurance policy documents for your specific coverage details."
 */

export interface DisclaimerFrameProps {
  primaryColour: string
}

export const DisclaimerFrame: React.FC<DisclaimerFrameProps> = ({ primaryColour }) => {
  const frame = useCurrentFrame()

  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#050505',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      <div style={{ opacity, textAlign: 'center', maxWidth: 900 }}>
        {/* Accent bar */}
        <div
          style={{
            width: 60,
            height: 4,
            backgroundColor: primaryColour,
            margin: '0 auto 40px',
            borderRadius: 2,
          }}
        />

        {/* Line 1 — primary disclaimer */}
        <p
          style={{
            color: '#ffffff',
            fontSize: 32,
            lineHeight: 1.5,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontWeight: 300,
            margin: 0,
            letterSpacing: 0.3,
          }}
        >
          This information is provided for educational purposes only.
        </p>

        {/* Line 2 — secondary disclaimer */}
        <p
          style={{
            color: '#8a8a8a',
            fontSize: 24,
            lineHeight: 1.5,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontWeight: 300,
            marginTop: 20,
            letterSpacing: 0.2,
          }}
        >
          Please consult your insurance policy documents for your specific coverage details.
        </p>
      </div>
    </AbsoluteFill>
  )
}
