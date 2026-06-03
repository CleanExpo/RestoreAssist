// @ts-nocheck
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const TeamManagement = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0,s0+20,s1-20,s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s4,s4+15,s5-15,s5], [0,1,1,1]);
  const mainOpacity = interpolate(frame, [s1-10,s1], [0,1]);

  const team = [
    {name:'Phill McGurk', role:'Lead Technician', status:'On-Site', jobs:8, avatar:'PM', color:'#dc2626'},
    {name:'Sarah Chen', role:'Project Manager', status:'Office', jobs:12, avatar:'SC', color:'#2563eb'},
    {name:'Mike Torres', role:'Field Technician', status:'On-Site', jobs:6, avatar:'MT', color:'#059669'},
    {name:'Emma Wilson', role:'Admin & Billing', status:'Office', jobs:15, avatar:'EW', color:'#8b5cf6'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute', inset:0, opacity:introOpacity, zIndex:introOpacity>0?100:0}}><IntroSlide title={title} /></div>
      <div style={{position:'absolute', inset:0, opacity:mainOpacity, zIndex:10}}>
        <ScreenContainer>
          <div style={{display:'flex', width:'100%', height:'100%'}}>
            <Sidebar activeItem="clients" frame={frame} startFrame={s1} endFrame={s2} />
            <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
              <TopBar />
              <div style={{padding:32, flex:1, overflow:'auto'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
                  <div>
                    <h1 style={{fontSize:26, fontWeight:700, color:'#1e293b', margin:0, fontFamily:'system-ui'}}>Team</h1>
                    <p style={{fontSize:14, color:'#64748b', marginTop:4}}>4 members · 3 on-site · 1 in office</p>
                  </div>
                  <button style={{padding:'10px 20px', borderRadius:8, border:'none', backgroundColor:'#dc2626', color:'#fff', fontSize:14, fontWeight:600}}>+ Invite Member</button>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:16}}>
                  {team.map((member,i) => (
                    <div key={member.name} style={{
                      padding:24, borderRadius:12, backgroundColor:'#ffffff', border:'1px solid #e2e8f0',
                      opacity:interpolate(frame-s1-i*12,[0,15],[0,1],{extrapolateLeft:'clamp'})
                    }}>
                      <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:16}}>
                        <div style={{
                          width:48, height:48, borderRadius:'50%', backgroundColor:member.color,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:16, fontWeight:700, color:'#fff'
                        }}>{member.avatar}</div>
                        <div>
                          <div style={{fontSize:16, fontWeight:700, color:'#334155', fontFamily:'system-ui'}}>{member.name}</div>
                          <div style={{fontSize:13, color:'#64748b'}}>{member.role}</div>
                        </div>
                        <span style={{
                          marginLeft:'auto', padding:'4px 12px', borderRadius:12,
                          backgroundColor:member.status==='On-Site'?'#dcfce7':'#f1f5f9',
                          color:member.status==='On-Site'?'#166534':'#64748b', fontSize:12, fontWeight:600
                        }}>{member.status}</span>
                      </div>
                      <div style={{display:'flex', gap:24}}>
                        <div>
                          <div style={{fontSize:12, color:'#94a3b8', marginBottom:2}}>Active Jobs</div>
                          <div style={{fontSize:20, fontWeight:800, color:member.color}}>{member.jobs}</div>
                        </div>
                        <div>
                          <div style={{fontSize:12, color:'#94a3b8', marginBottom:2}}>Completion</div>
                          <div style={{fontSize:20, fontWeight:800, color:'#334155'}}>{Math.round(member.jobs*10)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s1&&frame<s2?1:0, pointerEvents:'none'}}>
        <Annotation text="Manage your whole crew — see who\'s where and on what." x={650} y={200} startFrame={s1+20} endFrame={s1+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s2&&frame<s3?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={600} startY={400} endX={900} endY={300} startFrame={s2+15} endFrame={s2+45} />
        <HighlightBox x={850} y={270} width={140} height={40} startFrame={s2+40} endFrame={s2+70} />
        <Annotation text="On-site vs office status updated in real time." x={650} y={250} startFrame={s2+35} endFrame={s2+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s3&&frame<s4?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={900} startY={300} endX={1100} endY={600} startFrame={s3+15} endFrame={s3+45} clickFrame={s3+43} />
        <HighlightBox x={1080} y={580} width={140} height={40} startFrame={s3+40} endFrame={s3+70} />
        <Annotation text="Invite new team members and set permissions in seconds." x={850} y={560} startFrame={s3+35} endFrame={s3+150} />
      </div>
      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}><OutroSlide title="Your team. coordinated." subtitle="RestoreAssist Team" /></div>
    </AbsoluteFill>
  );
};
