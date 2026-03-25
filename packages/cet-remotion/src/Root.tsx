import { Composition } from 'remotion'
import React from 'react'
import { DisclaimerFrame, type DisclaimerFrameProps } from './compositions/DisclaimerFrame'
import { StandardSlide, type StandardSlideProps } from './compositions/StandardSlide'

/**
 * Remotion Root — registers all CET compositions.
 *
 * Compositions:
 *   - DisclaimerFrame: standalone 3-second disclaimer slate
 *   - StandardSlide: full video composition (audio + title + branding)
 *
 * The video-composer.ts orchestrator uses 'StandardSlide' for all CET videos.
 * StandardSlide includes the disclaimer slate inline for the first 90 frames.
 *
 * To preview in Remotion Studio:
 *   cd packages/cet-remotion && npm run studio
 */

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Standalone disclaimer — 3 seconds */}
      <Composition
        id="DisclaimerFrame"
        component={DisclaimerFrame}
        durationInFrames={90}    // 3s at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ primaryColour: '#00F5FF' } satisfies DisclaimerFrameProps}
      />

      {/* Full CET video — duration set per-render via inputProps.durationInFrames */}
      <Composition
        id="StandardSlide"
        component={StandardSlide}
        durationInFrames={2700}  // 90s default — overridden per video by renderMediaOnLambda
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'Your Right to Choose Your Own Repairer',
          scriptText: '',
          audioUrl: 'https://example.com/placeholder.mp3',
          companyName: 'RestoreAssist',
          primaryColour: '#00F5FF',
          showDisclaimer: true,
        } satisfies StandardSlideProps}
      />
    </>
  )
}
