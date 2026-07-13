import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const BulkOperations = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 540, 570], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [550, 580, 1650, 1680], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1660, 1710, 1950, 1980], [0, 1, 1, 1]);

  const ops = [
    {title:'Bulk Status Update',desc:'Select 20+ inspections. Change status from "In Progress" to "Complete" in one action. Audit log records who and when.'},
    {title:'Mass Assignment',desc:'Reassign 50 jobs from technician A to technician B. Automatic email notification to affected staff.'},
    {title:'Batch Export',desc:'Export 100 PDF reports as a single ZIP. Each file named with job number and date. Ready for portal upload.'},
    {title:'CSV Import/Export',desc:'Import client list from spreadsheet. Map columns to fields. Validate before commit. Export filtered views to Excel.'},
  ];

  const stats = [
    {label:'Time saved',value:'85%',desc:'vs doing one by one'},
    {label:'Error rate',value:'0.3%',desc:'with validation enabled'},
    {label:'Records/hr',value:'2,400',desc:'bulk updates processed'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Bulk Operations" subtitle="Do more in less time. Without breaking things." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:20}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Bulk Actions</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              {ops.map(o => (
                <div key={o.title} style={{padding:24,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:17,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:8}}>{o.title}</div>
                  <div style={{fontSize:13,color:'#D4A574',fontFamily:'Inter',lineHeight:1.5}}>{o.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:6}}>Performance</div>
            <div style={{display:'flex',gap:20,justifyContent:'center'}}>
              {stats.map(s => (
                <div key={s.label} style={{textAlign:'center',padding:'16px 30px',backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid #8A6B4E'}}>
                  <div style={{fontSize:32,fontWeight:800,color:'#8A6B4E',fontFamily:'Inter'}}>{s.value}</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#FFF',fontFamily:'Inter'}}>{s.label}</div>
                  <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter'}}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Scale without the chaos." subtitle="Bulk done right." />
      </div>
    </AbsoluteFill>
  );
};
