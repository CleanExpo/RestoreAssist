// @ts-nocheck
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const AnalyticsOverview = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0,s0+20,s1-20,s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s4,s4+15,s5-15,s5], [0,1,1,1]);
  const mainOpacity = interpolate(frame, [s1-10,s1], [0,1]);

  const months = ['Jan','Feb','Mar','Apr','May','Jun'];
  const revenue = [28000,32000,35000,38000,41200,43200];
  const inspections = [18,20,22,24,26,24];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute', inset:0, opacity:introOpacity, zIndex:introOpacity>0?100:0}}><IntroSlide title={title} /></div>
      <div style={{position:'absolute', inset:0, opacity:mainOpacity, zIndex:10}}>
        <ScreenContainer>
          <div style={{display:'flex', width:'100%', height:'100%'}}>
            <Sidebar activeItem="analytics" frame={frame} startFrame={s1} endFrame={s2} />
            <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
              <TopBar />
              <div style={{padding:32, flex:1, overflow:'auto'}}>
                <h1 style={{fontSize:26, fontWeight:700, color:'#1e293b', margin:'0 0 24px', fontFamily:'system-ui'}}>Business Analytics</h1>
                <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16, marginBottom:24}}>
                  {[{l:'Revenue YTD',v:'$217,400',c:'#1e293b'},{l:'Avg Deal',v:'$4,850',c:'#059669'},{l:'Win Rate',v:'78%',c:'#2563eb'},{l:'Active Jobs',v:'24',c:'#dc2626'}].map((stat,i) => (
                    <div key={stat.l} style={{
                      padding:20, borderRadius:12, backgroundColor:'#ffffff', border:'1px solid #e2e8f0',
                      opacity:interpolate(frame-s1-i*10,[0,15],[0,1],{extrapolateLeft:'clamp'})
                    }}>
                      <div style={{fontSize:12, color:'#94a3b8', marginBottom:4, fontWeight:600, textTransform:'uppercase'}}>{stat.l}</div>
                      <div style={{fontSize:28, fontWeight:800, color:stat.c}}>{stat.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex', gap:20}}>
                  <div style={{flex:1, padding:24, borderRadius:12, backgroundColor:'#ffffff', border:'1px solid #e2e8f0'}}>
                    <h3 style={{fontSize:15, fontWeight:700, color:'#334155', marginBottom:16}}>Revenue Trend</h3>
                    <div style={{display:'flex', alignItems:'flex-end', gap:8, height:200, paddingBottom:30, position:'relative'}}>
                      {revenue.map((r,i) => (
                        <div key={months[i]} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
                          <div style={{
                            width:'100%', height:Math.round((r/50000)*170), backgroundColor:'#dc2626', borderRadius:'4px 4px 0 0',
                            opacity:interpolate(frame-s1-i*12,[0,15],[0,1],{extrapolateLeft:'clamp'})
                          }}></div>
                          <span style={{fontSize:11, color:'#64748b'}}>{months[i]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{flex:1, padding:24, borderRadius:12, backgroundColor:'#ffffff', border:'1px solid #e2e8f0'}}>
                    <h3 style={{fontSize:15, fontWeight:700, color:'#334155', marginBottom:16}}>Inspections by Type</h3>
                    {[{l:'Water Damage',v:12,c:'#dc2626'},{l:'Fire & Smoke',v:6,c:'#f59e0b'},{l:'Mould',v:4,c:'#8b5cf6'},{l:'Storm',v:2,c:'#06b6d4'}].map((t,i) => (
                      <div key={t.l} style={{
                        display:'flex', alignItems:'center', gap:12, marginBottom:12,
                        opacity:interpolate(frame-s1-i*10,[0,15],[0,1],{extrapolateLeft:'clamp'})
                      }}>
                        <div style={{width:12, height:12, borderRadius:'50%', backgroundColor:t.c}}></div>
                        <span style={{flex:1, fontSize:14, color:'#475569'}}>{t.l}</span>
                        <span style={{fontSize:14, fontWeight:700, color:'#334155'}}>{t.v}</span>
                        <div style={{width:120, height:8, borderRadius:4, backgroundColor:'#f1f5f9'}}>
                          <div style={{width:(t.v/12)*120, height:'100%', borderRadius:4, backgroundColor:t.c}}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s1&&frame<s2?1:0, pointerEvents:'none'}}>
        <Annotation text="Track revenue, deal size, win rate, and active jobs — all in one view." x={650} y={200} startFrame={s1+20} endFrame={s1+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s2&&frame<s3?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={600} startY={400} endX={800} endY={350} startFrame={s2+15} endFrame={s2+45} />
        <Annotation text="Spot trends in your revenue and job volume over time." x={550} y={320} startFrame={s2+35} endFrame={s2+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s3&&frame<s4?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={800} startY={350} endX={1000} endY={450} startFrame={s3+15} endFrame={s3+45} />
        <Annotation text="See which hazard types drive your business — plan ahead." x={800} y={420} startFrame={s3+35} endFrame={s3+130} />
      </div>
      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}><OutroSlide title="Know your business. Grow with data." subtitle="RestoreAssist Analytics" /></div>
    </AbsoluteFill>
  );
};
