import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

const TOTAL_FRAMES = 1800;

export const WizardSignup: React.FC = () => {
  return (
    <AbsoluteFill style={{background: '#050505'}}>
      <Audio src={staticFile('narration/wizard-signup.mp3')} />
      <Sequence from={0} durationInFrames={90}>
        <IntroSlide title="Creating your RestoreAssist account" subtitle="Setup" />
      </Sequence>
      
      <Sequence from={0} durationInFrames={360}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 1
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Start
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Click Get Started on the homepage.
          </div>
        </div>
      </Sequence>
      <Sequence from={360} durationInFrames={360}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 2
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Details
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Enter your name, email, and create a secure password.
          </div>
        </div>
      </Sequence>
      <Sequence from={720} durationInFrames={360}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 3
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Verify
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Check your inbox for a verification link.
          </div>
        </div>
      </Sequence>
      <Sequence from={1080} durationInFrames={360}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 4
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Company
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Add your company name and ABN.
          </div>
        </div>
      </Sequence>
      <Sequence from={1440} durationInFrames={360}>
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, background: '#1C2E47'}}>
          <div style={{fontSize: 28, fontWeight: 700, color: '#8A6B4E', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2}}>
            Step 5
          </div>
          <div style={{fontSize: 48, fontWeight: 700, color: '#FFFFFF', marginBottom: 24, textAlign: 'center'}}>
            Launch
          </div>
          <div style={{fontSize: 28, color: '#C4C8CA', textAlign: 'center', maxWidth: 900, lineHeight: 1.5}}>
            Click Activate — your account is live.
          </div>
        </div>
      </Sequence>
      <Sequence from={TOTAL_FRAMES - 90} durationInFrames={90}>
        <OutroSlide />
      </Sequence>
    </AbsoluteFill>
  );
};
