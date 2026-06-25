import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const TutorialSetupWizard: React.FC = () => {
  const frame = useCurrentFrame();

  const introS = 0, introE = 150;
  const s0S = 170, s0E = 450;
  const s1S = 470, s1E = 750;
  const s2S = 770, s2E = 1050;
  const s3S = 1070, s3E = 1350;
  const s4S = 1370, s4E = 1650;
  const outroS = 1670;

  const introOp = interpolate(frame, [introS, introS + 30, introE - 30, introE + 20], [0, 1, 1, 0]);
  const s0Op = interpolate(frame, [s0S - 20, s0S, s0E - 30, s0E + 10], [0, 1, 1, 0]);
  const s1Op = interpolate(frame, [s1S - 20, s1S, s1E - 30, s1E + 10], [0, 1, 1, 0]);
  const s2Op = interpolate(frame, [s2S - 20, s2S, s2E - 30, s2E + 10], [0, 1, 1, 0]);
  const s3Op = interpolate(frame, [s3S - 20, s3S, s3E - 30, s3E + 10], [0, 1, 1, 0]);
  const s4Op = interpolate(frame, [s4S - 20, s4S, s4E - 30, s4E + 10], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [outroS, outroS + 30, outroS + 100, outroS + 130], [0, 1, 1, 1]);

  return (
    <AbsoluteFill>
      <Audio src={staticFile('narration/tutorial-setup-wizard.mp3')} />
      <div style={{ position: 'absolute', inset: 0, opacity: introOp, zIndex: introOp > 0 ? 100 : 0 }}>
        <IntroSlide title="The Setup Wizard" subtitle="Tutorial" />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s0Op, zIndex: s0Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Step 1: Business Profile</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>Confirm details and add your logo</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>Business name</li>
              <li>ABN</li>
              <li>Logo upload</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s1Op, zIndex: s1Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Step 2: AI Hydration</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>Industry defaults auto-loaded</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>S500 defaults</li>
              <li>WHS checklists</li>
              <li>Report templates</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s2Op, zIndex: s2Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Step 3: Integrations</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>Connect your tools</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>Xero</li>
              <li>MYOB</li>
              <li>QuickBooks</li>
              <li>ServiceM8</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s3Op, zIndex: s3Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Step 4: Health Check</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>Verify all capabilities</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>12+ checks</li>
              <li>All green</li>
              <li>Ready to go</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s4Op, zIndex: s4Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Step 5: Activate</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>One tap to go live</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>Activation</li>
              <li>Instant</li>
              <li>Dashboard ready</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: outroOp, zIndex: outroOp > 0 ? 100 : 0 }}>
        <OutroSlide title="Complete" subtitle="The Setup Wizard tutorial finished" />
      </div>
    </AbsoluteFill>
  );
};

export default TutorialSetupWizard;
