// @ts-nocheck
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const ComplianceChecklists = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0,s0+20,s1-20,s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s4,s4+15,s5-15,s5], [0,1,1,1]);
  const mainOpacity = interpolate(frame, [s1-10,s1], [0,1]);

  const items = [
    {id:'1', task:'PPE inspected and worn', required:true, completed:true},
    {id:'2', task:'Site hazard assessment completed', required:true, completed:true},
    {id:'3', task:'Containment barriers installed', required:true, completed:true},
    {id:'4', task:'Power isolated in affected zone', required:false, completed:true},
    {id:'5', task:'Asbestos clearance obtained', required:true, completed:false},
    {id:'6', task:'Moisture baseline recorded', required:true, completed:true},
    {id:'7', task:'Photo documentation started', required:true, completed:true},
    {id:'8', task:'Client briefed on scope', required:true, completed:false},
    {id:'9', task:'Waste disposal plan confirmed', required:false, completed:false},
    {id:'10', task:'Air quality baseline taken', required:true, completed:true},
  ];

  const progress = items.filter(i => i.completed).length;
  const total = items.length;
  const percent = Math.round((progress / total) * 100);

  return (
    <AbsoluteFill>
      <div style={{position:'absolute', inset:0, opacity:introOpacity, zIndex:introOpacity>0?100:0}}><IntroSlide title={title} /></div>
      <div style={{position:'absolute', inset:0, opacity:mainOpacity, zIndex:10}}>
        <ScreenContainer>
          <div style={{display:'flex', width:'100%', height:'100%'}}>
            <Sidebar activeItem="inspections" frame={frame} startFrame={s1} endFrame={s2} />
            <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
              <TopBar />
              <div style={{padding:32, flex:1, overflow:'auto'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
                  <div>
                    <h1 style={{fontSize:26, fontWeight:700, color:'#1e293b', margin:0, fontFamily:'system-ui'}}>Safety Compliance Checklist</h1>
                    <p style={{fontSize:14, color:'#64748b', marginTop:4}}>INS-2026-0089 · Water Damage · Category 1</p>
                  </div>
                  <div style={{
                    padding:'12px 24px', borderRadius:12, backgroundColor:'#fef2f2', border:'1px solid #fecaca',
                    display:'flex', alignItems:'center', gap:12
                  }}>
                    <div style={{fontSize:28, fontWeight:800, color:'#dc2626'}}>{percent}%</div>
                    <div style={{fontSize:13, color:'#7f1d1d', fontFamily:'system-ui'}}>{progress}/{total} completed</div>
                  </div>
                </div>
                <div style={{backgroundColor:'#ffffff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden'}}>
                  {items.map((item,i) => (
                    <div key={item.id} style={{
                      display:'flex', alignItems:'center', padding:'14px 20px',
                      borderBottom:'1px solid #f1f5f9',
                      opacity:interpolate(frame-s1-i*8,[0,15],[0,1],{extrapolateLeft:'clamp'})
                    }}>
                      <div style={{
                        width:24, height:24, borderRadius:'50%', border:'2px solid ' + (item.completed?'#059669':'#e2e8f0'),
                        backgroundColor:item.completed?'#059669':'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        marginRight:14, fontSize:12, color:'#fff'
                      }}>{item.completed && '✓'}</div>
                      <div style={{flex:1, fontSize:14, color:item.completed?'#64748b':'#334155', fontFamily:'system-ui', textDecoration:item.completed?'line-through':'none'}}>{item.task}</div>
                      {item.required && <span style={{padding:'2px 8px', borderRadius:4, backgroundColor:'#fef2f2', color:'#dc2626', fontSize:10, fontWeight:700, marginRight:12}}>REQUIRED</span>}
                      {!item.completed && <button style={{padding:'6px 14px', borderRadius:6, border:'1px solid #e2e8f0', backgroundColor:'#fff', color:'#334155', fontSize:12, fontWeight:600, cursor:'pointer'}}>Mark Done</button>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s1&&frame<s2?1:0, pointerEvents:'none'}}>
        <Annotation text="Every inspection starts with a safety checklist — no exceptions." x={650} y={200} startFrame={s1+20} endFrame={s1+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s2&&frame<s3?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={600} startY={500} endX={1050} endY={350} startFrame={s2+15} endFrame={s2+45} clickFrame={s2+43} />
        <HighlightBox x={1020} y={320} width={100} height={36} startFrame={s2+40} endFrame={s2+70} />
        <Annotation text="Mark items complete as you work — real-time progress tracking." x={750} y={300} startFrame={s2+35} endFrame={s2+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s3&&frame<s4?1:0, pointerEvents:'none'}}>
        <Annotation text="Required items flagged in red — cannot finalise report until complete." x={600} y={450} startFrame={s3+20} endFrame={s3+130} />
      </div>
      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}><OutroSlide title="Safety first. Compliance always." subtitle="RestoreAssist" /></div>
    </AbsoluteFill>
  );
};
