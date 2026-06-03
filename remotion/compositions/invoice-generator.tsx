import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const InvoiceGenerator = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0,s0+20,s1-20,s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s4, s4 + 10, s4 + 70, s4 + 100], [0,1,1,1]);
  const mainOpacity = interpolate(frame, [s1-10,s1], [0,1]);

  const invoices = [
    {id:'INV-2026-0124', client:'Mrs Jane Smith', amount:'$4,850.00', status:'Paid', date:'2 Jun 2026', color:'#059669'},
    {id:'INV-2026-0123', client:'Mr John Davis', amount:'$8,200.00', status:'Pending', date:'1 Jun 2026', color:'#f59e0b'},
    {id:'INV-2026-0122', client:'Supreme Cleaning', amount:'$2,400.00', status:'Overdue', date:'15 May 2026', color:'#8A6B4E'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute', inset:0, opacity:introOpacity, zIndex:introOpacity>0?100:0}}><IntroSlide title={title} /></div>
      <div style={{position:'absolute', inset:0, opacity:mainOpacity, zIndex:10}}>
        <ScreenContainer>
          <div style={{display:'flex', width:'100%', height:'100%'}}>
            <Sidebar activeItem="invoices" frame={frame} startFrame={s1} endFrame={s2} />
            <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
              <TopBar />
              <div style={{padding:32, flex:1, overflow:'auto'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
                  <div>
                    <h1 style={{fontSize:28, fontWeight:700, color:'#1C2E47', margin:0, fontFamily:'Inter'}}>Invoices</h1>
                    <p style={{fontSize:14, color:'#8A6B4E', marginTop:4}}>$15,450 total · $8,200 outstanding</p>
                  </div>
                  <button style={{padding:'10px 20px', borderRadius:8, border:'none', backgroundColor:'#8A6B4E', color:'#fff', fontSize:14, fontWeight:600}}>+ New Invoice</button>
                </div>
                <div style={{display:'flex', gap:16, marginBottom:24}}>
                  {[{l:'Total Revenue', v:'$15,450', c:'#1C2E47'},{l:'Paid', v:'$4,850', c:'#059669'},{l:'Outstanding', v:'$8,200', c:'#f59e0b'},{l:'Overdue', v:'$2,400', c:'#8A6B4E'}].map((stat,i) => (
                    <div key={stat.l} style={{flex:1, padding:20, borderRadius:12, backgroundColor:'#ffffff', border:'1px solid #2A3A55', opacity:interpolate(frame-s1-i*10,[0,15],[0,1],{extrapolateLeft:'clamp'})}}>
                      <div style={{fontSize:12, color:'#D4A574', textTransform:'uppercase', fontWeight:600, marginBottom:4}}>{stat.l}</div>
                      <div style={{fontSize:28, fontWeight:800, color:stat.c}}>{stat.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{backgroundColor:'#ffffff', borderRadius:12, border:'1px solid #2A3A55', overflow:'hidden'}}>
                  {invoices.map((inv,i) => (
                    <div key={inv.id} style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 24px',
                      borderBottom:'1px solid #f1f5f9',
                      opacity:interpolate(frame-s1-i*15,[0,15],[0,1],{extrapolateLeft:'clamp'})
                    }}>
                      <div>
                        <div style={{fontSize:14, fontWeight:600, color:'#1C2E47', fontFamily:'Inter'}}>{inv.id}</div>
                        <div style={{fontSize:13, color:'#8A6B4E', marginTop:2}}>{inv.client}</div>
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:16}}>
                        <div style={{fontSize:15, fontWeight:700, color:'#1C2E47', fontFamily:'Inter'}}>{inv.amount}</div>
                        <span style={{padding:'4px 12px', borderRadius:12, backgroundColor:inv.color+'20', color:inv.color, fontSize:12, fontWeight:600}}>{inv.status}</span>
                        <button style={{padding:'8px 16px', borderRadius:6, border:'1px solid #2A3A55', backgroundColor:'#fff', color:'#1C2E47', fontSize:12, fontWeight:600, cursor:'pointer'}}>View</button>
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
        <AnimatedMouse startX={100} startY={400} endX={100} endY={400} startFrame={s1+20} endFrame={s1+40} clickFrame={s1+38} />
        <HighlightBox x={20} y={380} width={220} height={44} startFrame={s1+35} endFrame={s1+55} />
        <Annotation text="Track all invoices from one central dashboard." x={300} y={390} startFrame={s1+30} endFrame={s1+120} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s2&&frame<s3?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={500} startY={300} endX={900} endY={300} startFrame={s2+15} endFrame={s2+45} clickFrame={s2+43} />
        <HighlightBox x={700} y={270} width={180} height={44} startFrame={s2+40} endFrame={s2+70} />
        <Annotation text="See paid, outstanding, and overdue at a glance." x={550} y={240} startFrame={s2+35} endFrame={s2+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s3&&frame<s4?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={900} startY={300} endX={1000} endY={500} startFrame={s3+15} endFrame={s3+45} clickFrame={s3+43} />
        <HighlightBox x={960} y={470} width={140} height={44} startFrame={s3+40} endFrame={s3+70} />
        <Annotation text="Convert approved quotes to invoices in one click." x={750} y={450} startFrame={s3+35} endFrame={s3+150} />
      </div>
      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}><OutroSlide title="Get paid faster." subtitle="RestoreAssist Invoicing" /></div>
    </AbsoluteFill>
  );
};
