import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const ForContractors = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 270, 300], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [280, 310, 1020, 1050], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1030, 1080, 1280, 1320], [0, 1, 1, 1]);

  const painPoints = [
    {icon:'📝',title:'Paperwork chaos',desc:'Job dockets, photos, and reports scattered across notebooks'},
    {icon:'⏱️',title:'Hours of admin',desc:'2-3 hours per job sat at a computer after a long day'},
    {icon:'⚖️',title:'Compliance risk',desc:'Missing IICRC citations or failed chain of custody'},
    {icon:'💰',title:'Cash flow gaps',desc:'Invoices delayed because reports sit unfinished'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Built for Restoration Contractors" subtitle="You do the work. We handle the paperwork." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:24}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Built for Contractors</div>
            <div style={{fontSize:15,color:'#D4A574',fontFamily:'Inter',marginTop:-16}}>The daily headaches RestoreAssist eliminates</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,flex:1}}>
              {painPoints.map(p => (
                <div key={p.title} style={{padding:24,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:28,marginBottom:10}}>{p.icon}</div>
                  <div style={{fontSize:15,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{p.title}</div>
                  <div style={{fontSize:12,color:'#8A6B4E',fontFamily:'Inter',lineHeight:1.5}}>{p.desc}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:20,justifyContent:'center'}}>
              {['Evidence capture on-site','Auto-generated S500 reports','Instant PDF invoices','Calendar + job sync'].map(s => (
                <div key={s} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#D4A574',fontFamily:'Inter'}}>
                  <span style={{color:'#22c55e'}}>✓</span>{s}
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Less admin. More jobs." subtitle="Join restoration contractors across Australia." />
      </div>
    </AbsoluteFill>
  );
};
