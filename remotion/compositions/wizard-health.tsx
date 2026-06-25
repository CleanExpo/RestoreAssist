import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

const TOTAL_FRAMES = 1800;

export const WizardHealth: React.FC = () => {
  return (
    <AbsoluteFill style={{background: '#050505'}}>
      <Audio src={staticFile('narration/wizard-health.mp3')} />
      <Sequence from={0} durationInFrames={90}>
        <IntroSlide title="Workspace Health check" subtitle="Setup" />
      </Sequence>
      
      <Sequence from={0} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 1
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Open
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Navigate to Settings → Workspace Health.
          </div>
        </div>
      </Sequence>
      <Sequence from={450} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 2
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Status
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Green means ready. Yellow means attention needed. Red means blocked.
          </div>
        </div>
      </Sequence>
      <Sequence from={900} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 3
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Fix
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Click any red item for step-by-step resolution.
          </div>
        </div>
      </Sequence>
      <Sequence from={1350} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 4
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Verify
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Re-run the check to confirm all systems are green.
          </div>
        </div>
      </Sequence>
      <Sequence from={TOTAL_FRAMES - 90} durationInFrames={90}>
        <OutroSlide />
      </Sequence>
    </AbsoluteFill>
  );
};
