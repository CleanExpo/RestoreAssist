// @ts-nocheck
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const EvidenceCapture = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0,s0+20,s1-20,s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s4,s4+15,s5-15,s5], [0,1,1,1]);
  const mainOpacity = interpolate(frame, [s1-10,s1], [0,1]);

  const photos = [
    {name:'IMG_2047.jpg', size:'4.2 MB', tag:'Pre-Loss', room:'Kitchen'},
    {name:'IMG_2048.jpg', size:'3.8 MB', tag:'Moisture', room:'Kitchen'},
    {name:'IMG_2049.jpg', size:'5.1 MB', tag:'Damage', room:'Dining'},
    {name:'IMG_2050.jpg', size:'2.9 MB', tag:'Equipment', room:'Kitchen'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute', inset:0, opacity:introOpacity, zIndex:introOpacity>0?100:0}}><IntroSlide title={title} /></div>
      <div style={{position:'absolute', inset:0, opacity:mainOpacity, zIndex:10}}>
        <ScreenContainer>
          <div style={{padding:40, backgroundColor:'#f8fafc', width:'100%', height:'100%'}}>
            {/* Mobile phone frame */}
            <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100%'}}>
              <div style={{
                width:380, height:760, borderRadius:48, backgroundColor:'#1e293b', padding:16,
                boxShadow:'0 25px 80px rgba(0,0,0,0.3)', display:'flex', flexDirection:'column'
              }}>
                <div style={{height:24, display:'flex', justifyContent:'center', alignItems:'center', marginBottom:8}}>
                  <div style={{width:120, height:24, borderRadius:12, backgroundColor:'#0f172a'}}></div>
                </div>
                <div style={{flex:1, borderRadius:32, backgroundColor:'#ffffff', overflow:'hidden', display:'flex', flexDirection:'column'}}>
                  {frame>=s1 && frame<s3 && (
                    <div style={{flex:1, backgroundColor:'#0f172a', display:'flex', alignItems:'center', justifyContent:'center', position:'relative'}}>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:64, marginBottom:16}}>📸</div>
                        <div style={{fontSize:16, color:'#94a3b8', fontFamily:'system-ui'}}>Tap to capture evidence</div>
                      </div>
                      <div style={{position:'absolute', bottom:40, left:'50%', transform:'translateX(-50%)', display:'flex', gap:20}}>
                        <div style={{width:56, height:56, borderRadius:'50%', border:'3px solid #ffffff', display:'flex', alignItems:'center', justifyContent:'center'}}>
                          <div style={{width:44, height:44, borderRadius:'50%', backgroundColor:'#dc2626'}}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  {frame>=s3 && frame<s5 && (
                    <div style={{flex:1, padding:20, overflow:'auto'}}>
                      <h3 style={{fontSize:16, fontWeight:700, color:'#1e293b', marginBottom:16, fontFamily:'system-ui'}}>Evidence Photos</h3>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                        {photos.map((p,i) => (
                          <div key={p.name} style={{
                            borderRadius:12, overflow:'hidden', border:'1px solid #e2e8f0',
                            opacity:interpolate(frame-s3-i*15,[0,20],[0,1],{extrapolateLeft:'clamp'})
                          }}>
                            <div style={{height:100, backgroundColor:'#e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32}}>🖼</div>
                            <div style={{padding:8}}>
                              <div style={{fontSize:11, fontWeight:600, color:'#334155'}}>{p.tag}</div>
                              <div style={{fontSize:10, color:'#94a3b8'}}>{p.room}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{
                        marginTop:16, padding:12, borderRadius:8, backgroundColor:'#f0fdf4', border:'1px solid #bbf7d0',
                        display:'flex', alignItems:'center', gap:8
                      }}>
                        <span>✅</span>
                        <span style={{fontSize:12, color:'#166534'}}>All photos synced — 4 uploaded</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s1&&frame<s2?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={960} startY={700} endX={960} endY={650} startFrame={s1+20} endFrame={s1+50} clickFrame={s1+48} />
        <HighlightBox x={900} y={620} width={120} height={120} startFrame={s1+45} endFrame={s1+80} />
        <Annotation text="Tap the shutter to capture high-res evidence photos." x={720} y={580} startFrame={s1+40} endFrame={s1+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s2&&frame<s3?1:0, pointerEvents:'none'}}>
        <Annotation text="Photos are auto-tagged with room, timestamp, and GPS." x={650} y={500} startFrame={s2+20} endFrame={s2+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s3&&frame<s4?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={800} startY={400} endX={900} endY={300} startFrame={s3+15} endFrame={s3+45} clickFrame={s3+43} />
        <Annotation text="Review, tag, and organise all evidence in one place." x={650} y={270} startFrame={s3+35} endFrame={s3+130} />
      </div>
      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}><OutroSlide title="Evidence that holds up in any claim." subtitle="RestoreAssist Mobile" /></div>
    </AbsoluteFill>
  );
};
