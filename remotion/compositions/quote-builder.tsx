import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const QuoteBuilder = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0,d1,d2,d3,d4] = stepDurations;
  const s0=0,s1=s0+d0,s2=s1+d1,s3=s2+d2,s4=s3+d3,s5=s4+d4;

  const introOpacity = interpolate(frame, [s0,s0+20,s1-20,s1], [1,1,1,0]);
  const outroOpacity = interpolate(frame, [s5, s5 + 10, s5 + 70, s5 + 100], [0,1,1,1]);
  const mainOpacity = interpolate(frame, [s1-10,s1], [0,1]);

  const lineItems = [
    {desc:'Water extraction — Category 1', qty:1, unit:'job', rate:450, total:450},
    {desc:'Air mover rental (x6)', qty:6, unit:'day', rate:35, total:210},
    {desc:'Dehumidifier rental (x2)', qty:2, unit:'day', rate:85, total:170},
    {desc:'Moisture monitoring', qty:5, unit:'visit', rate:120, total:600},
    {desc:'Labour — Technician', qty:16, unit:'hr', rate:75, total:1200},
  ];

  const subtotal = lineItems.reduce((a,b) => a + b.total, 0);
  const gst = subtotal * 0.10;
  const grandTotal = subtotal + gst;

  return (
    <AbsoluteFill>
      <div style={{position:'absolute', inset:0, opacity:introOpacity, zIndex:introOpacity>0?100:0}}><IntroSlide title={title} /></div>
      <div style={{position:'absolute', inset:0, opacity:mainOpacity, zIndex:10}}>
        <ScreenContainer>
          <div style={{padding:40, width:'100%', height:'100%', backgroundColor:'#0A0A0A', overflow:'auto'}}>
            <div style={{maxWidth:800, margin:'0 auto', backgroundColor:'#ffffff', borderRadius:16, border:'1px solid #2A3A55', padding:40}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24}}>
                <div>
                  <h1 style={{fontSize:24, fontWeight:700, color:'#1C2E47', margin:0}}>Quote</h1>
                  <p style={{fontSize:13, color:'#D4A574', marginTop:4}}>QTE-2026-0042 · 2 Jun 2026</p>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:15, fontWeight:700, color:'#1C2E47'}}>CleanExpo Restoration</div>
                  <div style={{fontSize:13, color:'#8A6B4E'}}>ABN 12 345 678 901</div>
                </div>
              </div>
              <div style={{padding:16, borderRadius:8, backgroundColor:'#0A0A0A', marginBottom:24}}>
                <div style={{fontSize:14, fontWeight:600, color:'#1C2E47', marginBottom:4}}>Prepared For</div>
                <div style={{fontSize:14, color:'#1C2E47'}}>Mrs Jane Smith</div>
                <div style={{fontSize:13, color:'#D4A574'}}>42 Example Street, Sydney NSW 2000</div>
              </div>
              <table style={{width:'100%', borderCollapse:'collapse', marginBottom:24}}>
                <thead>
                  <tr style={{borderBottom:'1px solid #2A3A55'}}>
                    {['Description','Qty','Unit','Rate','Total'].map(h => (
                      <th key={h} style={{textAlign:h==='Description'?'left':'right', padding:'10px', fontSize:12, fontWeight:600, color:'#8A6B4E', textTransform:'uppercase'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item,i) => (
                    <tr key={item.desc} style={{borderBottom:'1px solid #f1f5f9', opacity:interpolate(frame-s1-i*12,[0,20],[0,1],{extrapolateLeft:'clamp'})}}>
                      <td style={{padding:'12px 10px', fontSize:14, color:'#1C2E47'}}>{item.desc}</td>
                      <td style={{padding:'12px 10px', fontSize:14, color:'#1C2E47', textAlign:'right'}}>{item.qty}</td>
                      <td style={{padding:'12px 10px', fontSize:14, color:'#1C2E47', textAlign:'right'}}>{item.unit}</td>
                      <td style={{padding:'12px 10px', fontSize:14, color:'#1C2E47', textAlign:'right'}}>${item.rate}</td>
                      <td style={{padding:'12px 10px', fontSize:14, fontWeight:600, color:'#1C2E47', textAlign:'right'}}>${item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{borderTop:'2px solid #2A3A55', paddingTop:16, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8}}>
                <div style={{display:'flex', justifyContent:'space-between', width:200, fontSize:14, color:'#1C2E47'}}><span>Subtotal</span><span>${subtotal}</span></div>
                <div style={{display:'flex', justifyContent:'space-between', width:200, fontSize:14, color:'#1C2E47'}}><span>GST (10%)</span><span>${gst.toFixed(2)}</span></div>
                <div style={{display:'flex', justifyContent:'space-between', width:200, fontSize:18, fontWeight:800, color:'#1C2E47', borderTop:'1px solid #2A3A55', paddingTop:8, marginTop:4}}>
                  <span>Total</span><span>${grandTotal.toFixed(2)}</span>
                </div>
              </div>
              <div style={{display:'flex', gap:12, marginTop:24, justifyContent:'flex-end'}}>
                <button style={{padding:'12px 24px', borderRadius:8, border:'1px solid #2A3A55', backgroundColor:'#fff', color:'#1C2E47', fontSize:14, fontWeight:600}}>Save Draft</button>
                <button style={{padding:'12px 24px', borderRadius:8, border:'none', backgroundColor:'#8A6B4E', color:'#fff', fontSize:14, fontWeight:600}}>Send to Client</button>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s1&&frame<s2?1:0, pointerEvents:'none'}}>
        <Annotation text="Build quotes directly from your inspection scope — no re-typing." x={650} y={200} startFrame={s1+20} endFrame={s1+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s2&&frame<s3?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={800} startY={500} endX={900} endY={300} startFrame={s2+15} endFrame={s2+45} clickFrame={s2+43} />
        <HighlightBox x={700} y={270} width={120} height={40} startFrame={s2+40} endFrame={s2+70} />
        <Annotation text="Line items auto-fill from your inspection checklist." x={550} y={240} startFrame={s2+35} endFrame={s2+130} />
      </div>
      <div style={{position:'absolute', inset:0, zIndex:1000, opacity:frame>=s3&&frame<s4?1:0, pointerEvents:'none'}}>
        <AnimatedMouse startX={900} startY={300} endX={1000} endY={600} startFrame={s3+15} endFrame={s3+45} clickFrame={s3+43} />
        <HighlightBox x={960} y={570} width={140} height={44} startFrame={s3+40} endFrame={s3+70} />
        <Annotation text="Send the quote to your client for approval — tracked in one click." x={750} y={550} startFrame={s3+35} endFrame={s3+150} />
      </div>
      <div style={{position:'absolute', inset:0, opacity:outroOpacity, zIndex:outroOpacity>0?100:0}}><OutroSlide title="Quotes that win jobs." subtitle="RestoreAssist" /></div>
    </AbsoluteFill>
  );
};
