import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const MoistureMapping = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0,s0+20,s1-20,s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s4, s4 + 10, s4 + 70, s4 + 100], [0,1,1,1]);
  const mainOpacity = interpolate(frame, [s1-10,s1], [0,1]);

  const readings = [
    {location:'Kitchen Floor', reading:'85%', target:'<16%', status:'elevated'},
    {location:'Kitchen Skirting', reading:'62%', target:'<16%', status:'elevated'},
    {location:'Dining Wall', reading:'45%', target:'<16%', status:'elevated'},
    {location:'Dining Floor', reading:'18%', target:'<16%', status:'borderline'},
    {location:'Hallway', reading:'12%', target:'<16%', status:'dry'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute', inset:0, opacity:introOpacity, zIndex:introOpacity>0?100:0}}><IntroSlide title={title} /></div>
      <div style={{position:'absolute', inset:0, opacity:mainOpacity, zIndex:10}}>
        <ScreenContainer>
          <div style={{padding:40, width:'100%', height:'100%', backgroundColor:'#0A0A0A', display:'flex', gap:24}}>
            {/* Floor plan */}
            <div style={{
              width:500, height:600, backgroundColor:'#ffffff', borderRadius:16, border:'1px solid #2A3A55', padding:24,
              position:'relative'
            }}>
              <h3 style={{fontSize:15, fontWeight:700, color:'#1C2E47', marginBottom:16, fontFamily:'Inter'}}>Moisture Map — Property Plan</h3>
              {/* Room shapes */}
              <div style={{position:'absolute', left:40, top:80, width:200, height:180, border:'2px solid #2A3A55', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <span style={{fontSize:14, color:'#D4A574', fontFamily:'Inter'}}>Kitchen</span>
                <div style={{position:'absolute', top:20, right:20, width:24, height:24, borderRadius:'50%', backgroundColor:'#8A6B4E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#fff', fontWeight:700}}>85</div>
              </div>
              <div style={{position:'absolute', left:260, top:80, width:180, height:180, border:'2px solid #2A3A55', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <span style={{fontSize:14, color:'#D4A574', fontFamily:'Inter'}}>Dining</span>
                <div style={{position:'absolute', top:30, left:30, width:24, height:24, borderRadius:'50%', backgroundColor:'#f59e0b', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#fff', fontWeight:700}}>45</div>
              </div>
              <div style={{position:'absolute', left:40, top:280, width:400, height:100, border:'2px solid #2A3A55', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <span style={{fontSize:14, color:'#D4A574', fontFamily:'Inter'}}>Hallway</span>
                <div style={{position:'absolute', top:30, right:100, width:24, height:24, borderRadius:'50%', backgroundColor:'#059669', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#fff', fontWeight:700}}>12</div>
              </div>
              <div style={{position:'absolute', bottom:20, left:24, display:'flex', gap:16}}>
                {[{c:'#8A6B4E',l:'Elevated >50%'},{c:'#f59e0b',l:'Borderline 16-50%'},{c:'#059669',l:'Dry <16%'}].map(item => (
                  <div key={item.l} style={{display:'flex', alignItems:'center', gap:6}}>
                    <div style={{width:12, height:12, borderRadius:'50%', backgroundColor:item.c}}></div>
                    <span style={{fontSize:12, color:'#8A6B4E'}}>{item.l}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Readings list */}
            <div style={{flex:1, backgroundColor:'#ffffff', borderRadius:16, border:'1px solid #2A3A55', padding:24}}>
              <h3 style={{fontSize:15, fontWeight:700, color:'#1C2E47', marginBottom:16, fontFamily:'Inter'}}>Moisture Readings</h3>
              {readings.map((r,i) => (
                <div key={r.location} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0',
                  borderBottom:'1px solid #f1f5f9',
                  opacity:interpolate(frame-s1-i*15,[0,20],[0,1],{extrapolateLeft:'clamp'})
                }}>
                  <div>
                    <div style={{fontSize:14, fontWeight:600, color:'#1C2E47'}}>{r.location}</div>
                    <div style={{fontSize:12, color:'#D4A574', marginTop:2}}>Target: {r.target}</div>
                  </div>
                  <div style={{
                    padding:'6px 16px', borderRadius:20,
                    backgroundColor: r.status==='elevated'? '#fef2f2' : r.status==='dry'? '#f0fdf4' : '#fef3c7',
                    color: r.status==='elevated'? '#8A6B4E' : r.status==='dry'? '#059669' : '#d97706',
                    fontSize:14, fontWeight:700
                  }}>{r.reading}</div>
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s1&&frame<s2?1:0, pointerEvents:'none'}}>
        <Annotation text="Visualise moisture data on a floor plan — see the full picture instantly." x={650} y={200} startFrame={s1+20} endFrame={s1+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s2&&frame<s3?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={900} startY={400} endX={700} endY={250} startFrame={s2+15} endFrame={s2+45} clickFrame={s2+43} />
        <HighlightBox x={600} y={220} width={100} height={44} startFrame={s2+40} endFrame={s2+70} />
        <Annotation text="Colour-coded zones show dry, borderline, and elevated moisture at a glance." x={500} y={190} startFrame={s2+35} endFrame={s2+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s3&&frame<s4?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={700} startY={250} endX={1050} endY={300} startFrame={s3+15} endFrame={s3+45} />
        <Annotation text="Track every reading with timestamp and technician for compliance." x={750} y={270} startFrame={s3+35} endFrame={s3+130} />
      </div>
      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}><OutroSlide title="Data-driven drying decisions." subtitle="RestoreAssist Moisture Mapping" /></div>
    </AbsoluteFill>
  );
};
