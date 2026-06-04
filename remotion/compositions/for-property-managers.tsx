import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const ForPropertyManagers = () => {
  const frame = useCurrentFrame();
  const i = interpolate(frame, [0, 30, 270, 300], [0, 1, 1, 0]);
  const m = interpolate(frame, [280, 310, 1020, 1050], [0, 1, 1, 0]);
  const o = interpolate(frame, [1030, 1080, 1280, 1320], [0, 1, 1, 1]);

  const points = [
    {icon:'📱',title:'Client portal access',desc:'Tenants and owners get secure read-only access to all reports and updates.'},
    {icon:'📧',title:'Automated updates',desc:'Progress notifications sent automatically. No chasing technicians for status.'},
    {icon:'📆',title:'Better scheduling',desc:'View technician availability, book jobs, and get completion confirmations.'},
    {icon:'📑',title:'Insurance-ready docs',desc:'Every report includes IICRC standards, dry goals, and completion certificates.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:i,zIndex:i>0?100:0}}>
        <IntroSlide title="Built for Property Managers" subtitle="Delight tenants. Inform owners. Close claims faster." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:m,zIndex:m>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:24}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Built for Property Managers</div>
            <div style={{fontSize:15,color:'#D4A574',fontFamily:'Inter',marginTop:-16}}>Keep everyone informed without the back and forth</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,flex:1}}>
              {points.map(p => (
                <div key={p.title} style={{padding:24,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:28,marginBottom:10}}>{p.icon}</div>
                  <div style={{fontSize:15,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{p.title}</div>
                  <div style={{fontSize:12,color:'#8A6B4E',fontFamily:'Inter',lineHeight:1.5}}>{p.desc}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:20,justifyContent:'center'}}>
              {['Portals per property','Auto-status notifications','Report history','Completion certificates'].map(s => (
                <div key={s} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#D4A574',fontFamily:'Inter'}}>
                  <span style={{color:'#22c55e'}}>✓</span>{s}
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:o,zIndex:o>0?100:0}}>
        <OutroSlide title="Everyone stays informed." subtitle="Property management without the admin burden." />
      </div>
    </AbsoluteFill>
  );
};
