import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const PhotoAnnotationDeepDive = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 600, 630], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [610, 640, 1890, 1920], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1900, 1950, 2270, 2320], [0, 1, 1, 1]);

  const tools = [
    {icon:'🎯',title:'Precision Arrows',desc:'Pin-point exact damage location with arrow annotations that scale with zoom level. Never lose context.'},
    {icon:'📏',title:'Measurement Lines',desc:'Draw calibrated measurement lines directly on the photo. Auto-calculates square metres and cubic volume.'},
    {icon:'🔍',title:'Zoom & Pan',desc:'Pinch-to-zoom up to 8x on mobile. Double-tap to fit-to-screen. Swipe between photos in sequence.'},
    {icon:'🏷️',title:'Smart Tags',desc:'AI auto-suggests tags based on visual content. "Water damage", "Mould growth", "Structural crack" detected automatically.'},
  ];

  const workflows = [
    {title:'Before / After',desc:'Link two photos as a pair. Client sees damage and remediation side by side.'},
    {title:'360° Panorama',desc:'Stitch room-wide shots. Scroll through entire room without losing bearing.'},
    {title:'Thermal Overlay',desc:'Upload FLIR thermal images. Overlay temperature readings on standard photos.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Photo Annotation Toolkit" subtitle="Every pixel tells a story — make it clear." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:20}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Annotation Tools</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {tools.map(t => (
                <div key={t.title} style={{padding:20,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.25)'}}>
                  <div style={{fontSize:24,marginBottom:8}}>{t.icon}</div>
                  <div style={{fontSize:15,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:4}}>{t.title}</div>
                  <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter',lineHeight:1.4}}>{t.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:4}}>Advanced Workflows</div>
            <div style={{display:'flex',gap:12}}>
              {workflows.map(w => (
                <div key={w.title} style={{flex:1,padding:18,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid #8A6B4E'}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:4}}>{w.title}</div>
                  <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter'}}>{w.desc}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',fontSize:12,color:'#D4A574',fontFamily:'Inter',marginTop:'auto'}}>
              All annotations embed in PDF with vector quality. Zoom to 400% without pixelation.
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Show, don't just tell." subtitle="Annotations that insurance adjusters actually understand." />
      </div>
    </AbsoluteFill>
  );
};
