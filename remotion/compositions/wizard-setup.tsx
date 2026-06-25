import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

const TOTAL_FRAMES = 3600;

export const WizardSetup: React.FC = () => {
  return (
    <AbsoluteFill style={{background: '#050505'}}>
      <Audio src={staticFile('narration/wizard-setup.mp3')} />
      <Sequence from={0} durationInFrames={90}>
        <IntroSlide title="The Setup Wizard — end to end" subtitle="Setup" />
      </Sequence>
      
      <Sequence from={0} durationInFrames={600}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 1
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            ABN
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Enter your ABN — we auto-hydrate your company details.
          </div>
        </div>
      </Sequence>
      <Sequence from={600} durationInFrames={600}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 2
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Branding
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Upload your logo and set your brand colours.
          </div>
        </div>
      </Sequence>
      <Sequence from={1200} durationInFrames={600}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 3
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Pricing
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Choose your pricing tier — Standard, Premium, or Enterprise.
          </div>
        </div>
      </Sequence>
      <Sequence from={1800} durationInFrames={600}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 4
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Integrations
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Connect Xero, MYOB, QuickBooks, ServiceM8, or Ascora.
          </div>
        </div>
      </Sequence>
      <Sequence from={2400} durationInFrames={600}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 5
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Health check
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Run Workspace Health to verify everything is green.
          </div>
        </div>
      </Sequence>
      <Sequence from={3000} durationInFrames={600}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 6
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Activate
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Click Activate — you're ready to start inspections.
          </div>
        </div>
      </Sequence>
      <Sequence from={TOTAL_FRAMES - 90} durationInFrames={90}>
        <OutroSlide />
      </Sequence>
    </AbsoluteFill>
  );
};
