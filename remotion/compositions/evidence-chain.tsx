import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const EvidenceChain = () => {
  const frame = useCurrentFrame();
  const i = interpolate(frame, [0, 30, 270, 300], [0, 1, 1, 0]);
  const m = interpolate(frame, [280, 310, 1020, 1050], [0, 1, 1, 0]);
  const o = interpolate(frame, [1030, 1080, 1280, 1320], [0, 1, 1, 1]);

  const steps = [
    {step:'01',title:'Capture',desc:'Take photos on-site. Each image is geo-tagged and timestamped automatically.',color:'#ef4444'},
    {step:'02',title:'Upload',desc:'Photos sync to the cloud instantly. No manual transfers. No lost files.',color:'#f59e0b'},
    {step:'03',title:'Link',desc:'Each photo is attached to the specific room, reading, and inspection stage.',color:'#3b82f6'},
    {step:'04',title:'Validate',desc:'Built-in checklists ensure every required photo and reading is present.',color:'#22c55e'},
    {step:'05',title:'Report',desc:'The complete chain is compiled into a court-ready PDF with full audit trail.',color:'#8A6B4E'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:i,zIndex:i>0?100:0}}>
        <IntroSlide title="Chain of Custody" subtitle="From capture to court — every step documented" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:m,zIndex:m>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Chain of Custody</div>
            <div style={{fontSize:15,color:'#D4A574',fontFamily:'Inter',marginTop:-12}}>How RestoreAssist protects your evidence</div>
            <div style={{display:'flex',flexDirection:'column',gap:12,flex:1,justifyContent:'center'}}>
              {steps.map(s => (
                <div key={s.step} style={{display:'flex',alignItems:'center',gap:20,padding:16,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{width:44,height:44,borderRadius:'50%',backgroundColor:s.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,color:'#FFF',flexShrink:0}}>{s.step}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:4}}>{s.title}</div>
                    <div style={{fontSize:12,color:'#8A6B4E',fontFamily:'Inter'}}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:o,zIndex:o>0?100:0}}>
        <OutroSlide title="Court-ready evidence." subtitle="Every photo, every reading, every time." />
      </div>
    </AbsoluteFill>
  );
};
