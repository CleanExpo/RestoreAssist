import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const TutorialInspections: React.FC = () => {
  const frame = useCurrentFrame();

  const introS = 0, introE = 150;
  const s0S = 170, s0E = 450;
  const s1S = 470, s1E = 750;
  const s2S = 770, s2E = 1050;
  const s3S = 1070, s3E = 1350;
  const outroS = 1370;

  const introOp = interpolate(frame, [introS, introS + 30, introE - 30, introE + 20], [0, 1, 1, 0]);
  const s0Op = interpolate(frame, [s0S - 20, s0S, s0E - 30, s0E + 10], [0, 1, 1, 0]);
  const s1Op = interpolate(frame, [s1S - 20, s1S, s1E - 30, s1E + 10], [0, 1, 1, 0]);
  const s2Op = interpolate(frame, [s2S - 20, s2S, s2E - 30, s2E + 10], [0, 1, 1, 0]);
  const s3Op = interpolate(frame, [s3S - 20, s3S, s3E - 30, s3E + 10], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [outroS, outroS + 30, outroS + 100, outroS + 130], [0, 1, 1, 1]);

  return (
    <AbsoluteFill>
      <Audio src={staticFile('narration/tutorial-inspections.mp3')} />
      <div style={{ position: 'absolute', inset: 0, opacity: introOp, zIndex: introOp > 0 ? 100 : 0 }}>
        <IntroSlide title="Inspections" subtitle="Tutorial" />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s0Op, zIndex: s0Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Create Inspection</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>Start from scratch</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>Job details</li>
              <li>Location</li>
              <li>Claim type</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s1Op, zIndex: s1Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Capture Evidence</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>Photos, notes, moisture</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>Photo upload</li>
              <li>Annotations</li>
              <li>Readings</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s2Op, zIndex: s2Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Sign Off</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>Client and technician</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>Digital signature</li>
              <li>Timestamp</li>
              <li>Chain of custody</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: s3Op, zIndex: s3Op > 0 ? 10 : 0 }}>
        <ScreenContainer>
          <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:40 }}>
            <h2 style={{ fontSize:42, fontWeight:700, color:'#FFFFFF', margin:0, textAlign:'center' }}>Submit</h2>
            <p style={{ fontSize:22, color:'#8A6B4E', margin:0, maxWidth:700, textAlign:'center' }}>Send to reports</p>
            <ul style={{ fontSize:18, color:'#FFFFFF', lineHeight:2, textAlign:'center', listStyle:'none', padding:0 }}>
              <li>Auto-report</li>
              <li>PDF export</li>
              <li>Client portal</li>
            </ul>
          </div>
        </ScreenContainer>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: outroOp, zIndex: outroOp > 0 ? 100 : 0 }}>
        <OutroSlide title="Complete" subtitle="Inspections tutorial finished" />
      </div>
    </AbsoluteFill>
  );
};

export default TutorialInspections;
