import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const DataImport = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 540, 570], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [550, 580, 1650, 1680], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1660, 1710, 1950, 1980], [0, 1, 1, 1]);

  const sources = [
    {title:'CSV / Excel',desc:'Import contacts, job lists, or equipment inventory. Column mapping wizard. Preview before commit.'},
    {title:'Xero / MYOB',desc:'Two-click OAuth connection. Pull client list and chart of accounts. Sync ongoing automatically.'},
    {title:'QuickBooks',desc:'Full QBO API integration. Map classes, customers, and items. Bi-directional sync.'},
    {title:'ServiceM8',desc:'Import active jobs and client database. Map custom fields. Preserve job history.'},
    {title:'Ascora',desc:'Export from Ascora, import to RestoreAssist. Job status and notes migrate cleanly.'},
    {title:'Existing Database',desc:'Custom SQL export. We provide schema mapping guide. Support team assists with complex migrations.'},
  ];

  const validation = [
    {label:'Duplicate detection',desc:'Identify existing records before import. Merge or skip options.'},
    {label:'Format validation',desc:'Phone numbers, emails, dates checked against regex. Highlights errors.'},
    {label:'Preview mode',desc:'See exactly what will be created before committing. Row-by-row review.'},
    {label:'Rollback ready',desc:'Full transaction. If import fails, nothing is saved. Safe to retry.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Data Import" subtitle="Your old data. Your new system. Zero loss." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:18}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Import Sources</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
              {sources.map(s => (
                <div key={s.title} style={{padding:18,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.25)',display:'flex',flexDirection:'column'}}>
                  <div style={{fontSize:15,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{s.title}</div>
                  <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter',lineHeight:1.4}}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:6}}>Validation Safeguards</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {validation.map(v => (
                <div key={v.label} style={{padding:14,backgroundColor:'#1C2E47',borderRadius:8,border:'1px solid #8A6B4E'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:3}}>{v.label}</div>
                  <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter'}}>{v.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Migration made simple." subtitle="We have done this hundreds of times." />
      </div>
    </AbsoluteFill>
  );
};
