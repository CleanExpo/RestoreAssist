import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const MobileDeepDive = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 600, 630], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [610, 640, 1890, 1920], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1900, 1950, 2270, 2320], [0, 1, 1, 1]);

  const features = [
    {icon:'📸',title:'Camera',desc:'Native camera with auto-flash, grid overlay, and depth map. Burst mode for sequence capture. Immediate preview and annotate.'},
    {icon:'📡',title:'GPS',desc:'Sub-5 metre accuracy via GLONASS + Galileo. Works offline with cached basemaps. Geotag every photo automatically.'},
    {icon:'🔗',title:'Bluetooth',desc:'Pair Protimeter, Delmhorst, or Tramex meters. Automatic reading sync. No manual transcription errors.'},
    {icon:'📶',title:'Offline Mode',desc:'Full functionality without signal. Photos, readings, and notes cached locally. Auto-sync when connection restored.'},
  ];

  const comparisons = [
    {label:'Photo size',phone:'8 MB raw',desktop:'8 MB raw',note:'Identical quality'},
    {label:'GPS accuracy',phone:'3.2 m',desktop:'N/A',note:'Phone has built-in GNSS'},
    {label:'Meter sync',phone:'Bluetooth LE',desktop:'USB/Serial',note:'Wireless vs wired'},
    {label:'Offline use',phone:'Full',desktop:'None',note:'Critical for rural sites'},
    {label:'Daily report',phone:'Instant',desktop:'End of day',note:'Hours saved per job'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Mobile Workflow — Deep Dive" subtitle="Your entire office, in your pocket." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:18}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Mobile Capabilities</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {features.map(f => (
                <div key={f.title} style={{padding:22,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:26,marginBottom:8}}>{f.icon}</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{f.title}</div>
                  <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter',lineHeight:1.5}}>{f.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:4}}>Phone vs Desktop</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {comparisons.map(c => (
                <div key={c.label} style={{display:'flex',alignItems:'center',gap:16,padding:'8px 16px',backgroundColor:'#1C2E47',borderRadius:6}}>
                  <span style={{width:140,fontSize:13,fontWeight:700,color:'#FFF',fontFamily:'Inter'}}>{c.label}</span>
                  <span style={{width:120,fontSize:12,color:'#8A6B4E',fontFamily:'monospace'}}>{c.phone}</span>
                  <span style={{width:120,fontSize:12,color:'#D4A574',fontFamily:'monospace'}}>{c.desktop}</span>
                  <span style={{fontSize:11,color:'#D4A574',fontFamily:'Inter',marginLeft:'auto'}}>{c.note}</span>
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Work from anywhere." subtitle="The job site is your office." />
      </div>
    </AbsoluteFill>
  );
};
