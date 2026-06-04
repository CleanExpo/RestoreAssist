import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const TemplateBuilder = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 540, 570], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [550, 580, 1650, 1680], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1660, 1710, 1950, 1980], [0, 1, 1, 1]);

  const sections = [
    {title:'Header Block',desc:'Company logo, job number, address, and date. Auto-populated from inspection metadata.'},
    {title:'Scope of Works',desc:'Editable rich-text section. Insert checklists, boilerplate clauses, or custom SOP references.'},
    {title:'Photo Gallery',desc:'Drag-and-drop photo ordering. Caption each image. Before/after pairs automatically paired.'},
    {title:'Moisture Readings',desc:'CSV import from Protimeter or Delmhorst. Auto-generates trend graphs and dry-goal compliance table.'},
    {title:'Equipment Deployed',desc:'Inventory list with serial numbers, calibration dates, and deployment timestamps.'},
    {title:'IICRC Compliance',desc:'Auto-cite S500 5th edition sections. One-click validation against current standard.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Report Template Builder" subtitle="Build once. Use forever. Customise per client." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:20}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Template Sections</div>
            <div style={{fontSize:14,color:'#D4A574',fontFamily:'Inter',marginTop:-14}}>Rearrange, toggle, or lock each section per template</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,flex:1}}>
              {sections.map(s => (
                <div key={s.title} style={{padding:20,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.25)',display:'flex',flexDirection:'column'}}>
                  <div style={{fontSize:15,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:8}}>{s.title}</div>
                  <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter',lineHeight:1.5}}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:10}}>
              {['Save as company default','Duplicate for client variant','Export as .rpt template','Share with team'].map(a => (
                <div key={a} style={{padding:'10px 20px',backgroundColor:'#8A6B4E',borderRadius:8,fontSize:13,color:'#FFF',fontFamily:'Inter',fontWeight:600}}>
                  {a}
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Reports that match your brand." subtitle="Professional every time." />
      </div>
    </AbsoluteFill>
  );
};
