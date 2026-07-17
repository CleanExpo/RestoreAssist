import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

const TOTAL_FRAMES = 2700;

export const WizardIntegrations: React.FC = () => {
  return (
    <AbsoluteFill style={{background: '#050505'}}>
      <Audio src={staticFile('narration/wizard-integrations.mp3')} />
      <Sequence from={0} durationInFrames={90}>
        <IntroSlide title="Connecting your tools" subtitle="Setup" />
      </Sequence>
      
      <Sequence from={0} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 1
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Choose
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Go to Settings → Integrations and pick your platform.
          </div>
        </div>
      </Sequence>
      <Sequence from={450} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 2
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Xero
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Connect Xero for automatic invoice sync.
          </div>
        </div>
      </Sequence>
      <Sequence from={900} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 3
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            MYOB
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Link MYOB for streamlined bookkeeping.
          </div>
        </div>
      </Sequence>
      <Sequence from={1350} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 4
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            QuickBooks
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Integrate QuickBooks for real-time financial data.
          </div>
        </div>
      </Sequence>
      <Sequence from={1800} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 5
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            ServiceM8
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Sync ServiceM8 for job scheduling.
          </div>
        </div>
      </Sequence>
      <Sequence from={2250} durationInFrames={450}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 6
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Ascora
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Connect Ascora for field service management.
          </div>
        </div>
      </Sequence>
      <Sequence from={TOTAL_FRAMES - 90} durationInFrames={90}>
        <OutroSlide />
      </Sequence>
    </AbsoluteFill>
  );
};
