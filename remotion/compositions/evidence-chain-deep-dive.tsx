import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const EvidenceChainDeepDive = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 600, 630], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [610, 640, 1890, 1920], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1900, 1950, 2270, 2320], [0, 1, 1, 1]);

  const steps = [
    {num:'01',title:'Capture',desc:'Every photo, reading, and note is instantly watermarked with GPS coordinates, timestamp, and device ID — the moment you tap save.'},
    {num:'02',title:'Encrypt',desc:'AES-256 encryption at rest and in transit. No plain text data leaves the device. Even if intercepted, it is unreadable.'},
    {num:'03',title:'Hash & Sign',desc:'SHA-256 cryptographic hash generated for each file. Tamper detection triggers immediate audit alert.'},
    {num:'04',title:'Audit Trail',desc:'Immutable blockchain-style log of who accessed what, when, and from where. Cannot be deleted or edited.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Chain of Custody — Deep Dive" subtitle="How RestoreAssist creates court-admissible evidence" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:24}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>The 4-Step Custody Chain</div>
            <div style={{fontSize:15,color:'#D4A574',fontFamily:'Inter',marginTop:-16}}>Every piece of evidence follows this exact protocol</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,flex:1}}>
              {steps.map(s => (
                <div key={s.num} style={{padding:28,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:36,fontWeight:800,color:'#8A6B4E',marginBottom:10}}>{s.num}</div>
                  <div style={{fontSize:18,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:8}}>{s.title}</div>
                  <div style={{fontSize:13,color:'#D4A574',fontFamily:'Inter',lineHeight:1.5}}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',fontSize:13,color:'#D4A574',fontFamily:'Inter'}}>
              All hashes stored on distributed ledger. Audit log available for 7 years.
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Evidence that stands up in court." subtitle="Built for Australian legal standards." />
      </div>
    </AbsoluteFill>
  );
};
