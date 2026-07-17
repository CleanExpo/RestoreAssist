import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

const TOTAL_FRAMES = 900;

export const WizardSignin: React.FC = () => {
  return (
    <AbsoluteFill style={{background: '#050505'}}>
      <Audio src={staticFile('narration/wizard-signin.mp3')} />
      <Sequence from={0} durationInFrames={90}>
        <IntroSlide title="Signing in to RestoreAssist" subtitle="Setup" />
      </Sequence>
      
      <Sequence from={0} durationInFrames={300}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 1
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Navigate
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Go to restoreassist.app and click Sign In.
          </div>
        </div>
      </Sequence>
      <Sequence from={300} durationInFrames={300}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 2
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Enter credentials
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Type your email and password — or use Google SSO.
          </div>
        </div>
      </Sequence>
      <Sequence from={600} durationInFrames={300}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 3
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Dashboard
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            You're now on your dashboard, ready to work.
          </div>
        </div>
      </Sequence>
      <Sequence from={TOTAL_FRAMES - 90} durationInFrames={90}>
        <OutroSlide />
      </Sequence>
    </AbsoluteFill>
  );
};
