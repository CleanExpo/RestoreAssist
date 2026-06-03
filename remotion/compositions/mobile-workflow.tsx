import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const MobileWorkflow = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0,s0+20,s1-20,s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s4, s4 + 10, s4 + 70, s4 + 100], [0,1,1,1]);

  const screens = [
    {icon:'📋', label:'Sync Jobs', desc:'Today\'s inspections auto-sync to your device'},
    {icon:'📸', label:'Capture', desc:'Photos, moisture readings, and notes — on site'},
    {icon:'📡', label:'Offline Mode', desc:'Work without signal — sync when connected'},
    {icon:'📄', label:'Submit', desc:'Send completed reports to the office instantly'},
  ];

  return (
    <AbsoluteFill style={{fontFamily:'Inter, sans-serif'}}>
      <div style={{position:'absolute', inset:0, opacity:introOpacity, zIndex:introOpacity>0?100:0}}><IntroSlide title={title} /></div>

      <div style={{position:'absolute', inset:0, opacity:interpolate(frame, [s1-10,s1,s4,s4+20], [0,1,1,0]), zIndex:10}}>
        <AbsoluteFill style={{backgroundColor:'#1C2E47', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60}}>
          <h2 style={{fontSize:36, fontWeight:700, color:'#ffffff', marginBottom:48}}>Field Workflow</h2>
          <div style={{display:'flex', gap:32}}>
            {screens.map((screen,i) => (
              <div key={screen.label} style={{
                width:220, padding:32, borderRadius:20, backgroundColor:'#1C2E47', border:'2px solid #1C2E47',
                textAlign:'center',
                opacity:interpolate(frame-s1-i*20,[0,20],[0,1],{extrapolateLeft:'clamp'})
              }}>
                <div style={{fontSize:48, marginBottom:16}}>{screen.icon}</div>
                <h3 style={{fontSize:18, fontWeight:700, color:'#ffffff', marginBottom:8}}>{screen.label}</h3>
                <p style={{fontSize:14, color:'#D4A574', lineHeight:1.5}}>{screen.desc}</p>
              </div>
            ))}
          </div>
          <div style={{marginTop:48, padding:'16px 32px', borderRadius:12, backgroundColor:'#8A6B4E', color:'#fff', fontSize:16, fontWeight:700}}>
            Available on iOS & Android
          </div>
        </AbsoluteFill>
      </div>

      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}>
        <OutroSlide title="The field crew. Connected." subtitle="RestoreAssist Mobile" />
      </div>
    </AbsoluteFill>
  );
};
