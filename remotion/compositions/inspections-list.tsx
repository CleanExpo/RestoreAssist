// @ts-nocheck
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const InspectionsList = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0, s0+20, s1-20, s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s5, s5+15, s5-15, s5], [0,1,1,1]);
  const mainOpacity = interpolate(frame, [s1-10, s1], [0,1]);

  const inspections = [
    {id:'INS-2026-0089', client:'Mrs Jane Smith', property:'42 Example St, Sydney', status:'In Progress', statusColor:'#f59e0b', date:'2 Jun 2026', team:'Phill McGurk'},
    {id:'INS-2026-0088', client:'Mr John Davis', property:'15 Ocean Rd, Bondi', status:'Report Ready', statusColor:'#059669', date:'1 Jun 2026', team:'Sarah Chen'},
    {id:'INS-2026-0087', client:'Supreme Cleaning', property:'200 King St, Melbourne', status:'Completed', statusColor:'#64748b', date:'30 May 2026', team:'Mike Torres'},
    {id:'INS-2026-0086', client:'Restoration Pro', property:'88 Bridge St, Brisbane', status:'In Progress', statusColor:'#f59e0b', date:'28 May 2026', team:'Phill McGurk'},
    {id:'INS-2026-0085', client:'Elite Services', property:'5 Park Ave, Perth', status:'Completed', statusColor:'#64748b', date:'25 May 2026', team:'Sarah Chen'},
  ];

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
                    <h1 style={{fontSize:28, fontWeight:700, color:'#1e293b', margin:0, fontFamily:'system-ui'}}>Inspections</h1>
                    <p style={{fontSize:14, color:'#64748b', marginTop:4, fontFamily:'system-ui'}}>24 total · 8 in progress · 6 report ready · 10 completed</p>
                  </div>
                  <div style={{display:'flex', gap:12}}>
                    <button style={{padding:'10px 20px', borderRadius:8, border:'1px solid #e2e8f0', backgroundColor:'#fff', color:'#334155', fontSize:14, fontWeight:600}}>Export</button>
                    <button style={{padding:'10px 20px', borderRadius:8, border:'none', backgroundColor:'#dc2626', color:'#fff', fontSize:14, fontWeight:600}}>+ New Inspection</button>
                  </div>
                </div>
                <div style={{display:'flex', gap:12, marginBottom:20}}>
                  {['All','In Progress','Report Ready','Completed'].map((f,i) => (
                    <span key={f} style={{padding:'8px 16px', borderRadius:8, backgroundColor:i===0?'#dc2626':'#f1f5f9', color:i===0?'#fff':'#64748b', fontSize:13, fontWeight:600, cursor:'pointer'}}>{f}</span>
                  ))}
                </div>
                <table style={{width:'100%', borderCollapse:'collapse', fontFamily:'system-ui'}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #e2e8f0'}}>
                      {['ID','Client','Property','Status','Date','Assigned','Actions'].map(h => (
                        <th key={h} style={{textAlign:'left', padding:'12px', fontSize:12, fontWeight:600, color:'#64748b', textTransform:'uppercase'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((row,i) => (
                      <tr key={row.id} style={{borderBottom:'1px solid #f1f5f9', opacity:interpolate(frame-s1-i*10,[0,15],[0,1],{extrapolateLeft:'clamp'})}}>
                        <td style={{padding:14, fontSize:13, fontWeight:600, color:'#334155'}}>{row.id}</td>
                        <td style={{padding:14, fontSize:13, color:'#475569'}}>{row.client}</td>
                        <td style={{padding:14, fontSize:13, color:'#475569'}}>{row.property}</td>
                        <td style={{padding:14}}><span style={{padding:'4px 12px', borderRadius:12, backgroundColor:row.statusColor+'20', color:row.statusColor, fontSize:12, fontWeight:600}}>{row.status}</span></td>
                        <td style={{padding:14, fontSize:13, color:'#64748b'}}>{row.date}</td>
                        <td style={{padding:14, fontSize:13, color:'#475569'}}>{row.team}</td>
                        <td style={{padding:14}}><span style={{cursor:'pointer', color:'#dc2626', fontWeight:600, fontSize:13}}>Open →</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s1&&frame<s2?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={100} startY={250} endX={100} endY={250} startFrame={s1+20} endFrame={s1+40} clickFrame={s1+38} />
        <HighlightBox x={20} y={230} width={220} height={44} startFrame={s1+35} endFrame={s1+55} />
        <Annotation text="The Inspections hub gives you full visibility across every job." x={300} y={240} startFrame={s1+30} endFrame={s1+120} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s2&&frame<s3?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={400} startY={200} endX={600} endY={200} startFrame={s2+15} endFrame={s2+45} clickFrame={s2+43} />
        <Annotation text="Filter by status to see exactly what needs attention." x={450} y={170} startFrame={s2+35} endFrame={s2+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s3&&frame<s4?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={600} startY={200} endX={800} endY={300} startFrame={s3+15} endFrame={s3+45} clickFrame={s3+43} />
        <HighlightBox x={750} y={280} width={120} height={40} startFrame={s3+40} endFrame={s3+70} />
        <Annotation text="Assign team members and track accountability per job." x={550} y={260} startFrame={s3+35} endFrame={s3+130} />
      </div>
      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}><OutroSlide title="Every inspection. Every status. Always in view." subtitle="RestoreAssist" /></div>
    </AbsoluteFill>
  );
};
