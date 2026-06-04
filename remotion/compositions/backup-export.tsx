import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const BackupExport = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 540, 570], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [550, 580, 1650, 1680], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1660, 1710, 1950, 1980], [0, 1, 1, 1]);

  const exports = [
    {format:'PDF Report',desc:'Full inspection report with photos, readings, and annotations. Professional layout. Signed and dated.'},
    {format:'CSV Data',desc:'Raw data export for Excel analysis. All fields, all inspections. Filterable and sortable.'},
    {format:'JSON Archive',desc:'Machine-readable full archive. Includes metadata, audit logs, and file hashes.'},
    {format:'ZIP Bundle',desc:'All photos, documents, and reports in one ZIP. Organised by job number and date.'},
  ];

  const schedule = [
    {label:'Daily',desc:'Automated incremental backup every 24 hours. 7-day rolling retention.'},
    {label:'Weekly',desc:'Full snapshot every Sunday 2 AM. 4-week rolling retention.'},
    {label:'Monthly',desc:'Archive snapshot first of month. 12-month rolling retention.'},
    {label:'On-demand',desc:'One-click full export anytime. No limits. Your data is yours.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Backup & Export" subtitle="Your data. Your control. Always accessible." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:18}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Export Formats</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {exports.map(e => (
                <div key={e.format} style={{padding:20,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.25)'}}>
                  <div style={{fontSize:15,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{e.format}</div>
                  <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter',lineHeight:1.4}}>{e.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:6}}>Scheduled Backups</div>
            <div style={{display:'flex',gap:12}}>
              {schedule.map(s => (
                <div key={s.label} style={{flex:1,padding:16,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid #8A6B4E'}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:4}}>{s.label}</div>
                  <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter'}}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',fontSize:13,color:'#D4A574',fontFamily:'Inter',marginTop:'auto'}}>
              All backups encrypted at rest (AES-256). Download links expire in 24 hours.
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Your data is yours. Always." subtitle="Export, backup, migrate. No restrictions." />
      </div>
    </AbsoluteFill>
  );
};
